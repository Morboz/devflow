# Bare-@devflow help reply is posted inline by the webhook (narrow exception to ADR-0002)

裸 `@devflow`（无命令）的命令列表回复，由 webhook handler **内联**发出，不走队列。这是 ADR-0002"webhook 只做 verify → parse → enqueue → 200、不内联"的**窄例外**。

**为什么例外**：help reply 不是 Stage，塞不进 stage_run/job 模型（ADR-0015：每个 job 属于有 stage 的 stage_run）；它是**同步的、面向用户的确认**（类似内联返回错误体），不是流水线阶段；且是单次快速 GitHub comment（不是会撑爆 10s 超时的慢 LLM/clone）。

**代价**：webhook 重试时可能重复发 help 评论——但**仅美观问题，非危险**（无副作用、无状态），MVP 可接受。

**边界**：此例外仅限 help reply 这一类非阶段、同步确认；任何 Stage 执行（refinement / decomposition / implementation / review）绝不内联，仍走队列。
