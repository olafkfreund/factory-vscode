---
layout: default
title: Blog
description: Notes on building factory-vscode.
---

# Blog

<ul class="post-list">
{% for post in site.posts %}
  <li>
    <a href="{{ post.url | relative_url }}">{{ post.title }}</a>
    <span class="meta">{{ post.date | date: "%B %-d, %Y" }}{% if post.author %} &middot; {{ post.author }}{% endif %}</span>
    {% if post.subtitle %}<p>{{ post.subtitle }}</p>{% endif %}
  </li>
{% endfor %}
</ul>
