# Stage Run and Job modeled as separate tables from Phase 0

ADR-0004 把 **Stage Run**（领域视角，一个 Stage 在一个 Feature 上的一次语义执行）与 **Job**（执行视角，队列行）分开，且失败重试时一个 Stage Run 对应多个 Job。我们从 Phase 0 起就用两张表（`stage_runs` + `jobs`）建模，而不是为 Phase 0 折叠成单张 jobs 表。

**为什么不一表（jobs）扛到底**：折叠会把排他性/幂等性（Stage Run 语义）与 claim/租约（Job 执行语义）塞进同一张表的状态机；Phase 1 要加重试/Plan Gate 时，得改约束、迁数据、改 worker。

**为什么从 Phase 0 就分开**：分开后约束自然落到对的层——幂等键 `(feature_id, stage, trigger_comment_id)` 与 Active Stage Run Exclusivity 索引（ADR-0010）落在 `stage_runs`（Stage Run 状态），worker 的 `FOR UPDATE SKIP LOCKED` claim 与租约落在 `jobs`（Job 状态）。Phase 0 虽是 1:1，但这条接缝让状态机从一开始就在对的层级，Phase 1 加重试/Plan Gate 只增不改。

**代价**：Phase 0 多一张"暂无多重 Job"的表。但它立刻承担排他性/幂等性约束，并非空壳。

**派生**：`stage_runs` 持 `feature_id`、`stage`、`status`、`trigger_comment_id`；`jobs` 持 `stage_run_id`、自己的 `pending/running/done/failed` 状态与租约列（见 D5）。
