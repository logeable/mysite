---
title: Pingora-快速入门：负载均衡器
publishDate: 2025-05-14T22:42:00+08:00
author: logeable
description: 这个快速入门展示了如何使用pingora和pingora-proxy构建一个简单的负载均衡器。
tags: ["Pingora", "Rust", "Nginx", "HTTP"]
---

> 原文：https://github.com/cloudflare/pingora/blob/main/docs/quick_start.md

## 导言

这个快速入门展示了如何使用 pingora 和 pingora-proxy 构建一个简单的负载均衡器。

负载均衡器的目标是对于每个传入的 HTTP 请求，以循环方式选择两个后端之一：https://1.1.1.1和https://1.0.0.1。

## 构建一个基本的负载均衡器

为我们的负载均衡器创建一个新的货物项目。让我们称之为 `load_balancer`

```bash
cargo new load_balancer
```

## 包括 Pinora Crate 和基本依赖项

在项目的 `cargo.toml` 文件中，将以下内容添加到您的依赖项中

```toml
async-trait="0.1"
pingora = { version = "0.5", features = [ "lb" ] }
```

## 创建 pingora 服务器

首先，让我们创建一个 pingora 服务器。pingora `Server` 是一个可以托管一个或多个服务的进程。pingora `Server` 负责配置和 CLI 参数解析、守护程序化、信号处理以及优雅的重启或关闭。

首选用法是在 `main()`函数中初始化 `Server`，然后使用 `run_forever()`生成所有运行时线程并阻塞主线程，直到服务器准备好退出。

```rust
use async_trait::async_trait;
use pingora::prelude::*;
use std::sync::Arc;

fn main() {
    let mut my_server = Server::new(None).unwrap();
    my_server.bootstrap();
    my_server.run_forever();
}
```

这将编译并运行，但它不会做任何有趣的事情。

## 创建负载均衡器代理

接下来让我们创建一个负载均衡器。我们的负载均衡器保存上游 IP 的静态列表。`pingora-load-balancing`crate 已经为 `LoadBalancer` 结构提供了常见的选择算法，如循环和散列。所以我们就用它吧。如果用例需要更复杂或自定义的服务器选择逻辑，用户可以简单地在这个函数中自己实现。

```rust
pub struct LB(Arc<LoadBalancer<RoundRobin>>);
```

为了使服务器成为代理，我们需要为它实现`ProxyHttp` trait。

任何实现 `ProxyHttp` 特征的对象本质上定义了在代理中如何处理请求。`ProxyHttp` 特征中唯一需要的方法是 `upstream_peer()`，它返回请求应该代理到的地址。

在 `upstream_peer()`的主体中，让我们对 `LoadBalancer` 使用 `select()`方法来跨上游 IP 循环。在这个例子中，我们使用 HTTPS 连接到后端，所以我们还需要指定到 `use_tls` 并在构造我们的 `Peer` 对象时设置 SNI。

```rust
#[async_trait]
impl ProxyHttp for LB {
    /// For this small example, we don't need context storage
    type CTX = ();
    fn new_ctx(&self) -> () {
        ()
    }

    async fn upstream_peer(&self, _session: &mut Session, _ctx: &mut ()) -> Result<Box<HttpPeer>> {
        let upstream = self
            .0
            .select(b"", 256) // hash doesn't matter for round robin
            .unwrap();

        println!("upstream peer is: {upstream:?}");

        // Set SNI to one.one.one.one
        let peer = Box::new(HttpPeer::new(upstream, true, "one.one.one.one".to_string()));
        Ok(peer)
    }
}
```

为了让 `1.1.1.1` 后端接受我们的请求，必须存在主机标头。添加此标头可以通过 `upstream_request_filter()`回调来完成，该回调在与后端建立连接之后和发送请求标头之前修改请求标头。

```rust
impl ProxyHttp for LB {
    // ...
    async fn upstream_request_filter(
        &self,
        _session: &mut Session,
        upstream_request: &mut RequestHeader,
        _ctx: &mut Self::CTX,
    ) -> Result<()> {
        upstream_request.insert_header("Host", "one.one.one.one").unwrap();
        Ok(())
    }
}
```

