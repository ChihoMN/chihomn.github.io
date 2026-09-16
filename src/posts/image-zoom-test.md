---
title: 图片放大功能测试
date: 2026-03-29
description: 用于验证文章图片点击放大与预览关闭交互。
tags: [test, image, svelte]
categories: [Testing]
draft: false
---

这是一篇用于验证文章内图片点击放大效果的测试文章。

## 普通图片

![山间公路测试图](https://picsum.photos/id/1043/1400/900)

点击上图应打开预览浮层，支持：

- 点击图片或遮罩关闭
- 按 `Esc` 关闭
- 页面滚动在预览期间锁定

## 链接包裹图片

[![湖面倒影测试图](https://picsum.photos/id/1018/1400/900)](https://picsum.photos/id/1018/2000/1200)

该图被超链接包裹，用于验证点击时优先触发预览，而不是直接跳转链接。
