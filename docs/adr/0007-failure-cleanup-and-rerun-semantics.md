# Failure cleanup: eager branch delete + Orphan GC fallback; failed Stage Runs are re-runnable

Implementation Job 失败时，远程 Feature Branch 不会自动消失（本地 Sandbox 删除即可，但远程分支会堆积成孤儿）。采用两层清理 + 重跑语义修正。

**清理策略：乐观即时清理 + Orphan GC 兜底**：

1. **正常失败走即时清理**：Job 在 finally 块里，若状态为 failed 且本 Job push 过 Feature Branch 但未产出 PR，删除该分支；本地 Sandbox 目录删除。

2. **worker 崩溃走 Orphan GC 兜底**：独立周期任务扫描所有 `devflow/*` 分支，若该分支无关联 PR（靠 GitHub 原生关系判断）且创建超过 24h，则删除。阈值是为了不误删"正在跑的 Job 刚 push 但还没开 PR"的分支。

**为什么孤儿分支判断靠 GitHub 原生关系而非本地数据库**：即使我们的数据库状态丢了（worker 崩、DB 不一致），GC 仍能正确判断。这是"用 GitHub 作为真相"的纪律，避免本地状态与远程事实漂移。

**为什么不是失败即放弃不清理**：远程会堆积大量 `devflow/*` 孤儿分支，几个月后仓库分支列表没法看，且失败分支可能被误以为是有效工作。

**重跑语义修正（精确化 ADR-0004 第 2 条）**：ADR-0004 定的"Stage 不可重跑"特指**已成功产出 Artifact 的 Stage Run 不可重跑**。失败的 Stage Run（无 Artifact）允许重试，且重试产生的是**新的 Stage Run**（新幂等键 = 新触发 comment id），不是原 Stage Run 的内部重试。这使 ADR-0004 的幂等性（同 comment id 只跑一次）与失败重试（新 comment id = 新 Stage Run）不冲突。
