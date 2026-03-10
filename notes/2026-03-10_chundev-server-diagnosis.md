---
layout: default
title: Linux 主機 CPU 高負載清查 — Neo4j 容器 GC 風暴
---

# Linux 主機 CPU 高負載清查 — Neo4j 容器 GC 風暴

**日期：2026-03-10**
**環境：VPS 主機 / 記憶體 8 GB / Swap 2.5 GB / Docker 13 個容器**

---

## 清查指令

### 1. 系統概覽

```bash
# 查看 load average 和前幾名 CPU 消耗程序
ssh user@host "top -b -n 1 | head -20"

# 記憶體與 swap 使用情況
ssh user@host "free -h && swapon --show"

# 即時 vmstat（觀察 swap in/out 和 IO wait）
ssh user@host "vmstat 1 5"
```

### 2. Docker 容器資源排名

```bash
# 一次看所有容器的 CPU% 和 MEM
ssh user@host "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'"
```

### 3. 找出特定高 CPU 程序的來源

```bash
# 用 PID 反查完整指令和執行時間
ssh user@host "ps -p <PID> -o pid,user,cmd,etime"

# 看 /proc 拿完整 cmdline
ssh user@host "cat /proc/<PID>/cmdline | tr '\0' ' '"
```

---

## 診斷結果

### 問題

整夜 CPU 高負載，load average 2.36+。

### 根因

**Neo4j 容器佔用 CPU 210%**（Neo4j Community Edition）

| 容器 | CPU | 記憶體 | 佔比 |
|------|-----|--------|------|
| **neo4j** | **210%** | **2.35 GB** | **30%** |
| sonarqube | 2.6% | 888 MB | 29% |
| app-a | 2.4% | 821 MB | 10% |
| app-b | 1.6% | 265 MB | 3% |
| 其他 9 個容器 | < 1% | ~280 MB | ~4% |

### 連鎖效應

- Swap 幾乎全滿（2.5 GB / 2.5 GB，剩 1.9 MB）
- `kswapd0` 核心程序也在消耗 CPU（不斷做 swap in/out）
- IO wait 11-14%（硬碟被 swap 操作拖慢）
- 整體系統變慢

### 原因分析

Neo4j 配了 `-Xmx1048576k`（1 GB heap），但加上 off-heap、page cache 等實際吃掉 2.35 GB。在 8 GB 機器上跑 13 個容器，記憶體嚴重不足，導致：
1. Neo4j 頻繁 GC → CPU 飆高
2. 系統記憶體不足 → 瘋狂 swap → IO wait 上升 → 更慢 → 更多 GC → 惡性循環

### 解法

#### 快速緩解

```yaml
# 限制容器資源（在 docker-compose.yml 加）
services:
  neo4j:
    deploy:
      resources:
        limits:
          memory: 1g
          cpus: '1.0'
```

#### 根本改善

8 GB 機器跑 13 個容器太吃力，建議：

1. **關掉不常用的服務** — sonarqube 單獨佔 ~900 MB，不用時停掉
2. **降低 Neo4j heap** — 改 `-Xmx512m` 對小型資料集足夠
3. **增加 swap 或記憶體** — 如果所有服務都需要同時跑