## 创建 pingora 代理服务

接下来，让我们按照上述负载均衡器的说明创建一个代理服务。

pingora `Service` 侦听一个或多个（TCP 或 Unix 域套接字）端点。当建立新连接时，`Service` 将连接交给其“应用程序”。`pingora-proxy` 就是这样一个应用程序，它将 HTTP 请求代理到上面配置的给定后端。

在下面的示例中，我们创建一个具有两个后端 `1.1.1.1:443` 和 `1.0.0.1:443` 的 LB 实例。我们通过 `http_proxy_service()`调用将该 LB 实例放入代理 `Service`，然后告诉我们的 `Server` 托管该代理 `Service`。

```rust
fn main() {
    let mut my_server = Server::new(None).unwrap();
    my_server.bootstrap();

    let upstreams =
        LoadBalancer::try_from_iter(["1.1.1.1:443", "1.0.0.1:443"]).unwrap();

    let mut lb = http_proxy_service(&my_server.configuration, LB(Arc::new(upstreams)));
        lb.add_tcp("0.0.0.0:6188");

    my_server.add_service(lb);

    my_server.run_forever();
}
```

## 运行它

现在我们已经将负载均衡器添加到服务中，我们可以使用

```bash
cargo run
```

要对其进行测试，只需使用以下命令向服务器发送几个请求：

```bash
curl 127.0.0.1:6188 -svo /dev/null
```

您还可以将浏览器导航到 http://localhost:6188

以下输出显示负载均衡器正在完成跨两个后端平衡的工作

```bash
load_balancer on  master [?] is 📦 v0.1.0 via 🦀 v1.86.0 took 4s
❯ cargo run
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.21s
     Running `target/debug/load_balancer`
upstream peer is: Backend { addr: Inet(1.0.0.1:443), weight: 1, ext: Extensions }
upstream peer is: Backend { addr: Inet(1.1.1.1:443), weight: 1, ext: Extensions }
upstream peer is: Backend { addr: Inet(1.0.0.1:443), weight: 1, ext: Extensions }
upstream peer is: Backend { addr: Inet(1.1.1.1:443), weight: 1, ext: Extensions }
```

干得好！此时您有了一个功能性负载均衡器。不过，它是一个非常基本的负载均衡器，因此下一节将引导您了解如何使用一些内置的 pingora 工具使其更加健壮。

## 添加功能

Pinora 提供了几个有用的功能，只需几行代码即可启用和配置。这些范围从简单的对等健康检查到在零服务中断的情况下无缝更新正在运行的二进制文件的能力。

## 对等节点健康检查

为了使我们的负载均衡器更可靠，我们想向上游对等点添加一些健康检查。这样，如果有一个对等点出现故障，我们可以快速停止将流量路由到该对等点。

首先，让我们看看当其中一个对等点关闭时，我们的简单负载均衡器是如何表现的。为此，我们将更新对等点列表以包含一个保证被破坏的对等点。

```rust
fn main() {
    // ...
    let upstreams =
        LoadBalancer::try_from_iter(["1.1.1.1:443", "1.0.0.1:443", "127.0.0.1:343"]).unwrap();
    // ...
}
```

现在，如果我们再次使用`cargo run`运行负载均衡器，并使用

```bash
curl 127.0.0.1:6188 -svo /dev/null

```

我们可以看到每 3 个请求中就有一个失败，`502: Bad Gateway`。这是因为我们的对等点选择严格遵循 `RoundRobin` 选择模式，我们没有考虑该对等点是否健康。我们可以通过添加基本的健康检查服务来解决这个问题。

