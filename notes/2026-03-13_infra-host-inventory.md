---
layout: default
title: 基礎設施主機清單 — .57 ~ .61 狀態與 Nginx 設定
category: infra
tags: [inventory, nginx, gpu, server]
---

# 基礎設施主機清單 — .57 ~ .61

**日期：2026-03-13**
**狀態：快照紀錄**

---

## 總覽

| IP | Hostname | 角色 | OS | CPU | RAM | Disk | GPU | 狀態 |
|----|----------|------|-----|-----|-----|------|-----|------|
| .57 | — | （舊主機） | — | — | — | — | — | ❌ 不可達 |
| .58 | llm | LLM 推論（vLLM） | Ubuntu 24.04 | 32 | 251 GB | 2 TB (25%) | L40S ×2 | ✅ |
| .59 | multisource | 舊版前端 + DB + Proxy | Ubuntu 24.04 | 8 | 31 GB | 2 TB (3%) | 無 | ✅ |
| .60 | stt | 新版前端 + WhisperAPI | Ubuntu 24.04 | 16 | 125 GB | 4 TB (4%) | L40S ×1 | ✅ |
| .61 | stt | 備用 WhisperAPI + Surya OCR | Ubuntu 24.04 | 16 | 125 GB | 4 TB (3%) | L40S ×1 | ⚠️ whisper crash loop |

---

## .57 — 舊主機（不可達）

SSH 超時，可能已下線或 IP 變更。原本是 whisperAPI 的舊部署位置。

---

## .58 — LLM 推論伺服器

### 規格

| 項目 | 值 |
|------|-----|
| Hostname | `llm` |
| CPU | 32 cores |
| RAM | 251 GB |
| Disk | 2 TB（25% 使用） |
| GPU | **NVIDIA L40S × 2**（各 46 GB VRAM） |
| Driver | 535.216.01 / CUDA 12.2 |
| Uptime | 3 天 |

### 服務

| 服務 | 狀態 | 說明 |
|------|------|------|
| `gemma312`（PM2） | ✅ online | Gemma 3 12B 模型，佔 1.5 GB RAM |
| `gemma`（PM2） | stopped | 舊版 Gemma（已停止） |
| `qwen`（PM2） | stopped | Qwen 模型（已停止） |
| Nginx | ✅ active | :443 → localhost:8000 |

### Nginx Config

```nginx
# .58 — LLM API proxy
server {
  listen 443 ssl http2 default_server;
  server_name <internal-ip>;

  ssl_certificate /etc/nginx/ssl/nginx.crt;
  ssl_certificate_key /etc/nginx/ssl/nginx.key;

  location / {
    proxy_pass http://localhost:8000;    # vLLM API
    proxy_connect_timeout 360s;
    proxy_send_timeout 360s;
    proxy_read_timeout 360s;
  }
}
```

### Listening Ports

| Port | 服務 |
|------|------|
| 443 | Nginx → vLLM |
| 8000 | vLLM（gemma312） |
| 22 | SSH |
| 多個高位 port | Gemma 模型內部通訊 |

---

## .59 — 舊版前端 + 資料庫 + Proxy

### 規格

| 項目 | 值 |
|------|-----|
| Hostname | `multisource` |
| CPU | 8 cores |
| RAM | 31 GB |
| Disk | 2 TB（3% 使用） |
| GPU | 無 |
| Uptime | 3 天 |

### 服務

| 服務 | 狀態 | 說明 |
|------|------|------|
| `multi`（PM2） | ✅ online | 舊版前端 Next.js（:3000） |
| `progress`（PM2） | ✅ online | 進度追蹤服務 |
| PostgreSQL | ✅ active | :5432（綁定 localhost + .59 IP） |
| Nginx | ✅ active | 多 server block |
| Squid Proxy | ✅ | :3128 |

### Nginx Config

