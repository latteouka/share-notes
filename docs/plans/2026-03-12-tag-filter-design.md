# Tag & Category Filter 實作計畫

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 首頁加入 category + tag 按鈕列，點擊可篩選文章列表

**Architecture:** 在每篇文章 frontmatter 加上 `category` 和 `tags` 欄位。首頁用 Liquid 模板蒐集所有 category/tags 渲染成按鈕，`<li>` 帶 `data-*` 屬性。純 client-side JS 做 show/hide filter。

**Tech Stack:** Jekyll Liquid, vanilla JS, SCSS

---

### Task 1: 為所有文章加上 category 和 tags frontmatter

**Files:**
- Modify: `notes/2026-03-09_麵包小偷價格比較.md:1-4`
- Modify: `notes/2026-03-09_docx-engine-rfp-workflow.md:1-4`
- Modify: `notes/2026-03-10_chundev-server-diagnosis.md:1-4`
- Modify: `notes/2026-03-10_nutanix-acropolis-crash-loop-incident.md:1-4`
- Modify: `notes/2026-03-12_k3s-alert-triage.md:1-4`
- Modify: `notes/2026-03-12_k3s-cluster-node-status.md:1-4`

**Step 1: 加入 frontmatter 欄位**

每篇文章的 frontmatter 加上 `category` 和 `tags`：

| 文章 | category | tags |
|------|----------|------|
| 麵包小偷價格比較 | life | [繪本, 比較] |
| 標案服務建議書生成工作流 | dev | [docx, workflow] |
| Linux 主機 CPU 高負載清查 | infra | [linux, docker, neo4j] |
| Nutanix Acropolis Crash Loop | infra | [nutanix, ntp, incident] |
| K3s 叢集 Alert 清查 | infra | [k3s, alerting] |
| K3s 叢集節點狀態 | infra | [k3s, monitoring] |

> **注意：** category 和 tags 的值由使用者確認後再套用。以上為建議值。

**Step 2: Commit**

```bash
git add notes/
git commit -m "feat: 為所有文章加上 category 和 tags frontmatter"
```

---

### Task 2: 修改首頁 Liquid 模板 — 按鈕列 + data 屬性

**Files:**
- Modify: `index.md`

**Step 1: 修改 index.md**

在 `<h2>筆記列表</h2>` 上方加入 filter 按鈕列，用 Liquid 蒐集所有 category 和 tags：

```liquid
{% assign notes = site.pages | where_exp: "page", "page.path contains 'notes/'" | where_exp: "page", "page.path != 'notes/'" | sort: "path" | reverse %}

{% comment %} 蒐集所有 categories {% endcomment %}
{% assign all_categories = "" %}
{% for note in notes %}
  {% if note.category %}
    {% assign all_categories = all_categories | append: "," | append: note.category %}
  {% endif %}
{% endfor %}
{% assign all_categories = all_categories | split: "," | uniq | sort %}

{% comment %} 蒐集所有 tags {% endcomment %}
{% assign all_tags = "" %}
{% for note in notes %}
  {% if note.tags %}
    {% for tag in note.tags %}
      {% assign all_tags = all_tags | append: "," | append: tag %}
    {% endfor %}
  {% endif %}
{% endfor %}
{% assign all_tags = all_tags | split: "," | uniq | sort %}

<div id="filter-bar">
  <button class="filter-btn active" data-filter="all">全部</button>
  {% for cat in all_categories %}
    {% if cat != "" %}
    <button class="filter-btn filter-category" data-filter="category:{{ cat }}">{{ cat }}</button>
    {% endif %}
  {% endfor %}
  {% for tag in all_tags %}
    {% if tag != "" %}
    <button class="filter-btn filter-tag" data-filter="tag:{{ tag }}">{{ tag }}</button>
    {% endif %}
  {% endfor %}
</div>
```

`<li>` 加上 data 屬性：

```liquid
{% for note in notes %}
  {% assign filename = note.path | split: "/" | last | split: "_" | first %}
  <li data-category="{{ note.category }}" data-tags="{{ note.tags | join: ',' }}">
    <span class="note-date">{{ filename }}</span>
    <a href="{{ note.url | relative_url }}">{{ note.title }}</a>
  </li>
{% endfor %}
```

**Step 2: Commit**

```bash
git add index.md
git commit -m "feat: 首頁加入 filter 按鈕列與 data 屬性"
```

---

### Task 3: 新增 filter.js

**Files:**
- Create: `assets/js/filter.js`

**Step 1: 建立 filter.js**

```javascript
(function () {
  var filterBar = document.getElementById("filter-bar");
  if (!filterBar) return;

  filterBar.addEventListener("click", function (e) {
    var btn = e.target.closest(".filter-btn");
    if (!btn) return;

    // 更新 active 狀態
    filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
      b.classList.remove("active");
    });
    btn.classList.add("active");

    var filter = btn.getAttribute("data-filter");
    var items = document.querySelectorAll("#note-list li");

    items.forEach(function (li) {
      if (filter === "all") {
        li.style.display = "";
        return;
      }

      var parts = filter.split(":");
      var type = parts[0];
      var value = parts[1];

      if (type === "category") {
        li.style.display = li.getAttribute("data-category") === value ? "" : "none";
      } else if (type === "tag") {
        var tags = (li.getAttribute("data-tags") || "").split(",");
        li.style.display = tags.indexOf(value) !== -1 ? "" : "none";
      }
    });
  });
})();
```

**Step 2: 在 index.md 加入 script 引用**

在現有的 `<script>` 之後加入：
```html
<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
```

**Step 3: Commit**

```bash
git add assets/js/filter.js index.md
git commit -m "feat: 新增 filter.js 實現標籤篩選"
```

---

### Task 4: 加入按鈕列 CSS 樣式

**Files:**
- Modify: `assets/css/style.scss`

**Step 1: 加入樣式**

```scss
/* Filter 按鈕列 */
#filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.filter-btn {
  padding: 4px 12px;
  font-size: 13px;
  border: 1px solid #ddd;
  border-radius: 16px;
  background: #f8f8f8;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #4078c0;
    color: #4078c0;
  }

  &.active {
    background: #4078c0;
    color: #fff;
    border-color: #4078c0;
  }
}

.filter-category {
  border-color: #e0c860;
  color: #8a7620;
  background: #fdf8e4;

  &.active {
    background: #e0c860;
    color: #fff;
    border-color: #e0c860;
  }
}

.filter-tag {
  /* 預設灰色風格即可 */
}
```

**Step 2: Commit**

```bash
git add assets/css/style.scss
git commit -m "feat: filter 按鈕列樣式"
```

---

### Task 5: 本機驗證 + 最終 push

**Step 1: 啟動 dev server 驗證**

```bash
bundle exec jekyll serve
```

檢查：
- [ ] 首頁按鈕列正確顯示所有 category 和 tags
- [ ] 點擊「全部」顯示所有文章
- [ ] 點擊 category 按鈕只顯示該分類文章
- [ ] 點擊 tag 按鈕只顯示含該 tag 的文章
- [ ] 搜尋功能不受影響

**Step 2: Push**

```bash
git push origin main
```
