# Share Notes — 筆記撰寫指南

## 專案概述

Jekyll 靜態筆記網站，部署在 `https://notes.chundev.com`。用於記錄工作、技術、生活相關的筆記。

## 語言

- 使用繁體中文撰寫
- 技術名詞保留英文（如 K3s、Nutanix、P/C Ratio）

## 檔案規則

### 位置與命名

- 所有筆記放在 `notes/` 目錄
- 檔名格式：`YYYY-MM-DD_簡短描述.md`
- 描述用英文小寫 + 連字號（kebab-case），或直接用中文
- 範例：
  - `2026-03-14_tsm-strategy-falsification.md`
  - `2026-03-09_麵包小偷價格比較.md`

### Frontmatter（必要）

```yaml
---
layout: default
title: 文章標題（繁體中文，簡潔描述內容）
category: 分類
tags: [tag1, tag2]
---
```

**已使用的 category：**

| category | 用途 |
|----------|------|
| `infra` | 基礎設施、伺服器、K3s、Nutanix |
| `dev` | 軟體開發、工作流、架構設計 |
| `trading` | 交易策略、回測、金融分析 |
| `life` | 生活相關 |

新增 category 前先確認是否有合適的既有分類。

### 文章結構

```markdown
# 標題（與 frontmatter title 一致）

**日期：YYYY-MM-DD**
**環境/標的/其他 metadata**（視情況）

---

## 第一段（概述 / TL;DR）

簡短說明這篇筆記的背景和結論。

## 內容段落

用表格呈現數據，用 code block 呈現指令或程式碼。

---

## 結論 / 結果
```

### 寫作風格

1. **先結論後過程** — 開頭就講結果，細節放後面
2. **善用表格** — 數據比較、清單、狀態一律用 Markdown 表格
3. **段落之間用 `---` 分隔** — 增加視覺區隔
4. **使用 emoji 標記狀態** — ✅ ❌ ⚠️ 🟢 🟡 🔴
5. **技術筆記附上指令** — 用 code block 記錄可重現的指令
6. **incident 類筆記附 TL;DR** — 一段話總結問題和解法
7. **不需要目錄（TOC）** — 文章不會太長，直接閱讀

### 長度

- 目標 2,000-10,000 字元
- 短筆記（價格比較、狀態快照）：~2,000
- 技術筆記（incident、架構）：~5,000-10,000
- 不要為了湊長度而灌水

## Git 規則

- 直接 commit 到 `main` 並 push
- commit message 格式：`docs: 簡短描述`
- 不需要開 PR
