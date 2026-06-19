# @octokit/webhooks + thin Node http server for webhook ingest (not Probot, not hand-rolled)

D2 的签名校验 + D3 的事件解析输入用 `@octokit/webhooks`（时间安全签名校验 + 类型化命名事件 `issues` / `issue_comment` / `pull_request`），挂在极简 Node `http` server 上（`createNodeMiddleware`）。

**为什么不用 Probot**：Probot 是完整 GitHub-App 框架（路由 / auth / 事件分发 / 整个 app 模型），对 Phase 0 过重，且其 app 模型与 ADR-0002"两个普通入口点、同一代码库"别扭。

**为什么不手写 HMAC**：时间安全比较（timing-safe compare）容易写错（侧信道）；`@octokit/webhooks` 已久经验证，且顺手给出类型化事件，省掉 D3 输入侧的样板。

**派生**：webhook 服务入口用 `http.createServer` + `createNodeMiddleware`，不引入 Hono/Express（Phase 0 只有 `/webhook` 一条路由）；D2 验收变成对真实 `/webhook` 端点的集成测试（签名正确 → 接收，篡改 → 401），经公共接口测行为而非库内部。
