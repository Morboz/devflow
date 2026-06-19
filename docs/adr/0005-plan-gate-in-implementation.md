# Plan Gate as a built-in step in Implementation Stage

Implementation Stage 在产出 PR 之前内置一道 Plan Gate（计划门），不可跳过。Stage Run 经历四个子状态：`planning` → `awaiting_plan_approval` → `implementing` → `done`。

**为什么需要计划门**：`/implement` 授权了"开始实现"，但没授权"无限制写代码"。Implementation 是四个 Stage 里副作用最强的（commit、推分支、开 PR），必须在动仓库前给一次廉价纠偏。在计划阶段改一句话，和回滚一个跑偏的 PR + 清理分支 + 重跑，成本差一个数量级。

**为什么是内置而非可选**：MVP 阶段信任未建立，用户需要先多次看到"它产出的计划是对的"才会信任它直接写代码。计划门是默认护栏；未来加 `@app /implement --auto` 跳过计划门是显式的高授权单次行为，不是默认。

**为什么只有一道门而不是两道**：PR 门和 Review Stage + GitHub CI/人工 review 功能重叠，加 PR 门是重复劳动。计划门是必要的（动仓库前的纠偏），PR 门是冗余的。

**两个关键澄清**：

1. **Plan 升格为 Artifact**：计划门把 Implementation 切成两半，两个半场各产出一个 Artifact——Plan（中间，跨 Job 持久化）和 PR（最终）。Stage Run 完成判定仍只看 PR，但 Plan 是必经的中间产物。

2. **Approval 是一次新 Trigger，不是 Stage Run 内部隐式推进**：`awaiting_plan_approval` 是 Stage Run 的**持久化暂停态**（Job 已结束、worker 不阻塞、状态存在数据库），不是 Job 的阻塞等待。用户回复 `approve` 触发一个新 webhook，走完整 handler→入队→worker 流程，起新 Job 读取已有 Plan 继续写代码。这让"批准"和任何其他用户输入走同一条路径，状态机统一。Approval 的幂等键 = 批准评论的 comment id。
