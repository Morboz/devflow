# Worker lease expiry fails the job + stage_run (no auto-requeue); retry is a new explicit trigger

Worker claim 用 `FOR UPDATE SKIP LOCKED`（ADR-0013）。claimed 的 job 带 `lease_expires_at`；过期（worker 崩溃）时**标记 job + stage_run 为 failed**，不自动 re-queue。

**为什么不自动 re-queue**：自动重跑同一个 job 可能重复执行副作用（clone、部分 push），且 ADR-0007 明确重试 = 新的显式触发（新 stage_run、新 trigger_key），不是原 job 的内部重试。自动 re-queue 直接违反 ADR-0007，在"AI 改仓库"场景下双写风险不可接受。

**崩溃时的清理兜底**：ADR-0007 的 finally 块即时清理在 worker 崩溃时不会执行 → Orphan GC（D10）兜底删孤儿分支。lease 过期 → failed 满足 D5"无永久卡住的 running job"。

**派生**：lease 超时可配置，默认 30 min（Phase 0 job 瞬时故任意；Phase 1 LLM job 需余量）；单 worker 循环每 tick 先回收过期 lease 再 claim；lease 续约/心跳延后到 Phase 1（长 job 运行中保活），Phase 0 job 单 tick 完成。
