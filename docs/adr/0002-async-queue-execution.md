# Stage execution is asynchronous via a work queue, never inline in the webhook handler

GitHub 要求 webhook 在 10 秒内返回 200，否则判定超时并重试。但 Refinement（写长 PRD）、Implementation（写代码）、Review 的单次 LLM 调用动辄几十秒到数分钟。webhook handler 只做三件事——校验签名、解析 Trigger、把任务写进队列——然后立即 200 返回。所有 LLM 执行在独立 worker 进程。

**为什么不是同步内联**：会违反 10 秒超时约束并触发重试风暴，且整个执行模型、错误处理、进度反馈会围绕"同步"展开，后续改异步等于重写一半。

**为什么不是同进程后台任务**：进程重启会丢任务。在 Implementation Stage 意味着"AI 改了一半代码然后任务没了，留下一堆半成品 commit"，这是不可接受的数据完整性风险。

**队列选型（MVP）**：单租户低 QPS，用数据库表当队列（一行 = 一个任务，带 `status: pending/running/done/failed`），天然持久化。迁多租户只需换队列后端（→ Redis / SQS），Stage 代码不动。

**进程结构**：webhook 服务与 worker 共享同一代码库不同入口（`app serve` vs `app worker`），共享同一套 Stage 代码。
