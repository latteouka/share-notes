---
layout: default
title: Nutanix Acropolis Crash Loop — NTP 時間漂移引發 IDF 資料損壞，全部 VM 假死
category: infra
tags: [nutanix, ntp, incident]
---

# Nutanix Acropolis Crash Loop — NTP 時間漂移引發 IDF 資料損壞，全部 VM 假死

**日期：2026-03-10**
**叢集：3 節點 NX-3155-G9 / AOS 6.5.6.6 / AHV 20220304.511**
**嚴重程度：Critical — 所有 Guest VM 無法開機**
**狀態：已解決**

---

## TL;DR

NTP 伺服器時間快了 8 小時 → Nutanix 叢集時間同步失敗 → Acropolis 服務在 crash loop 期間往 IDF 寫入重複的 `memory_model` 記錄（4 筆，預期 1 筆）→ Acropolis master 每次取得 leadership 就觸發 assertion failure 立刻 crash → 所有 VM 被標記為 `kOff`（實際上 Prism Central 還在跑）→ 無法透過任何方式開機。

修復：用 `idf_cli.py` 刪除 3 筆 stale entities → genesis restart → Acropolis 恢復 → VM 自動 power on。

---

## 叢集資訊

| 項目 | Node 8 | Node 9 | Node 10 |
|------|--------|--------|---------|
| IPMI | 192.168.1.141 | 192.168.1.144 | 192.168.1.147 |
| Hypervisor | 192.168.1.142 | 192.168.1.145 | 192.168.1.148 |
| CVM | 192.168.1.143 | 192.168.1.146 | 192.168.1.149 |

- Cluster VIP: 192.168.1.140
- Prism Central: 192.168.1.150
- 三台硬體完全相同（NX-3155-G9）

---

## 事件時間線

| 時間 | 事件 |
|------|------|
| 03-07 ~19:00 | 三台 Host NTP 同步全部失敗 |
| 03-07 ~21:14 | Acropolis 開始在所有 CVM 上頻繁重啟（15 分鐘內 ≥10 次） |
| 03-07 ~21:38 | 叢集層級告警：Acropolis 持續重啟 |
| 03-07 ~22:47 | NTP Leader CVM 報告叢集時間可能在未來 |
| 03-08 ~02:15 | Node 8 被標記為不可排程（6 小時+） |
| 03-08 ~03:14 | Node 9 被標記為不可排程（6 小時+） |
| 03-10 發現 | 所有 VM 顯示 kOff，Acropolis 持續 crash loop |
| 03-10 修復 | 刪除 IDF stale data → Acropolis 恢復 → VM 自動 power on |

---

## 現象描述

打開 Prism UI，所有 6 台 Guest VM 都顯示關機。嘗試開機無效：

- `acli vm.on` → "Server disconnected"（Acropolis master 在處理過程中 crash）
- Prism v2 API `set_power_state` → task 卡在 1% 不動
- Prism UI 開機按鈕 → 無反應

---

## 排查過程

### 第一步：確認基礎設施狀態

```
$ cluster status
CVM: 192.168.1.143 Up         (Node 8)
CVM: 192.168.1.146 Up, ZeusLeader  (Node 9)
CVM: 192.168.1.149 Up         (Node 10)

All services UP on all 3 CVMs.
```

三台 CVM 全部 UP，所有服務正常 — 排除 CVM 故障。

### 第二步：確認沒有重開機（排除電力事件）

```
# Node 8 - 自 2025-04-24 起未重啟
$ last -x shutdown reboot
reboot   system boot  Thu Apr 24 17:19   still running

# Node 9 - 自 2025-04-24 起未重啟
$ last -x shutdown reboot
reboot   system boot  Thu Apr 24 08:46   still running

# Node 10 - 自 2025-12-16 起未重啟
$ last -x shutdown reboot
reboot   system boot  Tue Dec 16 03:41   still running
```

三台 Host 都沒有重啟 → 排除電力中斷。

### 第三步：確認磁碟空間

```
/ : 63% used (6.1G/9.8G)
/home: 57% used (22G/40G)
Storage disks: <1% used each (17TB HDDs, 6.8TB NVMe)
```

空間充足 → 排除儲存滿。

### 第四步：比對 Acropolis 狀態與 Hypervisor 實際狀態

這是關鍵的一步。

**Acropolis 報告（acli vm.get）：**

```
VM Name          | State | power_state_mechanism | removed_from_host_uuid
-----------------+-------+-----------------------+-----------------------
LLM              | kOff  | kHard                 | 064411fa (Node 9)
Multisource      | kOff  | kHard                 | c2088fd4 (Node 10)
NSL01            | kOff  | kHard                 | (none)
Prism Central    | kOff  | kHard                 | 064411fa (Node 9)
STT_sole         | kOff  | kHard                 | 6c743448 (Node 8)
Speech to text   | kOff  | kHard                 | 6c743448 (Node 8)
```