```nginx
# .59 — 舊版前端 + 代理到 .61

# HTTP → HTTPS 重導向
server {
  listen 80;
  server_name <external-ip> <internal-ip>;
  return 301 https://$host$request_uri;
}

# 主站（:443）
server {
  listen 443 ssl http2 default_server;
  server_name <internal-ip>;
  server_name <external-ip>;

  # 前端
  location / {
    proxy_pass http://localhost:3000;    # 舊版 Next.js 前端
  }

  # 代理到 .61 的服務
  location /surya/ {
    proxy_pass https://<.61-ip>/surya/;  # OCR 服務
  }
  location /uploads/ {
    proxy_pass https://<.61-ip>/uploads/;
  }
  location /speechToText {
    proxy_pass https://<.61-ip>/speech-to-text;  # whisperAPI
  }
  location /deleteByName {
    proxy_pass https://<.61-ip>/deleteByName;
  }
}

# 第二站（:8081）
server {
  listen 8081 ssl http2 default_server;
  server_name <external-ip>;

  location / {
    proxy_pass http://localhost:3001;    # 另一個前端服務
  }
}
```

**重點：** .59 會把 `/speechToText` 和 `/surya/` 等請求代理到 .61。

### Listening Ports

| Port | 服務 |
|------|------|
| 80/443 | Nginx |
| 3000 | 舊版前端（multi） |
| 3128 | Squid Proxy |
| 5432 | PostgreSQL（localhost + .59 IP） |
| 8081 | 第二前端站 |
| 22 | SSH |

---

## .60 — 新版前端（STT）+ WhisperAPI（主服務）

### 規格

| 項目 | 值 |
|------|-----|
| Hostname | `stt` |
| CPU | 16 cores |
| RAM | 125 GB |
| Disk | 4 TB（4% 使用） |
| GPU | **NVIDIA L40S × 1**（46 GB VRAM） |
| Driver | 535.216.01（GRID）/ CUDA 12.2 |
| Uptime | 3 天 |

### 服務

| 服務 | 狀態 | 說明 |
|------|------|------|
| `whisper`（PM2） | ✅ online | FastAPI 語音轉文字 API（:8000） |
| `celery`（PM2） | ✅ online | Celery worker（--pool=solo） |
| `stt`（PM2） | ✅ online | Next.js 新版前端（:3000） |
| PostgreSQL 16 | ✅ active | :5432（僅 localhost） |
| Redis 7.4.1 | ✅ active | :6379（僅 localhost） |
| Nginx | ✅ active | 對外域名服務 |

### Nginx Config

```nginx
# .60 — 新版 STT 主站

# HTTP → HTTPS 重導向
server {
  listen 80;
  server_name <external-ip> <domain>;
  return 301 https://$host$request_uri;
}

# 主站（:443）
server {
  listen 443 ssl;
  server_name <external-ip>;
  server_name <domain>;

  # 前端
  location / {
    proxy_pass http://localhost:3000;    # stt Next.js 前端
  }

  # WhisperAPI
  location /service/ {
    rewrite ^/service(/.*)$ $1 break;   # 移除 /service 前綴
    proxy_pass http://localhost:8000;    # whisper FastAPI
    # CORS headers included
  }

  # 上傳檔案靜態服務
  location /uploads/ {
    alias /srv/uploads/;
  }
}

# 註解掉的 :8080 server block（原本直接暴露 whisper API，已停用）
```

**重點：** `/service/*` 會 rewrite 掉前綴後代理到 whisper API。

### Listening Ports

| Port | 服務 |
|------|------|
| 80/443 | Nginx |
| 3000 | stt 前端 |
| 8000 | whisper API |
| 5432 | PostgreSQL（僅 localhost） |
| 6379 | Redis（僅 localhost） |
| 22 | SSH |

---

## .61 — 備用 WhisperAPI + Surya OCR

### 規格

