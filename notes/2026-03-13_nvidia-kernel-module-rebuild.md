---
layout: default
title: NVIDIA Driver 消失 — Kernel 更新後 GPU Module 未重建
category: infra
tags: [nvidia, gpu, kernel, dkms, linux]
---

# NVIDIA Driver 消失 — Kernel 更新後 GPU Module 未重建

**日期：2026-03-13**
**主機：192.168.98.60（stt, Ubuntu 24.04, NVIDIA L40S）**
**嚴重程度：High — GPU 不可用，語音轉錄服務失敗**
**狀態：已解決**

---

## TL;DR

Nutanix 重啟後 kernel 從 `6.8.0-49` 升級到 `6.8.0-101`，原本用 `.run` 手動安裝的 NVIDIA GRID driver（535.216.01）沒有 DKMS，新 kernel 下找不到 `nvidia.ko` module → GPU 消失 → whisperAPI 的 Celery worker 嘗試用 CUDA 處理音檔時報錯。

修復：重跑同一個 `.run` 安裝檔並選擇註冊 DKMS → 重啟服務 → GPU 恢復。

---

## 背景知識：Linux Kernel Module 機制

### 什麼是 Kernel Module？

Linux 的硬體驅動以 kernel module（`.ko` 檔）的形式存在，是 kernel space 和硬體之間的橋樑：

```
應用程式 (PyTorch / CUDA toolkit)
        ↓
libcuda.so / libnvidia-ml.so  ← userspace 函式庫
        ↓
nvidia.ko                     ← kernel module（在 kernel space 運行）
        ↓
GPU 硬體 (L40S)
```

- `nvidia-smi` 是透過 `libnvidia-ml.so` → `nvidia.ko` 來跟 GPU 溝通
- `torch.cuda` 是透過 `libcuda.so` → `nvidia.ko` 來存取 GPU

**沒有 `nvidia.ko` → 整條鏈斷掉 → GPU 不存在**

### 為什麼 Kernel 更新會讓 Driver 壞掉？

Kernel module 必須**針對特定 kernel 版本編譯**。每個 kernel 版本有自己的 ABI（Application Binary Interface），module 的二進位檔只能跟對應的 kernel 配合使用。

module 存放位置依 kernel 版本分目錄：

```
/lib/modules/
├── 6.8.0-49-generic/
│   └── kernel/drivers/video/
│       ├── nvidia.ko          ← ✅ .run 安裝時編譯的
│       ├── nvidia-modeset.ko
│       ├── nvidia-uvm.ko
│       ├── nvidia-drm.ko
│       └── nvidia-peermem.ko
│
└── 6.8.0-101-generic/
    └── kernel/drivers/video/
        └── （空）              ← ❌ 沒有人幫新 kernel 編譯
```

系統開機時載入 `6.8.0-101` kernel → 去對應目錄找 `nvidia.ko` → 找不到 → `modprobe nvidia` 失敗。

### DKMS vs 手動 .run 安裝

| | `.run` 手動安裝 | `apt` + DKMS |
|---|---|---|
| 編譯時機 | 安裝當下，只針對當前 kernel | 每次 kernel 更新**自動**重編譯 |
| Kernel 更新後 | ❌ 需要手動重跑 .run | ✅ DKMS hook 自動處理 |
| 版本選擇 | 可裝任意版本（含 GRID） | 只能裝 apt repo 有的版本 |
| 適用場景 | vGPU / GRID / 特殊需求 | 一般通用 driver |

**DKMS（Dynamic Kernel Module Support）** 的運作原理：

```
1. 原始碼保存在 /usr/src/nvidia-535.216.01/
2. DKMS 註冊這組原始碼
3. 每次 apt 安裝新 kernel 時，觸發 DKMS hook
4. DKMS 自動用原始碼對新 kernel 重新編譯 nvidia.ko
5. 編譯好的 .ko 放到 /lib/modules/<new-kernel>/
```

### 為什麼用 GRID Driver？

NVIDIA 的 driver 有分幾種：

| Driver 類型 | 用途 |
|-------------|------|
| **Game Ready / Studio** | 桌面顯卡 (GeForce) |
| **Data Center** | 伺服器 GPU（Tesla, A100, H100） |
| **GRID / vGPU** | 虛擬化環境（Nutanix, VMware, KVM） |

我們的 L40S 跑在 Nutanix 虛擬化平台上，VM 要存取實體 GPU 需要 vGPU 支援，所以必須用 **GRID driver**。用 `apt install nvidia-driver-xxx` 裝的是通用版，不含 vGPU 功能，可能無法正確驅動。

---

## 為什麼重開機會升級 Kernel？

Kernel 更新**不是重開機觸發的**，而是之前某次 `sudo apt upgrade` 就已經安裝了新 kernel 套件，只是一直沒重開機所以沒生效：

```
時間軸：

某天   ─── sudo apt upgrade ──→ 下載並安裝 linux-image-6.8.0-101
          （系統還在跑 6.8.0-49，一切正常，nvidia.ko 還在）

          ... 可能經過數天甚至數週 ...

03/10  ─── Nutanix 事件，VM 重啟 ──→ GRUB 載入最新的 6.8.0-101
          （新 kernel 下沒有 nvidia.ko → GPU 消失）
```

