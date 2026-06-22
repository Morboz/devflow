# Phase-0 provider: BigModel via Claude Code headless (Anthropic-compatible); lock-in is to the Messages API shape, not the vendor

D8 骨架的 Provider 选型锁定为 **BigModel（智谱）的 Anthropic-compatible 端点**（`https://open.bigmodel.cn/api/anthropic`，Claude Code 会自动补 `/v1/messages`），通过 `claude -p` headless 子进程调用（ADR-0020）。model / key / baseUrl 全部从 `DEVFLOW_PROVIDER_*` env 读入（ADR-0009 直接持有 Provider Config，不做抽象层），不在代码里硬编码。

**为什么是 BigModel**：Phase 0 只需"skeleton-grade"——证明引擎能跑、能捕获输出、失败变 Job 失败。BigModel 的端点与 Anthropic Messages API 线缆格式兼容，所以无需改 Claude Code 的调用方式，把 `ANTHROPIC_BASE_URL` 指过去即可。模型选 `glm` 系列，在 issue #6 的 trivial prompt（"List the files in this repository."）下足以产出引用 sandbox 内容的应答。

**lock-in 是否 meaningful——是，但它是 ADR-0009/0020 已经接受的那一种，本次不新增**：

- **厂商锁定：否。** vendor 和 model 都是 config（env）字符串，换 provider = 换 `DEVFLOW_PROVIDER_*`，不动代码。ADR-0009 明确"provider 数量为 1 时不抽象 LLMClient"，正是为了让这里保持一行配置的可替换性。
- **线缆格式锁定：是（有意的）。** 真正的绑定是 **Anthropic Messages API 的请求/响应形状** + **Claude Code CLI 的调用形状**（`claude -p`、`ANTHROPIC_*` env）。只有暴露 Anthropic-compatible `/v1/messages` 的 provider 能直接接（BigModel 可以）。这个绑定是 ADR-0009「四个 Stage 统一用 Claude Code headless 作为 Execution Engine」的直接后果——选 agentic coding agent 就选了它的协议。

**因此无需新增抽象、无需 provider adapter**：现有 lock-in 的边界已经被 ADR-0009（不做 LLMClient 抽象）和 ADR-0020（骨架用子进程、Phase 1 升 SDK）框定。本 ADR 只是把 Phase 0 的具体 provider 落纸，满足 PRD D8「provider 选型记录在案；lock-in meaningful 时写 ADR」。

**迁移路径（若未来要脱离 Messages API 形状）**：换 provider 模型——改 env；换一个非 Anthropic-compatible 的 provider——那时 ADR-0009 的"统一引擎"前提动摇，需要在 Stage 级引入 provider 适配或改用其它 coding agent 框架，属于 Phase 1+ 的重新决策，不是 Phase 0 范围。Phase 1 的既定升级（ADR-0020：子进程 → `@anthropic-ai/claude-agent-sdk` 的 `query()`）保持 Messages API 形状不变，`claudeRunner` 注入点不动，迁移成本仍局限在 `src/execution/claude.ts`。
