---
layout: default
title: Share Notes
---

<div id="search-container">
  <input type="text" id="search-input" placeholder="搜尋..." autocomplete="off">
</div>

<div id="search-results"></div>

<div id="note-list">

<h2>筆記列表</h2>

<ul>
{% assign notes = site.pages | where_exp: "page", "page.path contains 'notes/'" | where_exp: "page", "page.path != 'notes/'" | sort: "path" | reverse %}
{% for note in notes %}
  {% assign filename = note.path | split: "/" | last | split: "_" | first %}
  <li><span class="note-date">{{ filename }}</span> <a href="{{ note.url | relative_url }}">{{ note.title }}</a></li>
{% endfor %}
</ul>

</div>

<script src="https://unpkg.com/simple-jekyll-search@latest/dest/simple-jekyll-search.min.js"></script>
<script src="{{ '/assets/js/search.js' | relative_url }}"></script>