**關鍵概念：** Linux kernel 更新是「安裝」和「啟用」兩個步驟：
- `apt upgrade` 只是把新 kernel 檔案放到 `/boot/` 並更新 GRUB 選單
- 實際切換到新 kernel 要等**下次開機**
- 所以你可能跑完 `apt upgrade` 後完全沒感覺，直到某天重開機才「爆炸」

**預防方式：**

```bash
# 方法 1：鎖住 kernel 不自動升級
sudo apt-mark hold linux-image-generic linux-headers-generic

# 方法 2：升級後立即重建 nvidia module（如果沒有 DKMS）
sudo apt upgrade
sudo bash /home/kymo/NVIDIA-Linux-x86_64-535.216.01-grid.run
# 不需要馬上重開機，module 會預先編譯好放著

# 方法 3：用 DKMS（本次已啟用）
# apt upgrade 安裝新 kernel 時 DKMS 會自動編譯，不需手動處理
```

---

## 故障時間線

| 時間 | 事件 |
|------|------|
| 不確定 | 某次 `sudo apt upgrade` 安裝了 kernel 6.8.0-101（但未重開機） |
| 2026-03-10 | Nutanix 叢集因 NTP 問題重啟所有 VM |
| 重啟後 | GRUB 載入新 kernel 6.8.0-101，舊的 nvidia.ko 不相容 |
| 重啟後 | nvidia.ko 在新 kernel 下不存在，GPU 消失 |
| 2026-03-13 | 使用者回報語音轉錄上傳後直接失敗 |

---

## 診斷過程

### 1. 確認 GPU 硬體存在但 driver 未載入

```bash
# 硬體看得到
$ lspci | grep -i nvidia
00:05.0 3D controller: NVIDIA Corporation AD102GL [L40S] (rev a1)

# driver 沒載入
$ lsmod | grep nvidia
（空）

# nvidia-smi 無法通訊
$ nvidia-smi
NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver.

# PyTorch 也確認 CUDA 不可用
$ python -c "import torch; print(torch.cuda.is_available())"
False
```

### 2. 確認 kernel module 只在舊 kernel 下有

```bash
$ find /lib/modules -name 'nvidia.ko'
/lib/modules/6.8.0-49-generic/kernel/drivers/video/nvidia.ko
# 6.8.0-101 下沒有
```

### 3. 找到原始安裝方式

```bash
# 找到 .run 安裝檔
$ find /home/kymo -name 'NVIDIA*.run'
/home/kymo/NVIDIA-Linux-x86_64-535.216.01-grid.run

# 確認有 nvidia-uninstall（.run 安裝的特徵）
$ ls /usr/bin/nvidia-uninstall
/usr/bin/nvidia-uninstall

# 原始碼還在
$ ls /usr/src/nvidia-535.216.01/
```

---

## 修復步驟

### 1. 重跑 .run 安裝檔

```bash
sudo bash /home/kymo/NVIDIA-Linux-x86_64-535.216.01-grid.run
```

安裝過程會出現幾個互動式問題：

```
┌─ NVIDIA Installer ────────────────────────────────────────────┐
│ Would you like to register the kernel module sources with     │
│ DKMS? This will allow DKMS to automatically build a new       │
│ module, if your kernel changes later.                         │
│                                                               │
│              [ Yes ]                  [ No ]                  │
└───────────────────────────────────────────────────────────────┘
→ 選 Yes（這樣下次 kernel 更新就不會再壞了）
```

其他可能出現的問題：
- **"An existing NVIDIA installation has been found"** → 選繼續安裝（覆蓋舊的）
- **"Install NVIDIA's 32-bit compatibility libraries?"** → 通常選 No（伺服器不需要）
- **"Would you like to run nvidia-xconfig?"** → 選 No（無桌面環境）

### 2. 驗證 driver

```bash
# 確認 GPU 可見
nvidia-smi
# 應顯示：Driver 535.216.01, CUDA 12.2, L40S 46GB

# 確認 DKMS 註冊成功
dkms status
# 應顯示 nvidia/535.216.01

# 確認 module 已載入
lsmod | grep nvidia
# 應顯示 nvidia, nvidia_modeset, nvidia_uvm 等
```

### 3. 重啟相關服務

```bash
# 不需要 reboot（module 在安裝過程中已載入）
# 只需重啟使用 GPU 的服務
pm2 restart whisper celery

# 驗證服務正常
pm2 list
pm2 logs celery --nostream --lines 5
# 應顯示 celery@stt ready
```

---

## 預防措施

1. **DKMS 已啟用** — 這次安裝時選擇了 Yes 註冊 DKMS，下次 kernel 更新會自動重建 module
2. **驗證 DKMS 狀態：**
   ```bash
   dkms status
   # 應顯示 nvidia/535.216.01 已註冊
   ```
3. **Kernel 更新後的檢查清單：**
   - [ ] `nvidia-smi` 能正常顯示 GPU
   - [ ] `dkms status` 顯示 nvidia module 已建構
   - [ ] `pm2 list` 確認服務正常
   - [ ] 測試一次實際轉錄

---

## 相關筆記

- [Nutanix Acropolis Crash Loop — NTP 時間漂移引發 IDF 資料損壞](2026-03-10_nutanix-acropolis-crash-loop-incident.md) — 這次 kernel 更新的根因就是那次 Nutanix 重啟
