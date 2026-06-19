# Concurrency handled by idempotency key + Active Stage Run Exclusivity + data-integrity, no distributed locks

异步队列 + 用户可随时触发，会引出并发。不引入分布式锁（Redis 等），靠三条规则覆盖所有并发场景：

**规则 1 — 幂等键去重（ADR-0004 第 3 条，已定）**：同一 Trigger（GitHub webhook 重试、用户连发）被 `(feature_id, stage, trigger_comment_id)` 去重，相同键只跑第一次。解决"同一 Stage Run 的并发重复"和"批准并发"。

**规则 2 — Active Stage Run Exclusivity**：一个 (Feature, Stage) 上同一时刻最多只能有一个非终态（`running` / `awaiting_plan_approval`）的 Stage Run。用数据库唯一索引实现（`UNIQUE(feature_id, stage) WHERE status IN ('running','awaiting_plan_approval')`）。worker 接到新触发时若违反，拒绝并回复"Stage already in progress"。解决"同一 Stage 被新触发（不同 comment id）并发"。

**规则 3 — 跨 Stage 并发不阻止，数据完整性自然约束**：上游未完成时下游可触发，但会因数据不存在而失败（如 implement 一个尚未被 decompose 出的子 issue，worker 读 Feature 发现目标子 issue 不存在，Stage Run failed 并在 Progress Comment 写明）。不预判、不强校验上游状态，让数据本身说话。

**为什么并发执行不冲突**：不同 Job 用各自独立 Sandbox（ADR-0006，`/tmp/devflow-jobs/<job_id>`），文件层面不互相干扰；不同子 issue 的 Implementation push 到不同 Feature Branch（分支名带子 issue 号），执行级不冲突。两个 PR 改同一文件的逻辑冲突是合并时的问题（reviewer/Review Stage 发现），不是执行时的并发 bug，DevFlow 不管。

**为什么不引入分布式锁**：单租户低 QPS 下，唯一索引比锁简单可靠，且 schema 定下后是硬约束（不容易被绕过）。引入 Redis 锁是过度工程。
