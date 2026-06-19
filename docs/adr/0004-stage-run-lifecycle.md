# Stage Run lifecycle: artifact-based completion, no rerun, forced idempotency, no auto-flow

定义 Stage Run（一个 Stage 在一个 Feature 上的一次语义执行）的四条生命周期规则，它们共同决定 app 行为的可预测性。

**1. 完成判定只看 Artifact 是否产出，不看质量**：Refinement 完成 = PRD Issue 已创建；Decomposition 完成 = 子 issue 已创建；Implementation 完成 = PR 已创建；Review 完成 = review 评论已发布。质量判定需要人或下游 Stage 反馈，塞进完成判定会让 Stage Run 永远卡在"不确定是否完成"。

**2. Stage 不可重跑**：一旦 Stage Run 产出 Artifact 并驱动下游（如 Decomposition 已基于旧 PRD 拆了子 issue），重跑上游会破坏下游一致性。想修改 PRD 的正确路径是在 PRD Issue 内继续和 app 对话（触发"PRD 修订"语义的轻量执行），而非重新 Refinement。

**3. 强制幂等，幂等键 = 触发评论的 GitHub comment id**：GitHub webhook 会因超时重试、用户可能手抖连 @ 两次。用 `(feature_id, stage, trigger_comment_id)` 作幂等键，相同键的重复 Trigger 只跑第一次，worker 消费前先查该 comment id 是否已产生过 Job。

**4. Stage 间绝不自动流转，每个 Stage 都需显式 `/refine`、`/decompose`、`/implement`、`/review`**：自动流转意味着 AI 自己决定何时改代码，违反"显式命令是权威触发"（ADR-0001）原则，且会让 Implementation 阶段的错误级联。未来可能加"批处理模式"（`/implement --all-subissues`），但那是用户一次性显式授权所有子 issue，不是隐式自动流转。
