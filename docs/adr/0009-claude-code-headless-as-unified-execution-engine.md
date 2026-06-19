# All four Stages run via Claude Code headless as the unified Execution Engine

四个 Stage 的认知工作全部交给 Claude Code headless（或等价现成 agentic coding agent），在 Sandbox 内运行。DevFlow 只做编排（Sandbox、clone、触发、捕获输出落成 GitHub Artifact），不自研 agent loop，不抽象 LLMClient。

**为什么不分层（不是 Implementation 用 Claude Code、其余三 Stage 用直接 LLM API）**：

每个 Stage 都需要结合现有代码仓库才能产出有价值的工件——

- Refinement：盲写的 PRD 会脱离架构现状（不知道已有什么、用了什么模式、什么可行）。
- Decomposition：拆子 issue 不懂代码结构，会拆出和现有模块边界对不上的任务。
- Review：不读周边代码就评审 diff，等于瞎审。

给原始 LLM API 喂代码上下文，得自己解决"哪些文件相关、怎么读、读多少"——这恰恰是 agentic coding agent 解决的核心难题。用同一引擎统一执行，更轻、更一致。

**为什么不自研 agent loop**：Implementation 的核心价值是"把 Plan 变成能跑的代码"，这是现成 coding agent 框架已解决的问题。DevFlow 的差异化在流水线编排（PRD→拆分→实现→review 的状态机和触发），不在 agent loop 本身。自研是重新发明轮子，且很难比专门做这个的框架做得好。

**为什么不抽象 LLMClient**：抽象层在 provider 数量为 1 时是过度设计。DevFlow 直接持有 Provider Config（model、key）。provider 选型待定，单租户 MVP 只用全局默认值；多租户时 Provider Config 升为 per-installation 字段。

**派生后果（精确化既有决策，非新决策）**：

1. **Sandbox 扩大为所有 Stage 的必需品**（修正 ADR-0006 的"Implementation Sandbox"措辞）：每个 Stage 的 Job 都在独立 Sandbox 跑。
2. **只 Implementation 改动仓库，其余三 Stage 对仓库只读**：Orphan GC 只可能触及 Implementation（其余 Stage 不推分支）；只读 Stage 用浅 clone、无可写挂载、失败仅删本地目录。
