---
layout: default
title: Share Notes
---

<div id="search-container">
  <input type="text" id="search-input" placeholder="搜尋..." autocomplete="off">
</div>

<div id="search-results"></div>

<div id="note-list">

{% assign notes = site.pages | where_exp: "page", "page.path contains 'notes/'" | where_exp: "page", "page.path != 'notes/'" | sort: "path" | reverse %}

{% assign all_categories = "" %}
{% assign all_tags = "" %}
{% for note in notes %}
  {% if note.category %}
    {% unless all_categories contains note.category %}
      {% if all_categories == "" %}
        {% assign all_categories = note.category %}
      {% else %}
        {% assign all_categories = all_categories | append: "," | append: note.category %}
      {% endif %}
    {% endunless %}
  {% endif %}
  {% if note.tags %}
    {% for t in note.tags %}
      {% unless all_tags contains t %}
        {% if all_tags == "" %}
          {% assign all_tags = t %}
        {% else %}
          {% assign all_tags = all_tags | append: "," | append: t %}
        {% endif %}
      {% endunless %}
    {% endfor %}
  {% endif %}
{% endfor %}

{% assign category_list = all_categories | split: "," %}
{% assign tag_list = all_tags | split: "," %}

<div id="filter-bar">
  <button class="filter-btn active" data-filter="all">全部</button>
  {% for cat in category_list %}
    <button class="filter-btn filter-category" data-filter="category:{{ cat }}">{{ cat }}</button>
  {% endfor %}
  {% for tag in tag_list %}
    <button class="filter-btn filter-tag" data-filter="tag:{{ tag }}">{{ tag }}</button>
  {% endfor %}
</div>

<h2>筆記列表</h2>

<ul>
{% for note in notes %}
  {% assign filename = note.path | split: "/" | last | split: "_" | first %}
  {% assign note_tags = note.tags | join: "," %}
  <li data-category="{{ note.category }}" data-tags="{{ note_tags }}"><span class="note-date">{{ filename }}</span> <a href="{{ note.url | relative_url }}">{{ note.title }}</a></li>
{% endfor %}
</ul>

</div>

<script src="https://unpkg.com/simple-jekyll-search@latest/dest/simple-jekyll-search.min.js"></script>
<script src="{{ '/assets/js/search.js' | relative_url }}"></script>
<script src="{{ '/assets/js/filter.js' | relative_url }}"></script>