**Hypervisor 實際狀態（virsh list --all）：**

```
# Node 9 (192.168.1.145)
 Id   Name                                   State
 1    NTNX-Node9-CVM                         running
 8    1eefd68d-1066-448c-af76-08b6de928d16   running   ← Prism Central 實際在跑！
```

Acropolis 說 Prism Central 是 `kOff`，但 `virsh` 顯示它正在 Node 9 上執行。**Acropolis 的狀態資料庫與 Hypervisor 完全脫節。**

注意 `power_state_mechanism: kHard` 和 `removed_from_host_uuid` — 這代表 VM 不是被正常關機，而是在 Acropolis crash 過程中被標記為「從 host 移除」。

### 第五步：檢查告警時間線

```
2026-03-07 19:07 | kWarning | Host 192.168.1.148 (Node 10) NTP not synchronized
2026-03-07 19:13 | kWarning | Host 192.168.1.142 (Node 8) NTP not synchronized
2026-03-07 19:27 | kWarning | Host 192.168.1.145 (Node 9) NTP not synchronized

2026-03-07 21:14 | kWarning | CVM .143 - acropolis restarting frequently (>=10 in 15min)
2026-03-07 21:17 | kWarning | CVM .149 - acropolis restarting frequently
2026-03-07 21:18 | kWarning | CVM .146 - acropolis restarting frequently

2026-03-07 21:38 | kWarning | Cluster Service ['acropolis'] Restarting Frequently

2026-03-07 22:47 | kWarning | NTP leader CVM not syncing
  "cluster time is in the future relative to the NTP servers"
  NTP servers: ['192.168.1.120', '192.168.1.59']

2026-03-08 02:15 | kInfo | Node 8 not schedulable for 6+ hours
2026-03-08 03:14 | kInfo | Node 9 not schedulable for 6+ hours
```

時間線清楚呈現：NTP 失敗 → 2 小時後 Acropolis 開始 crash loop。

### 第六步：確認 Acropolis 沒有執行過 VM 關機

檢查 acropolis log，**完全找不到** `VmPowerOff` 或 `kPowerOff` 操作紀錄 — VM 從未被任何人或系統正常關機。

### 第七步：找到 Acropolis Crash 的根因

```
CRITICAL memory_model_manager.py:83 4 == 1 failed, Stack:
  File ".../util/misc/decorators.py", line 50, in wrapper
  File ".../util/master/master.py", line 125, in _wait_for_leadership
  File ".../acropolis/master/master.py", line 110, in _acquired_leadership
  File ".../acropolis/host/memory_model_manager.py", line 83, in initialize
```

**Acropolis master 每次取得 leadership → 呼叫 `memory_model_manager.initialize()` → 從 IDF 查詢 memory model → 期望 1 筆但找到 4 筆 → assertion fail → crash → 10 秒後重試 → 無限循環。**

三台 host 硬體完全相同（NX-3155-G9），正常情況下 IDF 只會有 1 筆 memory model。多出的 3 筆是 crash loop 期間產生的 stale data。

### 第八步：dmesg 額外發現

```
# 三台 host 都有大量 iSCSI 錯誤
connection1:0: detected conn error (1020)
```

iSCSI 連線錯誤代表 host 與 CVM Stargate 的儲存連線有問題，但這可能是果（Acropolis crash 導致）而非因。

---

## 修復步驟

### 1. NTP 修復

```bash
# 問題：NTP Server 192.168.1.120 時間快了 8 小時，上游 .59 離線
# 修復 .120 的 NTP 設定
# 移除 .59，加入 local clock fallback (stratum 8)，手動校正時間

# Nutanix Cluster NTP 設定更新
ncli cluster remove-from-ntp-servers servers=192.168.1.59
# 只保留 192.168.1.120
```

### 2. IDF Stale Data 清理（關鍵步驟）

```bash
# 先查詢 IDF 中的 memory_model entities
# 發現 4 筆，只有 1 筆是原始的（2025-04-24 建立，cas_value=1）
# 其餘 3 筆是 crash loop 期間產生的（2026-03-07，cas_value=0）

# 保留的原始 entity
# 703018a4-cee9-4bdd-9264-de16126343db  cas_value=1

# 刪除 3 筆 stale entities
python /usr/local/nutanix/bin/idf_cli.py \
  --advanced delete-entity memory_model \
  702ee6d3-ca13-4b44-9842-9e676e3a82ea --cas-value 1

python /usr/local/nutanix/bin/idf_cli.py \
  --advanced delete-entity memory_model \
  c76874f9-28ed-46d2-aa37-f57aafd0669e --cas-value 1

python /usr/local/nutanix/bin/idf_cli.py \
  --advanced delete-entity memory_model \
  550584e9-a5b6-495c-a6bc-aab30622f2a3 --cas-value 1
```