| 項目 | 值 |
|------|-----|
| Hostname | `stt` |
| CPU | 16 cores |
| RAM | 125 GB |
| Disk | 4 TB（3% 使用） |
| GPU | **NVIDIA L40S × 1**（46 GB VRAM） |
| Driver | 535.216.01（GRID）/ CUDA 12.2 |
| Uptime | 3 天 |

### 服務

| 服務 | 狀態 | 說明 |
|------|------|------|
| `whisper`（PM2） | ⚠️ crash loop（2126 次重啟） | DB 指向 .59 但 pg_hba 未放行 |
| `celery`（PM2） | ✅ online | 穩定 3 天 |
| `surya`（Docker） | ✅ Up 3 days | Surya OCR 服務（:8888） |
| Redis 7.4.1 | ✅ active | :6379（僅 localhost） |
| Nginx | ✅ active | |

**注意：** .61 沒有 PostgreSQL，DB 設定指向 .59，但 .59 的 pg_hba.conf 未放行 .61（已加 UFW 規則但未加 pg_hba）。

### Nginx Config

```nginx
# .61 — whisperAPI + Surya OCR

server {
  listen 443 ssl http2 default_server;
  server_name <internal-ip>;

  ssl_certificate /etc/nginx/ssl/nginx.crt;
  ssl_certificate_key /etc/nginx/ssl/nginx.key;

  # WhisperAPI
  location / {
    proxy_pass http://localhost:8000;
  }

  # Surya OCR
  location /surya/ {
    proxy_pass http://localhost:8888/;
  }

  # 上傳檔案
  location /uploads/ {
    alias /srv/uploads/;
  }
}
```

### Listening Ports

| Port | 服務 |
|------|------|
| 443 | Nginx |
| 8888 | Surya OCR（Docker） |
| 6379 | Redis（僅 localhost） |
| 22 | SSH |

---

## 網路拓撲圖

```
                    使用者
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
    .59 (舊版前端)        .60 (新版前端 STT)
    ┌──────────────┐    ┌──────────────────┐
    │ Nginx :443   │    │ Nginx :443       │
    │  / → :3000   │    │  / → :3000 (stt) │
    │  /surya → .61│    │  /service → :8000│
    │  /stt → .61  │    │  /uploads → disk │
    │              │    │                  │
    │ PG :5432     │    │ whisper :8000    │
    │ Squid :3128  │    │ celery (solo)   │
    │ :3001 → :8081│    │ PG :5432        │
    └──────────────┘    │ Redis :6379     │
            │           └──────────────────┘
            │
            ▼
    .61 (備用 whisper + OCR)
    ┌──────────────┐
    │ Nginx :443   │
    │  / → :8000   │
    │  /surya → :8888│
    │              │
    │ Surya (Docker)│
    │ Redis :6379  │
    └──────────────┘

    .58 (LLM)
    ┌──────────────┐
    │ Nginx :443   │
    │  / → :8000   │
    │ vLLM (gemma) │
    │ L40S × 2     │
    └──────────────┘
```

---

## 共通設定

### SSL 憑證

所有主機的 SSL 憑證位置一致：
```
/etc/nginx/ssl/nginx.crt
/etc/nginx/ssl/nginx.key
```

### NVIDIA Driver

有 GPU 的主機（.58, .60, .61）都使用：
- Driver: **535.216.01 (GRID)**
- CUDA: **12.2**
- 安裝方式: `.run` 檔
- DKMS: .60 已啟用（2026-03-13），.58 和 .61 待確認

### 用戶帳號

所有主機統一使用 `kymo` 帳號登入。

---

## 待處理事項

- [ ] **.57** — 確認是否已下線或 IP 變更
- [ ] **.61 whisper** — 需修復 .59 的 pg_hba.conf 放行 .61，或改用本機 DB
- [ ] **.58 / .61 DKMS** — 確認是否已註冊 DKMS，避免 kernel 更新後 GPU driver 消失
- [ ] **.59 → .61 代理** — 確認 .59 代理到 .61 的 whisperAPI 是否仍需要（.60 已是主站）
