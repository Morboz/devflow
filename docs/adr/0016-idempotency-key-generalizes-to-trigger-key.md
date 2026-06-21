# Idempotency key generalizes from comment id to trigger_key (covers label triggers)

ADR-0004 定幂等键 = 触发评论的 GitHub comment id。但 D3 的 `devflow`-label 新 issue 触发是 `issues` 事件，**没有 comment**，comment id 覆盖不到。把幂等键从"comment id"泛化为 `trigger_key` 字符串，命名触发动作本身：

- comment 触发 → `trigger_key = "comment:" + commentId`
- label 触发 → `trigger_key = "issue-label:" + issueNumber`

幂等约束 `UNIQUE(feature_id, stage, trigger_key)` 落在 `stage_runs`（ADR-0015）。

**为什么不用 comment id 一刀切**：label 触发无 comment，硬套 comment id 会留空洞或需要特判。

**为什么 issue-number 作 label 触发的 key 不会误伤重试**：label 触发是**初始 opt-in**，同一 issue 的 label 反复增删不应反复触发 Refinement（issue-number key 正好去重）。失败重试不走 label——按 ADR-0007（重试 = 新触发，新 trigger_key）+ ADR-0001（显式命令权威），重试由显式 `@devflow /refine` comment 触发，拿到全新 `trigger_key`。

**派生**：parser 输出为 `ignore | help | trigger` 三态判别联合（ADR-0001 裸 @devflow → help）；`feature_id` 不进 parser 输出，由 enqueuer 从 target 解析，保持 parser 纯净无 DB（TDD 友好）。
