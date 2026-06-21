# D8 skeleton invokes Claude Code via the `claude -p` subprocess, not the Agent SDK

Phase 0 的 D8（headless Claude 骨架）用 `claude -p "<prompt>"` 子进程（`node:child_process`），而不是 ADR-0012 推崇的 `@anthropic-ai/claude-agent-sdk`。

**为什么骨架阶段用子进程**：D8 是 skeleton-grade——只验证"在 Sandbox 内起一个 headless 调用、捕获输出、把非零退出/超时变成 Job 失败"。`claude -p` 正是 PRD 说的"headless mode"的字面实现；`child_process` + timeout 代码极少、机制可单测（用替身命令测超时/退出码/输出捕获）。

**为什么偏离 ADR-0012 的 SDK**：ADR-0012 选 TS 的核心理由是"SDK 让 D8 是一次函数调用而非子进程胶水"。骨架阶段反向选子进程，因为 (1) skeleton 只需跑通 + 捕获 + 失败处理，子进程更直接；(2) SDK 需要 `ANTHROPIC_API_KEY` 且把整个 agent loop 拉进来，对骨架过重；(3) 子进程机制在没有真 key 时仍可单测，SDK 路径不行。

**Phase 1 升级**：当 Stage 有真实 prompt 工程（Refinement 写 PRD 等），切到 `@anthropic-ai/claude-agent-sdk` 的 `query()`——结构化输出、工具调用、流式进度都更顺。worker 的 `StageDeps.runClaude` 注入点不变，只换实现，迁移成本局限在 `src/execution/claude.ts`。

**派生**：`runCommand`（通用"跑命令 + 超时 + 退出码 → 失败"封装，可测）+ `runClaudeHeadless`（`claude -p` 薄包装）。orphan GC（D10）跑在 worker 进程的粗粒度定时器里（`DEVFLOW_GC_INTERVAL_MS`），不引入独立 cron——单租户低频，同进程够用。
