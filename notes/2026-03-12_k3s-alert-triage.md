---
layout: default
title: K3s 叢集 Alert 清查與處置紀錄
category: infra
tags: [k3s, alerting]
---

# K3s 叢集 Alert 清查與處置紀錄

**日期：2026-03-12**
**環境：K3s v1.32.11 / 4 節點叢集 / Ubuntu 24.04**

---

## 清查方法

### 使用的診斷指令

```bash
# 1. 查看所有 Warning 事件（按時間排序）
kubectl get events --all-namespaces --sort-by='.lastTimestamp' --field-selector type=Warning

# 2. 找出非正常狀態的 Pod
kubectl get pods --all-namespaces --field-selector status.phase!=Running

# 3. 查看特定 Pod 的詳細錯誤
kubectl describe pod -n <namespace> <pod-name>
kubectl logs -n <namespace> <pod-name> --tail=20

# 4. 檢查 Longhorn volume 健康狀態
kubectl get volumes -n longhorn-system | grep fault

# 5. GitHub Dependabot alerts
gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[] | select(.state=="open")'

# 6. npm/pnpm 套件漏洞掃描
pnpm audit
```

---

## Alert 1：Dependabot 安全漏洞 (5 個)

### 發現方式

`pnpm audit` 回報 5 個漏洞，`gh api` 確認 GitHub Dependabot 同步顯示。

### 根因分析

專案 `package.json` 中的 `pnpm.overrides` 已有部分 override，但版本設定不夠高，且有遺漏：

| 套件 | 嚴重度 | 依賴鏈 | 原 Override | 修補版本 |
|------|--------|--------|-------------|----------|
| underscore | High | nodemailer-smtp-transport → httpntlm → underscore | `>=1.13.7` | `>=1.13.8` |
| tar (x2) | High | bcrypt → @mapbox/node-pre-gyp → tar | `>=7.5.9` | `>=7.5.11` |
| immutable | High | sass → immutable | (無) | `>=5.1.5` |
| @tootallnate/once | Low | jest-environment-jsdom → jsdom → http-proxy-agent → once | (無) | `>=3.0.1` |

**判斷依據：** 全部是 transitive dependencies，無法直接升級，需要透過 `pnpm.overrides` 強制指定版本。

### 處置

1. 更新 `package.json` 中的 `pnpm.overrides`，提高 underscore 和 tar 的最低版本
2. 新增 immutable 和 @tootallnate/once 的 override
3. `pnpm install` 重新安裝
4. `pnpm audit` 確認清零
5. commit + push + `make app-deploy` 部署

### 驗證

```bash
pnpm audit
# → No known vulnerabilities found

gh api repos/{owner}/{repo}/dependabot/alerts --jq '.[] | select(.state=="open")'
# → (空，全部自動關閉)
```

---

## Alert 2：Minio 殘留資源

### 發現方式

```bash
kubectl get events --all-namespaces --field-selector type=Warning
```

回報 `dfaa` namespace 的 `minio-cleanup-backups` CronJob pod 持續失敗：

```
Error: secret "minio-credentials" not found
```

### 根因分析

Minio 服務已停用並移除，但 CronJob 未一併清理，導致每週排程執行時因找不到 secret 而持續報錯。

**判斷依據：** 確認使用者表示 minio 已不再使用，屬於殘留資源。

### 處置

```bash
# 刪除 CronJob（會連帶清理相關的 Job 和 Pod）
kubectl delete cronjob minio-cleanup-backups -n dfaa

# 刪除 Grafana 中的 minio dashboard configmap
kubectl delete configmap grafana-dashboard-minio-storage-g47247d75m -n monitoring
```

### 教訓

停用服務時應同時清理所有相關資源：Deployment、CronJob、Secret、ConfigMap、PVC、Grafana Dashboard 等。可建立 checklist 避免遺漏。

---

## Alert 3：dfaa-kymo manual-backup 持續重試

### 發現方式

Warning 事件：

```
backup/manual-backup: Unknown cluster postgres-cluster, will retry in 30 seconds
```

### 根因分析

```bash
kubectl get backup.postgresql.cnpg.io manual-backup -n dfaa-kymo -o yaml
```

發現這是 2026-01-01 建立的 CNPG Backup 資源，指向 `postgres-cluster`。但 `dfaa-kymo` namespace 內**沒有任何 postgres cluster**（cluster 在 `dfaa` namespace）。

**判斷依據：**
- `kubectl get clusters -n dfaa-kymo` → 空
- `kubectl get clusters -n dfaa` → postgres-cluster 正常運作
- `kubectl get scheduledbackups -n dfaa` → `postgres-daily-backup` 正常，上次備份 5 小時前

結論：此 backup 資源是跨 namespace 誤建或 namespace 遷移後的殘留物，自動備份在 `dfaa` namespace 正常運作中。

### 處置

```bash
kubectl delete backup.postgresql.cnpg.io manual-backup -n dfaa-kymo
```

---

## Alert 4：dfaa-embedding ImagePullBackOff

### 發現方式

```bash
kubectl get pods -n dfaa
# → dfaa-embedding-xxx  0/1  ImagePullBackOff
```

### 根因分析（三階段）

#### 階段一：Image 不存在

Pod 無法拉取 `localhost:30500/dfaa-embedding:latest`，registry 中沒有這個 image。

**排除 image 過期可能：** 檢查 registry GC CronJob，確認 GC 策略是「只清理未被 tag 引用的 blobs」，有 tag 的 image 永久保留。因此判斷 image 從未被 push 過。

