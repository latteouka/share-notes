# 首頁搜尋功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在首頁筆記列表上方加入搜尋框，可搜尋筆記標題與內容，結果顯示標題 + 內容摘要。

**Architecture:** 用 Jekyll Liquid 模板生成 `search.json` 索引檔（含標題、URL、全文內容），引入 Simple-Jekyll-Search 做前端即時搜尋。無輸入時顯示原本筆記列表，有輸入時顯示搜尋結果（標題 + 匹配片段）。

**Tech Stack:** Jekyll Liquid, Simple-Jekyll-Search (CDN), vanilla CSS

---

### Task 1: 建立搜尋索引 search.json

**Files:**
- Create: `search.json`

**Step 1: 建立 search.json Liquid 模板**

```json
---
layout: null
---
[
  {% assign notes = site.pages | where_exp: "page", "page.path contains 'notes/'" %}
  {% for page in notes %}
  {
    "title": {{ page.title | jsonify }},
    "url": {{ page.url | jsonify }},
    "content": {{ page.content | strip_html | strip_newlines | jsonify }}
  }{% unless forloop.last %},{% endunless %}
  {% endfor %}
]
```

**Step 2: 本地驗證 search.json 生成正確**

Run: `cd /Users/chunn/projects/share-notes && bundle exec jekyll build && cat _site/search.json | head -20`
Expected: 能看到包含筆記標題和內容的 JSON 陣列

**Step 3: Commit**

```bash
git add search.json
git commit -m "feat: add search.json index for full-text search"
```

---

### Task 2: 修改首頁加入搜尋框和結果區

**Files:**
- Modify: `index.md`

**Step 1: 在筆記列表上方加入搜尋框 HTML**

將 `index.md` 改為：

```markdown
---
layout: default
title: Share Notes
---

<div id="search-container">
  <input type="text" id="search-input" placeholder="搜尋筆記標題或內容..." autocomplete="off">
</div>

<div id="search-results"></div>

<div id="note-list" markdown="1">

## 筆記列表

- [2026-03-09 標案服務建議書生成工作流](notes/2026-03-09_docx-engine-rfp-workflow)
- [2026-03-09 麵包小偷繪本價格比較](notes/2026-03-09_麵包小偷價格比較)

</div>

<script src="https://unpkg.com/simple-jekyll-search@latest/dest/simple-jekyll-search.min.js"></script>
<script src="{{ '/assets/js/search.js' | relative_url }}"></script>
```

**Step 2: Commit**

```bash
git add index.md
git commit -m "feat: add search box and result area to index page"
```

---

### Task 3: 搜尋邏輯 JS

**Files:**
- Create: `assets/js/search.js`

**Step 1: 建立搜尋 JS**

```javascript
(function () {
  var searchInput = document.getElementById("search-input");
  var searchResults = document.getElementById("search-results");
  var noteList = document.getElementById("note-list");

  SimpleJekyllSearch({
    searchInput: searchInput,
    resultsContainer: searchResults,
    json: "/search.json",
    searchResultTemplate:
      '<div class="search-result">' +
      '<a href="{url}">{title}</a>' +
      '<p class="search-snippet">{content}</p>' +
      "</div>",
    noResultsText: '<p class="no-results">找不到相關筆記</p>',
    limit: 10,
    fuzzy: false,
    templateMiddleware: function (prop, value) {
      if (prop === "content") {
        // 截取前 150 字元作為摘要
        var text = value.replace(/\s+/g, " ").trim();
        if (text.length > 150) {
          text = text.substring(0, 150) + "...";
        }
        return text;
      }
      return value;
    },
  });

  // 有輸入時隱藏筆記列表，顯示搜尋結果
  searchInput.addEventListener("input", function () {
    if (this.value.length > 0) {
      noteList.style.display = "none";
      searchResults.style.display = "block";
    } else {
      noteList.style.display = "block";
      searchResults.style.display = "none";
    }
  });
})();
```

**Step 2: 本地測試搜尋功能**

Run: `cd /Users/chunn/projects/share-notes && bundle exec jekyll serve`
Expected: 在瀏覽器打開 localhost:4000，輸入關鍵字能看到搜尋結果

**Step 3: Commit**

```bash
git add assets/js/search.js
git commit -m "feat: add search logic with Simple-Jekyll-Search"
```

---

### Task 4: 搜尋樣式

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: 在 style.scss 末尾加入搜尋樣式**

```scss
/* 搜尋功能樣式 */
#search-container {
  margin-bottom: 24px;
}

#search-input {
  width: 100%;
  padding: 10px 14px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    border-color: #4078c0;
    box-shadow: 0 0 0 3px rgba(64, 120, 192, 0.15);
  }

  &::placeholder {
    color: #999;
  }
}

#search-results {
  display: none;
}

.search-result {
  padding: 12px 0;
  border-bottom: 1px solid #eee;

  a {
    font-size: 17px;
    font-weight: 600;
    color: #333;
    text-decoration: none;

    &:hover {
      color: #4078c0;
    }
  }
}

.search-snippet {
  margin: 4px 0 0;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.no-results {
  color: #999;
  font-style: italic;
  padding: 12px 0;
}
```

**Step 2: 本地驗證樣式正確**

Run: `cd /Users/chunn/projects/share-notes && bundle exec jekyll serve`
Expected: 搜尋框外觀乾淨，結果列表排版清晰

**Step 3: Commit**

```bash
git add assets/css/style.scss
git commit -m "style: add search box and result styling"
```

---

### Task 5: 最終驗證與推送

**Step 1: 完整 build 測試**

Run: `cd /Users/chunn/projects/share-notes && bundle exec jekyll build`
Expected: 無錯誤

**Step 2: 驗證生成的檔案**

Run: `ls -la _site/search.json _site/assets/js/search.js`
Expected: 兩個檔案都存在

**Step 3: 本地端到端驗證**

Run: `cd /Users/chunn/projects/share-notes && bundle exec jekyll serve`
驗證項目：
- [ ] 搜尋框出現在筆記列表上方
- [ ] 輸入文字後筆記列表隱藏、搜尋結果出現
- [ ] 搜尋結果顯示標題（可點擊）+ 內容摘要
- [ ] 清空搜尋框後恢復筆記列表
- [ ] 搜尋「標案」能找到相關筆記
- [ ] 搜尋「麵包」能找到相關筆記
- [ ] 無結果時顯示「找不到相關筆記」

**Step 4: Push**

```bash
git push origin main
```
