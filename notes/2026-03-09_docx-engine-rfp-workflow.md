---
layout: default
title: 標案服務建議書生成工作流
---

# 標案服務建議書生成工作流

**更新日期：2026-03-09**

---

## 概述

基於 docx-engine 的雙向引擎（逆向 DOCX → TypeScript、正向 TypeScript → DOCX），設計一套 LLM 驅動的工作流。目標：提供新標案需求說明書後，能自動重組、改寫、補寫章節，生成新的服務建議書。

## 系統架構

```
docs/docx-engine/
├── engine.ts              # 正向引擎：TypeScript → DOCX
├── reverse/               # 逆向引擎：DOCX → TypeScript
│   ├── index.ts           # OOXML 解析
│   └── codegen.ts         # TypeScript 程式碼生成
├── types.ts               # 共用型別（DocElement 等）
├── writing-guides/rfp.md  # 寫作風格指引
├── prompt-templates/      # Prompt 模板（引導 LLM 各階段工作）
├── scripts/
│   ├── generate.ts        # 正向生成 CLI
│   └── reverse.ts         # 逆向解析 CLI
└── projects/
    ├── rfp-reversed/      # 素材庫（逆向產生）
    │   ├── material-index.md  # 素材索引
    │   ├── content/*.ts       # 結構化內容
    │   └── assets/            # 圖片
    └── <新案名>/          # 生成的新專案
        ├── generation-plan.md # 章節計畫
        ├── content/*.ts
        └── assets/
```

## 核心概念：DocElement

引擎的中間表示層。所有內容都是 `DocElement[]` 陣列：

```typescript
{ type: 'heading', level: 1, text: '專案概述' }
{ type: 'body', text: '本公司針對貴機關需求...' }
{ type: 'table', rows: [...], widths: [30, 70] }
{ type: 'image', path: './assets/image-001.png', width: 680, height: 320 }
{ type: 'rich', runs: [{ text: '重要', bold: true, color: 'FF0000' }] }
{ type: 'list', style: 'decimal', items: ['項目一', '項目二'] }
{ type: 'pageBreak' }
{ type: 'sectionBreak', showFooter: false }
{ type: 'toc', entries: [] }
{ type: 'spacing' }
```

## 工作流三階段

### Phase 1：建立素材庫

**時機**：拿到一份過往得標的建議書 DOCX 時執行。

```
舊建議書.docx → [逆向引擎] → content/*.ts + assets/ + material-index.md
```

**步驟**：

1. 執行逆向引擎，自動產出：
   - `content/*.ts` — 結構化內容（文字 + 表格 + 圖片引用）
   - `assets/` — 所有圖片（含表格 cell 內的圖片）
2. LLM 讀取所有 content，生成 `material-index.md`（章節摘要 + 複用等級 + 可複用資產）
3. 人工確認素材索引

**逆向引擎能力**：

| 項目 | 狀態 |
|------|------|
| 段落文字 | ✅ 完整提取 |
| 5 級標題 | ✅ 含 basedOn 繼承鏈解析 |
| 表格（含 rowSpan/colSpan） | ✅ |
| 嵌入圖片（含表格 cell 內） | ✅ 246/248 張 |
| 圖片尺寸（width + height） | ✅ |
| 分節符（頁碼控制） | ✅ |
| SmartArt / Chart | ⚠️ 標記 TODO placeholder |

**執行指令**：

```bash
cd apps/web
pnpm tsx ../../docs/docx-engine/scripts/reverse.ts <input.docx> [project-name]
```

---

### Phase 2：分析與規劃

**時機**：拿到新標案需求說明書時執行。

**輸入**：

- 新需求說明書（PDF/DOCX 內容或貼入對話）
- 素材庫的 `material-index.md`

**LLM 產出** `generation-plan.md`：