**處置：** 從 `~/projects/dfaa` 執行 `make embed-deploy` 重新 build + push。

#### 階段二：GPU Runtime 錯誤（node3）

Image push 成功後 pod 啟動失敗：

```
failed to inject CDI devices: unresolvable CDI devices runtime.nvidia.com/gpu=all
```

進一步檢查 GPU 狀態：

```bash
ssh user@node3 "nvidia-smi"
# → Failed to initialize NVML: Driver/library version mismatch
# → NVML library version: 580.126
```

```bash
ssh user@node3 "cat /proc/driver/nvidia/version"
# → Kernel Module: 580.95.05

dpkg -l | grep nvidia
# → Userspace libs: 580.126.09
```

**根因：** 系統自動更新了 NVIDIA userspace 套件（580.95 → 580.126），但未重開機，kernel module 仍是舊版，造成版本不匹配。

**處置：** 重開機 node3，讓新版 kernel module 載入。重開後 `nvidia-smi` 正常顯示 RTX A5000。

#### 階段三：架構不匹配（node4）

中間曾嘗試將 embedding 移到 node4 執行，但失敗：

```
exec /opt/conda/bin/python: exec format error
```

**根因：** Image 以 `linux/amd64` 建置，但 node4 是 `arm64` 架構。

```bash
kubectl get node k3s-node4 -o jsonpath='{.status.nodeInfo.architecture}'
# → arm64
```

**處置：** 將 nodeSelector 改回 node3（amd64 + GPU），成功啟動。

### 最終狀態

embedding 服務在 node3 上正常運行，GPU 可用。

---

## Alert 5：Longhorn Faulted Volumes (5 個)

### 發現方式

```bash
kubectl get volumes -n longhorn-system | grep fault
```

5 個 volume 處於 `detached + faulted` 狀態，已存在 59-69 天。

### 根因分析

**判斷依據：**
- 狀態為 `detached`：沒有任何 pod 正在使用
- 存在時間 59-69 天：遠早於近期操作
- 無對應的 PVC 綁定活躍的 workload

結論：過去刪除服務時未清理底層 Longhorn volume，屬於孤立資源。

### 處置

```bash
kubectl -n longhorn-system delete volume.longhorn.io <volume-name>
# 逐一刪除 5 個 faulted volume
```

---

## Alert 6：pvc-autoscaler Error Pods

### 發現方式

```bash
kubectl get pods --all-namespaces --field-selector status.phase!=Running
# → kymo-erp  pvc-autoscaler-29539090-xxx  Error (x2, 10 天前)
```

### 根因分析

這是 CronJob 產生的 pod，10 天前的兩次執行失敗。檢查近期的 pvc-autoscaler pod 都是 `Completed` 狀態，表示問題已自行恢復（可能是暫時性的資源不足或排程問題）。

**判斷依據：** 近期 pod 正常 → 非持續性問題 → 只需清理歷史失敗 pod。

### 處置

```bash
kubectl delete pod -n kymo-erp pvc-autoscaler-29539090-2p9dq pvc-autoscaler-29539090-xndnv
```

---

## Node3 重開機的連鎖影響

重開機 node3 後觀察到的暫時性 warning（全部自動恢復）：

| Warning | 原因 | 恢復時間 |
|---------|------|----------|
| Longhorn replica faulted (多個) | node 離線導致 replica 斷線 | ~5 分鐘 |
| FailedMount / DetachedUnexpectedly | CSI driver 尚未就緒 | ~5 分鐘 |
| Readiness probe failed (metrics-server, barman-cloud, ES) | Pod 重啟中 | ~3 分鐘 |
| BackOff (cloudnative-pg, elastic-operator, kube-state-metrics) | 依賴服務尚未就緒 | ~5 分鐘 |

**K8s 對 node 重啟的反應機制：**

1. Node 離線後 ~40 秒標記為 `NotReady`
2. 預設 tolerationSeconds=300（5 分鐘），期間不驅逐 pod
3. 一般 reboot 2-3 分鐘即回來，在容忍期內，pod 會在原地重啟
4. 有 nodeSelector 綁定的 pod（如 embedding）只會等 node 回來

---

## 清查結果摘要

| # | Alert | 根因 | 處置 | 類別 |
|---|-------|------|------|------|
| 1 | Dependabot 漏洞 x5 | pnpm override 版本不足 / 遺漏 | 更新 override + 部署 | 安全性 |
| 2 | Minio CronJob 失敗 | 服務停用但未清理 CronJob | 刪除殘留資源 | 殘留清理 |
| 3 | manual-backup 重試 | 跨 namespace 誤建的 backup | 刪除殘留資源 | 殘留清理 |
| 4 | embedding ImagePull | Image 未 push + GPU driver 不匹配 | 重新 build + 重開機 | 部署 + 驅動 |
| 5 | Longhorn faulted volumes | 孤立的未清理 volume | 刪除孤立 volume | 殘留清理 |
| 6 | pvc-autoscaler Error | 暫時性失敗（已自行恢復） | 清理歷史失敗 pod | 暫時性 |

### 預防措施建議

1. **服務下線 checklist**：停用服務時同步清理 CronJob、Secret、ConfigMap、PVC、Dashboard
2. **NVIDIA driver 更新策略**：設定 `unattended-upgrades` 排除 nvidia 套件，改為手動更新 + 排程重開機
3. **Longhorn 孤立 volume 定期掃描**：可設定 CronJob 定期檢查 detached + faulted volume
4. **pnpm override 維護**：安全漏洞修復後，確認 override 版本覆蓋實際修補版本