### 3. 重啟服務

```bash
# 三台 CVM 都執行 genesis restart
ssh nutanix@192.168.1.143 "genesis restart"
ssh nutanix@192.168.1.146 "genesis restart"
ssh nutanix@192.168.1.149 "genesis restart"
```

### 4. 驗證結果

Genesis restart 後：
- Acropolis master 成功啟動，不再 crash
- Acropolis 自動同步 hypervisor 狀態
- 5/6 VM 自動 power on（NSL01 本來就不需要啟動）
- Prism Central 回到綠色狀態
- NTP 全鏈同步正常

| VM | 恢復後狀態 |
|----|-----------|
| LLM | kOn |
| Multisource | kOn |
| Prism Central | kOn |
| STT_sole | kOn |
| Speech to text | kOn |
| NSL01 | kOff（正常） |

---

## 根因分析

```
NTP Server (.120) 時間快 8 小時
  └→ 上游 NTP (.59) 離線，.120 無法校正
      └→ 叢集三台 Host NTP 同步失敗
          └→ 「叢集時間在 NTP 伺服器的未來」
              └→ Acropolis / Zookeeper 元件間通訊異常
                  └→ Acropolis 開始 crash loop
                      └→ Crash loop 期間往 IDF 寫入重複 memory_model
                          └→ 4 == 1 assertion failure
                              └→ Acropolis master 永遠無法啟動
                                  └→ VM 狀態不同步，全部標記 kOff
```

### 為什麼 VM 全顯示 kOff？

1. Acropolis crash 時，正在運行的 VM 被標記 `removed_from_host_uuid`（從 host 移除）
2. `power_state_mechanism: kHard` — 不是 graceful shutdown，是 crash 造成的狀態遺失
3. 實際上只有 Prism Central 還在 Node 9 上跑（因為它是 hypervisor 層級運行的）
4. 其他 VM 的 virsh 定義在 Acropolis crash 過程中被清除

---

## 排查用的指令參考

### 查叢集狀態

```bash
ssh nutanix@<CVM_IP> "cluster status"
```

### 查 VM 狀態（Acropolis 層）

```bash
ssh nutanix@<CVM_IP> "acli vm.list"
ssh nutanix@<CVM_IP> "acli vm.get <vm_name>"
```

### 查 VM 狀態（Hypervisor 層 — 真實狀態）

```bash
ssh root@<AHV_IP> "virsh list --all"
```

### 查告警

```bash
ssh nutanix@<CVM_IP> "ncli alerts ls"
```

### 查 Host 資訊

```bash
ssh nutanix@<CVM_IP> "ncli host ls"
ssh root@<AHV_IP> "last -x shutdown reboot"
ssh root@<AHV_IP> "dmesg | grep -iE 'power|error|critical|fault|temperature'"
```

### 查 Acropolis 日誌

```bash
ssh nutanix@<CVM_IP> "tail -100 /home/nutanix/data/logs/acropolis.out"
ssh nutanix@<CVM_IP> "tail -100 /home/nutanix/data/logs/acropolis.FATAL"
```

### IDF 查詢與清理

```bash
# 查詢特定 entity type
python /usr/local/nutanix/bin/idf_cli.py --advanced list-entities memory_model

# 刪除 stale entity
python /usr/local/nutanix/bin/idf_cli.py \
  --advanced delete-entity memory_model <entity_id> --cas-value 1
```

---

## 經驗教訓

1. **NTP 是叢集的命脈** — Nutanix 對時間同步極度敏感，NTP 失敗可以引發連鎖災難。應該配置至少 2 個可靠的 NTP 來源，並設定 local clock fallback。

2. **Acropolis 狀態 ≠ 實際狀態** — 當 Acropolis crash 時，一定要用 `virsh list --all` 在 hypervisor 層確認 VM 的真實狀態。不要只看 Prism UI。

3. **`kHard` + `removed_from_host_uuid` 是 crash 的標誌** — 正常關機不會產生這個組合。看到這個就知道是 Acropolis 異常導致的狀態遺失。

4. **IDF 資料損壞可以用 `idf_cli.py` 修復** — 這是 Nutanix 內建工具，可以查詢和刪除 IDF 中的 stale entities。但操作前務必確認要刪的是哪些。

5. **從 3/7 到 3/10 三天沒人發現** — 應該要有監控告警通知機制。`ncli alerts ls` 在 3/7 就已經有告警了。