```rust
fn main() {
    let mut my_server = Server::new(None).unwrap();
    my_server.bootstrap();

    // Note that upstreams needs to be declared as `mut` now
    let mut upstreams =
        LoadBalancer::try_from_iter(["1.1.1.1:443", "1.0.0.1:443", "127.0.0.1:343"]).unwrap();

    let hc = TcpHealthCheck::new();
    upstreams.set_health_check(hc);
    upstreams.health_check_frequency = Some(std::time::Duration::from_secs(1));

    let background = background_service("health check", upstreams);
    let upstreams = background.task();

    // `upstreams` no longer need to be wrapped in an arc
    let mut lb = http_proxy_service(&my_server.configuration, LB(upstreams));
    lb.add_tcp("0.0.0.0:6188");

    my_server.add_service(background);

    my_server.add_service(lb);
    my_server.run_forever();
}
```

现在，如果我们再次运行并测试我们的负载均衡器，我们会看到所有请求都成功了，并且损坏的对等点从未使用过。根据我们使用的配置，如果该对等点再次恢复健康，它将在 1 秒内再次包含在 `roundrobin` 中。

## 命令行选项

pingora`Server`类型提供了许多内置功能，我们可以通过单行更改来利用这些功能。

```rust
fn main() {
    let mut my_server = Server::new(Some(Opt::parse_args())).unwrap();
    ...
}
```

通过此更改，传递给我们的负载均衡器的命令行参数将由 `Pinora` 获取。我们可以通过运行来测试：

```bash
❯ cargo run -- -h
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.08s
     Running `target/debug/load_balancer -h`
basic
Command-line options

USAGE:
    load_balancer [OPTIONS]

OPTIONS:
    -c, --conf <CONF>    The path to the configuration file.
    -d, --daemon         Whether this server should run in the background
    -h, --help           Print help information
    -t, --test           This flag is useful for upgrading service where the user wants to make sure
                         the new service can start before shutting down the old server process.
    -u, --upgrade        This is the base set of command line arguments for a pingora-based service
```

我们应该会看到一个帮助菜单，其中包含现在可供我们使用的参数列表。我们将利用下一节中的内容免费使用负载均衡器做更多事情

## 在后台运行

传递参数-d 或--daemon 将告诉程序在后台运行。

```bash
cargo run -- -d
```

执行以下命令检查是否存在后台进程

```bash
❯ ps -afx | grep load_balancer
  502 56897     1   0  1:06AM ??         0:00.00 target/debug/load_balancer -d
```

要停止此服务，您可以向其发送`SIGTERM`信号以进行正常关闭，其中服务将停止接受新请求，但在退出之前尝试完成所有正在进行的请求。

```bash
pkill load_balancer
```

## 配置

pingora 配置文件有助于定义如何运行服务。下面是一个示例配置文件，它定义了服务可以有多少线程、pid 文件的位置、错误日志文件和升级协调套接字（我们将在后面解释）。复制下面的内容，并将它们放入 `conf.yaml` 项目目录中的一个名为 `load_balancer` 的文件中。

```yaml
---
version: 1
threads: 2
pid_file: /tmp/load_balancer.pid
error_log: /tmp/load_balancer_err.log
upgrade_sock: /tmp/load_balancer.sock
```

要使用此 conf 文件：

```bash
RUST_LOG=INFO cargo run -- -c conf.yaml -d
```

`RUST_LOG=INFO` 在这里，以便服务实际填充错误日志。

现在您可以找到服务的 pid。

```bash
 cat /tmp/load_balancer.pid
```

## 优雅升级服务

（仅 Linux）

假设我们更改了负载均衡器的代码并重新编译了二进制文件。现在我们想将后台运行的服务升级到这个更新的版本。

如果我们简单地停止旧服务，然后启动新服务，一些到达之间的请求可能会丢失。幸运的是，Pinora 提供了一种优雅的方式来升级服务。

这是通过首先向正在运行的服务器发送`SIGQUIT`信号，然后使用参数`-u\--upgrade`启动新服务器来完成的。

```bash
pkill -SIGQUIT load_balancer &&\
RUST_LOG=INFO cargo run -- -c conf.yaml -d -u
```

在此过程中，旧的运行服务器将等待并将其侦听套接字移交给新服务器。然后旧服务器运行，直到其所有正在进行的请求完成。

从客户端的角度来看，服务始终在运行，因为侦听套接字永远不会关闭。
