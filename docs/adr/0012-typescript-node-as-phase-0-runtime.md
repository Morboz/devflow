# TypeScript / Node.js as the Phase 0 runtime

devflow 的 webhook 服务、worker、DB 层、测试用 TypeScript (Node.js) 实现。决定性理由是 D8——在 Sandbox 内 headless 调用 Claude Code 是 Phase 0 风险最高、最具新意的部分，而 Claude Code 本身是 Node 工具，官方 Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) 把"带 prompt 在指定目录内运行、捕获结构化输出"变成一次函数调用。任何其他运行时都只能 shell 出 `claude -p` 子进程（进程 spawn、stdout 捕获、超时、非零退出处理），这恰恰是 D8 验收标准明确禁止的"失败表现为崩溃"的来源。

**为什么不是 Python**：Python 的 Claude Agent SDK 同为一等公民，FastAPI + sqlite3 完全可行，是最接近的真实替代。选 TS 的差别在 D8 的 SDK 故事最干净、与 Claude Code 同生态，版本/协议漂移面最小。

**为什么不是 Go**：Go 的部署故事最强（真单二进制，`serve` / `worker` 双入口天然契合 ADR-0002），worker 并发也好。但 Go 没有原生 Claude Agent SDK，D8 只能走 `claude -p` 子进程胶水——正是上面要规避的崩溃面。D8 的风险盖过 Go 的部署收益。

**派生约束**：webhook 服务与 worker 共享同一 TS 代码库、两个入口（契合 ADR-0002）；DB 驱动用 `node-postgres`（见 ADR-0013）。
