---
title: Pingora介绍
publishDate: 2025-05-14T22:42:00+08:00
author: logeable
description: Pingora是Cloudflare内部使用Rust构建的HTTP代理。它已被设计用于连接Cloudflare到互联网，每天处理万亿请求，并为Cloudflare客户带来许多新功能。Cloudflare已将其开源，作为一个Rust框架，用于构建可编程的网络服务。
tags: ["Pingora", "Rust", "Nginx", "HTTP"]
---

## 什么是 Pingora

**主要特点和优势：**

- 高性能和效率: Pingora 消耗的 CPU 和内存比旧服务减少了约 70%和 67%[^1]。TTFB（首字节时间）中位数减少了 5 毫秒，第 95 个百分位数减少了 80 毫秒 [^1]。通过在所有线程之间共享连接，提高了连接重用率，从而减少了 TCP 和 TLS 握手所花费的时间[^1]。

- 开发人员友好: Pingora 提供了一个类似于 NGINX/OpenResty 的、基于“请求生命周期”事件的可编程接口，使开发人员可以轻松上手并快速提高工作效率[^1]。

- 功能扩展: 能够更快地开发更多功能，例如添加 HTTP/2 上游支持和 gRPC。Pingora 还支持自定义的负载平衡和故障转移策略[^2]。

- 安全性: Rust 的内存安全语义可以防止未定义的行为，并确保服务正确运行，自 Pingora 创立以来，已经处理了数百万亿个请求，至今尚未因服务代码而崩溃[^1]。

- 可定制性: Pingora 提供过滤器和回调函数，允许用户完全自定义服务如何处理、转换和转发请求[^2]。

Pingora 被设计为一个库和工具集，而不是一个可执行的二进制文件[^2]。它为构建 HTTP/1 和 HTTP/2、TLS 或仅 TCP/UDP 之上的服务提供了构建块，并支持 HTTP/1 和 HTTP/2 端到端、gRPC 和 websocket 代理[^2]。

## Cloudflare 为什么要创造 Pingora

Pingora 是 Cloudflare 开发的，一个基于 Rust 编程语言的高性能网络服务器框架。

**开发背景：**

替代 Nginx：Cloudflare 在 2022 年宣布放弃 Nginx，转而使用内部 Rust 编写的软件 Pingora。Cloudflare 发现，随着其业务规模的扩大，Nginx 在性能和满足复杂环境所需功能方面存在瓶颈 [^3]。

**Nginx 架构的限制：**

- Nginx 中，每个请求只能由一个 worker 提供服务，导致 CPU 核心负载不平衡，速度减慢。
- 连接重用性差。当 Nginx 添加更多 worker 以扩展规模时，连接分散在所有进程中，导致 TTFB 速度变慢，并消耗更多资源。
- 功能需求：某些高级定制化功能难以在 Nginx 上添加，修改起来比较困难。
- 安全性考虑：Nginx 使用 C 语言编写，存在内存安全问题。虽然可以使用 Lua 作为补充，但 Lua 性能较低，并且在处理复杂业务逻辑时缺乏静态类型。
- 资源优化：新架构下，Pingora 仅需以往代理基础设施三分之一的 CPU 和内存资源即可提供更好的性能。

Cloudbleed 安全漏洞：Cloudflare 曾发生 Cloudbleed 安全漏洞，该漏洞的根源是由于 C 代码中的指针错误引起的，因此 Cloudflare 希望尽可能避免这些问题， 选择了内存安全的 Rust 语言[^4]。

**Pingora 的优势：**

- 性能：Pingora 具有快速和高效的特点，多线程架构可以节省 CPU 和内存资源。
- 可定制性：Pingora 代理框架提供了高度可编程的 API，方便用户构建定制高级网关或负载均衡器。
- 安全性：Rust 提供了更安全的内存选择。
- 其他特性：Pingora 支持 HTTP/1、HTTP/2、TLS、gRPC 和 WebSocket 代理，支持零停机优雅重启，并具备可定制的负载均衡和故障转移策略。

## Pingora 高性能实现的关键机制

Pingora 之所以能够实现卓越的性能和效率，主要得益于以下几个方面的设计:

**Rust 语言赋能：**
内存安全：Rust 的所有权和借用检查器在编译时保证内存安全，消除了许多困扰 C/C++ 程序的内存错误（如悬垂指针、数据竞争），从而避免了服务崩溃和潜在的安全漏洞。自创立以来，Pingora 处理了数百万亿个请求，尚未因服务代码而崩溃。
高性能：Rust 提供了接近 C/C++ 的性能，同时具备现代语言的便利性和安全性。

**多线程架构：**
Pingora 采用多线程架构，与 Nginx 的多进程模型不同。这种架构允许在所有线程之间轻松共享资源，特别是连接池。
它利用 Tokio 异步运行时，这是一个基于工作窃取（work-stealing）调度系统，有效避免了传统 worker/进程模型带来的性能瓶颈。

**高效的连接管理：**
通过共享连接池，Pingora 实现了极高的连接重用率。例如，对于一个主要客户，Pingora 将连接重用率从 87.1% 提高到 99.92%，新连接数量减少了 160 倍。
这显著减少了 TCP 和 TLS 握手所需的时间，每天为客户和用户节省了大量握手时间（据称达 434 年）。

**资源消耗降低：**
在生产环境中，与之前的代理服务相比，Pingora 在处理相同流量负载的情况下，消耗的 CPU 减少了约 70%，内存减少了约 67%。在某些场景下，Pingora 仅需以往代理基础设施三分之一的 CPU 和内存资源即可提供更优性能。

综上所述，Pingora 不仅仅是 Nginx 的一个简单替代品，更是一个基于 Rust 的现代化、高性能、高安全性的网络服务构建框架。它通过创新的架构设计和对底层细节的精心优化，成功解决了 Cloudflare 在超大规模场景下遇到的诸多挑战，并为网络服务领域带来了新的可能性。

[^1]: 将 Cloudflare 连接到互联网的代理——Pingora 的构建方式 - https://blog.cloudflare.com/zh-cn/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/
[^2]: 开源 Pingora ——我们用于构建可编程网络服务的 Rust 框架 - https://blog.cloudflare.com/zh-cn/pingora-open-source/
[^3]: 放弃 Nginx;试一试基于 Rust 语言的 Pingora 框架 - https://cloud.tencent.com/developer/article/2411961
[^4]: 【Rust 研学】Cloudflare 开源最强网络框架 Pingora - https://rivers.chaitin.cn/blog/cq959e90lnechd2453o0
