---
title: 网络渗透测试作业：curl 工具使用实验
date: 2026-11-01 14:30:00
categories:
  - 学习笔记
tags:
  - 网络安全
  - 网络渗透测试
  - curl
---

这次网络安全课布置的 curl 实验作业，我按实验模板把过程整理了一下。下面分"实验简介、实验环境、三个操作、实验小结"几部分来写。

## 实验简介

curl（Client URL）是一款命令行的数据传输工具，支持 HTTP、HTTPS 等多种协议，在 Web 安全里常用来手动构造 HTTP 请求、探测目标站点、收集服务端指纹信息。这次实验用 Windows 自带的 curl，以 `http://example.com` 为测试目标，完成几种不同方式的 HTTP 请求测试。

## 实验环境

- 操作系统：Windows
- 工具：系统自带 curl（Win10/11 已内置，不用另外装）
- 测试目标：http://example.com

## 操作1：curl -i 同时获取响应头与页面正文

执行命令：

```bash
curl -i http://example.com
```

实验说明：`-i` 参数会让 curl 在返回正文的同时，把响应头也一起打印出来。这样一次就能看到状态码、服务器类型、内容类型这些信息，以及下面跟着的 Example Domain 页面 HTML 源码。对刚上手的人来说，这是最直观看"一个 HTTP 响应到底长什么样"的方式。

## 操作2：curl -I 仅获取 HTTP 响应头（HEAD 请求）

执行命令：

```bash
curl -I http://example.com
```

实验说明：`-I` 参数（大写 i）发送的是 HEAD 请求，**只返回响应头、不下载网页正文**。优点是速度更快，在渗透测试里适合批量快速探测站点是否存活、顺手拿到服务器指纹，也省流量。从返回的头里还能看到这个站点 `Allow: GET, HEAD`，也就是说它只支持 GET 和 HEAD，不支持 POST。

## 操作3：curl -X POST -d 发送 POST 表单请求

执行命令：

```bash
curl -X POST -d "user=test&pass=123" http://example.com
```

实验说明：

- `-X POST`：指定请求方法为 POST
- `-d`：携带表单参数，这里模拟提交账号密码 `user=test&pass=123`

现象解释：虽然我们发了 POST 请求，但 example.com 本身不支持 POST，所以它直接把默认页面源码返了回来，并不会真的处理我们提交的表单数据。

这个命令在真实 Web 渗透里，常用来向登录接口提交表单、测试 POST 注入点。

## 实验小结

1. curl 可以脱离浏览器，手动构造 GET、POST 等 HTTP 请求，是 Web 安全里很基础的工具；
2. `-i`、`-I` 是信息收集的高频参数，主要用来获取服务端指纹；
3. POST 请求可以模拟表单提交，在漏洞测试、登录测试这些场景非常常用；
4. 测试时选 example.com，它是 IANA 官方的测试域名，合法又安全，不用担心踩线。
