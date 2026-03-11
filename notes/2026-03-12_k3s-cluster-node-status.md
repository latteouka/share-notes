---
layout: default
title: K3s 叢集節點狀態與資源總覽
---

# K3s 叢集節點狀態與資源總覽

**日期：2026-03-12**
**環境：K3s v1.32.11 / 4 節點叢集 / Ubuntu 24.04**

---

## 叢集概覽

| 節點 | 角色 | 架構 | OS | Kernel | 狀態 |
|------|------|------|-----|--------|------|
| node1 | worker | amd64 | Ubuntu 24.04.3 | 6.8.0-90 | Ready |
| node2 | worker | amd64 | Ubuntu 24.04.2 | 6.8.0-90 | Ready |
| node3 | control-plane | amd64 | Ubuntu 24.04.2 | 6.8.0-101 | Ready |
| node4 | worker | arm64 | Ubuntu 24.04.3 | 6.14.0-1015-nvidia | Ready |

---

## 硬體資源

| 節點 | CPU | 記憶體 | 磁碟 | GPU |
|------|-----|--------|------|-----|
| node1 | 8 cores | 32 GB | 100 GB | - |
| node2 | 8 cores | 32 GB | 76 GB | - |
| node3 | 8 cores | 32 GB | 100 GB | NVIDIA RTX A5000 (24 GB) |
| node4 | 20 cores | 120 GB | 960 GB | NVIDIA GPU (arm64) |

---

## 即時資源使用量

| 節點 | CPU 使用 | CPU % | 記憶體使用 | 記憶體 % |
|------|----------|-------|-----------|----------|
| node1 | 213m | 2% | 18,954 Mi | 59% |
| node2 | 268m | 3% | 16,291 Mi | 50% |
| node3 | 339m | 4% | 14,853 Mi | 46% |
| node4 | 144m | 0% | 16,671 Mi | 13% |

---

## 資源分配（Requests / Limits）

| 節點 | CPU Requests | CPU Limits | Mem Requests | Mem Limits |
|------|-------------|------------|-------------|------------|
| node1 | 5,240m (65%) | 13,200m (165%) | 21,462 Mi (66%) | 32,372 Mi (100%) |
| node2 | 5,290m (66%) | 20,200m (252%) | 21,792 Mi (67%) | 47,112 Mi (146%) |
| node3 | 5,540m (69%) | 13,000m (162%) | 24,008 Mi (74%) | 32,414 Mi (100%) |
| node4 | 6,630m (33%) | 13,000m (65%) | 20,946 Mi (17%) | 26,100 Mi (21%) |

> **注意：** node2 的 CPU/Memory Limits 超過 100%（overcommitted），表示若所有 pod 同時達到 limit 會發生資源競爭。

---

## 各節點工作負載分布

### node1 — Worker (amd64)

| Namespace | 服務 | 用途 |
|-----------|------|------|
| dfaa | elasticsearch-es-hot-2, neo4j | 資料庫 |
| ingress-nginx | ingress controller | 流量入口 |
| kymo-erp | web-app | ERP 應用 |
| longhorn-system | CSI controllers, manager | 分散式儲存 |
| monitoring | prometheus | 監控 |
| sonarqube | sonarqube | 程式碼品質 |

### node2 — Worker (amd64)

| Namespace | 服務 | 用途 |
|-----------|------|------|
| dfaa | worker-elk/embedding/neo4j/subscription, elasticsearch-es-hot-1, postgres-cluster-2 | DFAA workers + DB |
| kube-system | csi-nfs-controller | NFS CSI |
| kymo-task | web-app | Task 應用 |
| monitoring | alertmanager, grafana, operator, state-metrics | 監控全套 |
| sonarqube | postgres | SonarQube DB |
| vulert | vulert, cve/nics-monitor | 漏洞監控 |

### node3 — Control Plane (amd64, GPU)

| Namespace | 服務 | 用途 |
|-----------|------|------|
| cert-manager | cert-manager 全套 | TLS 憑證管理 |
| cnpg-system | barman-cloud | CNPG 備份 |
| dfaa | **embedding (GPU)**, nextjs, worker-parse, elasticsearch-es-hot-3 | DFAA 核心 + AI |
| kube-system | coredns, metrics-server, local-registry, **nvidia-device-plugin** | 系統服務 |
| longhorn-system | CSI controllers, manager | 分散式儲存 |

### node4 — Worker (arm64, GPU, 大容量)

| Namespace | 服務 | 用途 |
|-----------|------|------|
| cnpg-system | cloudnative-pg operator | PG operator |
| dfaa | elasticsearch-es-hot-4, kibana, postgres-cluster-1 | DFAA 資料層 |
| elastic-system | elastic-operator | ES operator |
| kymo-erp | postgres-cluster-1 | ERP DB |
| kymo-task | postgres-cluster-1 | Task DB |
| longhorn-system | driver-deployer, manager | 分散式儲存 |
| vulert | postgres-cluster-1 | Vulert DB |

---

## 架構特點

1. **GPU 節點**：node3 (amd64) 和 node4 (arm64) 都有 NVIDIA GPU，但架構不同
   - node3：RTX A5000，用於 embedding 服務（需要 amd64 image）
   - node4：arm64 架構，需要 arm64 image
2. **資料庫集中在 node4**：利用其大容量記憶體 (120 GB) 和磁碟 (960 GB)
3. **Elasticsearch 分散部署**：hot-1~4 分佈在四個節點上
4. **Control Plane 兼用**：node3 同時作為 master 和跑應用程式

---

## 近期維護記錄

- **2026-03-12**：修復 node3 NVIDIA driver 版本不匹配（kernel module 580.95 vs userspace 580.126），透過重開機解決
- **2026-03-12**：清理 minio 相關殘留資源（已停用）
- **2026-03-12**：清理 dfaa-kymo namespace 殘留的 manual-backup
- **2026-03-12**：重新 build 並部署 dfaa-embedding image
