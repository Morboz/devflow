# Fast, synchronous, non-stage replies (help + exclusivity rejection) are posted inline by the webhook (narrow exception to ADR-0002)

裸 `@devflow`（无命令）的命令列表回复，以及 Active Stage Run Exclusivity 拒绝（ADR-0010 规则 2）的"Stage already in progress"提示，都由 webhook handler **内联**发出，不走队列。这是 ADR-0002"webhook 只做 verify → parse → enqueue → 200、不内联"的**窄例外**。

**两类回复同属一个窄例外类**（S5 补充第二条）：

1. **help reply**（裸 `@devflow`）：命令列表。
2. **exclusivity rejection**（新触发被 ADR-0010 规则 2 拒绝）：`⏳ \`{stage}\` is already in progress …`。拒绝时**没有 Job 产生**（enqueue 返回 `rejected`，不进队列），无从通过 worker/progress comment 反馈，所以这条提示本身就是全部反馈，必须在 handler 内联发出。

**为什么例外**：help reply 不是 Stage，塞不进 stage_run/job 模型（ADR-0015：每个 job 属于有 stage 的 stage_run）；它是**同步的、面向用户的确认**（类似内联返回错误体），不是流水线阶段；且是单次快速 GitHub comment（不是会撑爆 10s 超时的慢 LLM/clone）。

**代价**：webhook 重试时可能重复发 help / rejection 评论——但**仅美观问题，非危险**（无副作用、无状态），MVP 可接受。rejection 重复的前提是 slot 仍非终态，重试之间状态未变，重复提示无害。

**边界**：此例外仅限"非阶段、同步确认"这一类（help reply、exclusivity rejection）；任何 Stage 执行（refinement / decomposition / implementation / review）绝不内联，仍走队列。