```markdown
## 章節對應

| 新章序 | 評比項目 | 對應動作 | 素材來源 | 改寫要點 |
|--------|---------|---------|---------|---------|
| 00 | 封面+目錄 | 改寫 | 00-cover.ts | 換案名、客戶名 |
| 01 | 廠商經驗實績 | 搬移 | 02-廠商組織.ts | 微調開頭段落 |
| 02 | 專案整體規劃 | 搬移+改寫 | 03-緊急處理.ts | 依新需求調整 SLA |
| 03 | 資安管理能力 | 拆分重組 | 03+05 章 | 合併為獨立章節 |
| 04 | 創新服務方案 | 新增撰寫 | 無 | 全新撰寫 |
```

**對應動作說明**：

| 動作 | LLM 做什麼 |
|------|-----------|
| 搬移 | 讀取素材 content，微調文字（機關名稱等替換） |
| 搬移+改寫 | 保留佈局和圖片，依改寫要點調整段落/表格 |
| 拆分重組 | 從多個素材章節中提取段落，重新組織 |
| 新增撰寫 | 依評比子項 + 寫作風格，全新撰寫 |

**使用者確認後進入 Phase 3。**

---

### Phase 3：逐章生成

**時機**：章節計畫確認後執行。

**執行方式**：LLM 按計畫逐章處理，每章輸出合法的 `DocElement[]` TypeScript。

**特殊處理**：

- 遇到只有使用者能填寫的資訊（人名、價格、特定數據），用**粗體紅字**標記：
  ```typescript
  { type: 'rich', runs: [
    { text: "【請填入：駐點人員姓名及證照】", bold: true, color: 'FF0000' }
  ], indent: false }
  ```
- 圖片：從素材庫複製需要的 assets
- 封面：自動替換案名、客戶名
- 價格章節：全部標紅，由使用者填入

**生成後**：

```bash
cd apps/web
pnpm tsx ../../docs/docx-engine/scripts/generate.ts <新案名>
# → 產出 DOCX，用 Word 開啟檢視（TOC 點「是」更新）
```

---

## 迭代修改

生成完成後支援兩種修改方式：

- **整章重生**：「第 3 章重寫，多強調即時監控能力」→ 重新生成該章 content
- **局部修改**：「第 3 章 SLA 表格加一列」→ 直接編輯 content 檔案

修改後重新執行正向引擎即可。

---

## 內容複用等級

| 等級 | 說明 | 典型章節 |
|------|------|---------|
| **高複用** | 換案幾乎原封搬用 | 公司簡介、團隊經歷、證照、實績 |
| **中度調整** | 骨架相同，依需求調描述重點 | 維護方案、資安管理、駐點管理 |
| **每案重寫** | 必須完全依新案撰寫 | 專案概述、封面、價格 |

---

## 寫作風格要點

（完整版見 `writing-guides/rfp.md`）

- **稱謂**：貴機關（甲方）、本公司（乙方）
- **正式用語**：茲、俾利、據以、確保、秉持
- **禁止**：眾所周知...、隨著科技的進步...
- **量化承諾**：具體數字、時間、百分比
- **表格背景色**：D9D9D9（一般表頭）、C6D9F1（重要表頭）、DBE5F1（圖片說明）
- **編號風格**：壹→一→（一）→1→(1)

---

## Prompt 模板

放在 `docs/docx-engine/prompt-templates/`：

| 模板 | 用途 |
|------|------|
| `phase2-analyze.md` | 分析需求說明書，產出章節計畫 |
| `phase3-generate.md` | 逐章生成通用指令 |
| `phase3-rewrite.md` | 改寫型章節專用指令 |
| `phase3-new-chapter.md` | 新增撰寫專用指令 |
| `iterate-modify.md` | 迭代修改指令 |

每個模板包含：角色設定、輸入說明、輸出格式要求、寫作風格約束、品質檢查清單。

---

## 未來 UI 化規劃

目前全部在 Claude Code 對話中執行。未來 UI 化時：

1. **Phase 1**：上傳 DOCX → 自動逆向 → 顯示素材索引
2. **Phase 2**：貼入需求說明書 → 顯示章節計畫表（可拖拉調整）
3. **Phase 3**：逐章 streaming 生成 → 即時預覽 → 下載 DOCX

每個 Phase 對應獨立 API endpoint，prompt 模板就是後端邏輯。
