# Synthetic feature_id minted in our DB (Feature identity ≠ GitHub issue number)

Feature 的标识 `feature_id` 是我们数据库自分配的合成 id（`features` 表主键），不是任何 GitHub issue/PR 号码。Feature 行在**首次触发**（Refinement trigger）时按 `(repo, source_issue_number)` find-or-create；`prd_issue_number` 等 Refinement 真正产出 PRD Issue 后再回填（Phase 1）。

**为什么不用 PRD Issue 号当 feature_id**：CONTEXT.md 定义 PRD Issue 是 Feature 的根，但 PRD Issue 是 Refinement 的**产出**，在触发 enqueue 时还不存在。而 D4 的幂等键 `(feature_id, stage, trigger_comment_id)` 与排他索引 `UNIQUE(feature_id, stage)` 都要求 feature_id 在 enqueue 时就有值。用产出物的 id 当主键，会在它诞生前的时刻留下空洞。

**为什么不用 Intake Issue 号当 feature_id**：CONTEXT.md 明确"Intake Issue 不属于 Feature"——它是触发 Feature 诞生的 Conversation 载体，不是 Feature 的一部分。拿它当 feature_id 会把"身份"和"投影指针"混为一谈，且 Refinement 产出 PRD Issue 后会混淆"根到底是哪个 issue"。Intake Issue 在 features 表里只是 `source_issue_number` 这一个引用列。

**身份与投影分离**：Feature 的身份存于我们自己的数据库（合成 id），GitHub 上的 Intake Issue / PRD Issue / 子 issue / PR 号都只是 features 表及其关联表上的**指针**。这与 CONTEXT.md"Feature 本身存于我们自己的数据库"一致，只是精确化：我们的数据库持有合成主键，GitHub 号码是引用。
