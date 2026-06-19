# devflow

一个通过 GitHub App 形态介入仓库开发进程的 AI 助手：把模糊需求/bug 细化成 PRD，拆成子 issue，自主开发并提 PR，最后 review PR 并回复。MVP 以单租户运行，但架构上为多租户预留。仓库：`Morboz/devflow`。

## Language

**Installation**:
一个 GitHub App 的安装实例，绑定到一个用户或组织，覆盖一组仓库。单租户 MVP 阶段只有一个 installation，但代码中的所有鉴权、配置、密钥访问都按 installation 维度进行，以便未来平滑迁移到多租户。
_Avoid_: 账号、workspace、租户

**Stage**:
开发进程流水线中的一个阶段。当前共四个：Refinement（需求→PRD）、Decomposition（PRD→子 issue）、Implementation（子 issue→PR）、Review（PR→回复）。每个 Stage 对应一个显式 slash 命令（`/refine`、`/decompose`、`/implement`、`/review`），命令名即 Stage 名。
_Avoid_: 步骤、phase、阶段（用英文 Stage 作为术语锚点）

**Conversation**:
开发者与 app 围绕一个需求进行沟通的抽象通道。它不是 GitHub 原生对象，是一个语义概念：需求在这里从模糊聊到清晰。当前的唯一实现是 Intake Issue；未来可被其他形态（chat UI、DM、外部集成）取代。MVP 不为它建实现层抽象，但语义上与"工件"严格区分。
_Avoid_: 对话、讨论、thread

**Intake Issue**:
Conversation 的当前实现载体——开发者提交初始需求或 bug 并与 app 沟通的 GitHub issue。它的职责是"把需求聊清楚"，PRD 生成后即退出生命周期。它不是需求契约（契约是 PRD），不是 Feature 的根（根是 PRD Issue）。
_Avoid_: 原始 issue、需求 issue、source issue

**PRD Issue**:
Refinement Stage 产出的、承载 PRD 的独立 GitHub issue（带 `devflow:prd` label）。它是 Feature 的根，是后续所有 Stage 的事实来源。Decomposition 拆出的子 issue 挂在它之下。
_Avoid_: PRD 文档、spec issue

**Feature**:
流水线的状态单元（聚合根）。一个 Feature = 一个 PRD Issue + 它拆出的所有子 issue + 子 issue 产生的所有 PR。Intake Issue 不属于 Feature（它在 Feature 诞生前就退场）。GitHub 上的 issue/PR 只是 Feature 各部分的投影，Feature 本身存于我们自己的数据库。
_Avoid_: 需求、项目、epic

**Stage Run**:
一个 Stage 在一个 Feature 上的一次语义执行——从触发到产出 Artifact（或失败）。一个 Stage Run 可能对应多个 Job（首个 Job 失败时重试起下一个 Job）。Stage Run 是领域视角，Job 是执行视角。**已成功产出 Artifact 的 Stage Run 不可重跑**（修改走 Artifact 内对话或新 Stage Run）；**失败的 Stage Run（无 Artifact）可重跑**，重试产生新的 Stage Run（新幂等键 = 新触发 comment id），不是原 Stage Run 的内部重试。
_Avoid_: 任务执行、run

**Artifact**:
Stage 的产出工件，被持久化、可跨 Job 存在。Refinement 产出 PRD Issue；Decomposition 产出子 issue；Implementation 产出 Plan 和 PR（两个 Artifact）；Review 产出 review 评论。一个 Stage Run 的完成判定只看最终 Artifact 是否产出（Implementation 看 PR，不看 Plan），不看 Artifact 质量（质量由下游 Stage 或人工把关）。中间 Artifact（如 Plan）跨 Job 存在，被后续 Job 消费。
_Avoid_: 产出物、result、输出

**Plan**:
Implementation Stage 的第一个 Artifact。在计划门阶段产出，包含"改哪些文件、大致方案、风险点"，作为评论发到子 issue。它是被持久化的中间工件：产出它的 Job 结束后，Plan 仍在数据库中，等"批准"触发的新 Job 消费它来写代码。Stage Run 完成判定不看 Plan（看 PR），但 Plan 是必经的中间产物。
_Avoid_: 实施计划、方案、design doc

**Sandbox**:
Worker 执行 Job 时克隆仓库的临时工作目录，**所有 Stage 的 Job 都需要**（不只是 Implementation），因为每个 Stage 都要结合现有代码仓库才能产出有价值的工件。每个 Job 一个独立临时目录（`/tmp/devflow-jobs/<job_id>`），Job 结束（无论成功失败）即删除。纪律：浅 clone（`--depth=50`）、installation token 推送、只推 feature 分支、绝不 push 到主分支。
_Avoid_: 工作区、workspace、容器

**Execution Engine**:
所有 Stage 的统一执行引擎——Claude Code headless（或等价的现成 agentic coding agent，在 Sandbox 内运行）。DevFlow 只做编排（Sandbox、clone、触发、捕获输出并落成 GitHub Artifact），认知工作（读代码、推理、产出文本/改文件）全部交给 Execution Engine。不抽象 LLMClient，只持有 provider 配置（model、key），provider 选型待定。
_Avoid_: LLM 层、模型调用层

**Feature Branch**:
Implementation Job 推送代码的分支，命名约定 `devflow/<feature-slug>-<subissue-number>`。永远从 feature 分支开 PR，不从主分支开 PR。Job 正常失败时（finally 块）若已 push 但未产出 PR，worker 即时删除该分支；worker 崩溃留下的孤儿分支由 Orphan GC 兜底清理。
_Avoid_: bot 分支、临时分支

**Orphan GC**:
独立的周期性清理任务，扫描仓库所有 `devflow/*` 分支：若该分支无关联 PR（靠 GitHub 原生关系判断，不依赖本地数据库）且创建超过阈值（24h，避免误删正在跑的 Job 刚 push 未开 PR 的分支），则删除。兜底覆盖 worker 崩溃导致 finally 未执行的场景。用 GitHub 作为真相。
_Avoid_: 分支清理器、垃圾回收

**App Permission**:
GitHub App 申请的最小权限集，MVP 锁定四个 scope：Contents Write（push/clone）、Issues Write（创建/关闭 issue、发评论）、Pull requests Write（创建 PR、发 review）、Metadata Read（GitHub 强制前提）。明确不碰 CI/Workflows、Admin、Organization——app 只做事不治理。scope 在 installation token 层不可细分（GitHub 限制），靠应用层纪律约束每个 Stage 只调该调的 API。
_Avoid_: 权限、scope

**Installation Token**:
GitHub App installation 的访问令牌，短期（1 小时）。worker 每个 Job 开始时获取新 token，Job 结束丢弃，不缓存长期 token。配合 Sandbox 纪律（ADR-0006）缩小泄漏爆炸半径。
_Avoid_: 凭据、access token

**Provider Config**:
Execution Engine 运行所需的 provider 配置（model、API key 等）。DevFlow 不抽象 LLMClient，直接持有这份配置。单租户 MVP 只有全局默认值一份；多租户时它是 per-installation 候选字段（每个 installation 可带自己的配置）。provider 选型（Anthropic 等）待定。
_Avoid_: LLM 配置、模型配置

**Active Stage Run Exclusivity**:
并发约束：一个 (Feature, Stage) 上同一时刻最多只能有一个非终态（`running` 或 `awaiting_plan_approval`）的 Stage Run。用数据库唯一索引实现（`UNIQUE(feature_id, stage) WHERE status IN ('running','awaiting_plan_approval')`）。worker 接到新触发时若违反此约束，拒绝并回复"Stage already in progress"。不引入分布式锁——单租户低 QPS 下唯一索引足够可靠。
_Avoid_: 锁、互斥锁、并发锁

**Stage Stand-in**:
渐进 dogfood 期间的临时形态——某个 Stage 的自动实现就绪前，由人扮演该 Stage 的角色，产出与该 Stage 相同的 Artifact（人工写 PRD Issue、人工拆子 issue、人工开 Draft PR）。Stand-in 产出与自动产出在 Artifact 形态上一致，差别只在"谁产的"。用 `handcrafted` 标签标记 Stand-in 产出的 Artifact，区别于 `devflow:prd` 等自动产出标签，使 dogfood 数据可追溯。
_Avoid_: 人工 Stage、manual stage、human-in-the-loop

**Cutover**:
某个 Stage 从 Stand-in 模式切换到自动模式的时刻。每次 Cutover 之后，该 Stage 的新触发走 app，不再人工；已存在的 Stand-in Artifact 保留不重做（它们是有效的）。Phase 1-4 各对应一次 Cutover。
_Avoid_: 切换、上线、启用

**Draft PR**:
Implementation Stage 产出的 PR 默认形态。draft 状态不通知 reviewer、不进入合并队列，明确语义为"代码已写完但待审"。用户手动转 ready-for-review 或直接 `@app /review` 触发 Review Stage。
_Avoid_: 草稿 PR

**Progress Comment**:
Job 的附属物（不是 Artifact）。触发时立即在 issue 上发一条占位评论（"🤖 `<stage>` started"），消除"是不是没触发"的焦虑。Job 执行过程中编辑同一条评论追加**粗粒度里程碑**（3-5 个/Stage，如 Refinement: `reading intake → drafting PRD → done`；Implementation: `writing code → running tests → pushing branch → opening PR`）。Job 结束时最后一行为成功回执（"✅ done, see #NNN"）或失败回执（"❌ failed: <reason>"）。里程碑触发更新，不是时间心跳。
_Avoid_: 状态评论、进度条、log

**Plan Gate**:
Implementation Stage 的内置步骤（非可选）。Stage Run 经历 `planning` → `awaiting_plan_approval` → `implementing` → `done` 四个子状态。`awaiting_plan_approval` 是 Stage Run 的持久化暂停态（Job 已结束，不是 worker 阻塞），等用户批准触发新 Trigger 推进。是"AI 动仓库前"的廉价纠偏机会。
_Avoid_: 审批门、review gate

**Approval**:
用户对 Plan 的批准动作，是一次新的 Trigger（走完整 webhook→Job 流程，幂等键为批准评论的 comment id）。它把 Stage Run 从 `awaiting_plan_approval` 推进到 `implementing` 并起新 Job，新 Job 读取已有 Plan 继续写代码。批准不是 Stage Run 内部的隐式状态推进。
_Avoid_: 确认、go signal

**Trigger**:
启动一个 Stage Run 或推进一个暂停态 Stage Run 的事件。三种来源：(1) 显式 slash 命令（权威触发，对应一次明确的用户授权）；(2) 带 `devflow` label 的新 issue 打开时自动触发 Refinement（唯一隐式触发，opt-in）；(3) Approval（批准 Plan，推进 Implementation Stage Run 从 `awaiting_plan_approval` 到 `implementing`，走完整 webhook→Job 流程）。
_Avoid_: 事件、调用

**Activation Label (`devflow`)**:
打在 issue 上的标签，表示"该 issue 应进入 DevFlow 流程"。新 issue 带此 label 时自动触发 Refinement；不带则不触发。是隐式触发的唯一开关。
_Avoid_: 触发标签、自动标签

**Job**:
一次 Stage 的执行实例。由 Trigger 创建，写入任务队列，由 worker 消费。每个 Job 有 `status: pending/running/done/failed`。webhook handler 只负责创建 Job 并立即 200 返回，不执行任何 LLM 调用。
_Avoid_: 任务、task、run

**Webhook Handler**:
接收 GitHub webhook 的同步入口。职责严格限定为：校验签名 → 解析 Trigger → 创建 Job → 200 返回。绝不内联执行 LLM。
_Avoid_: 请求处理、callback

**Worker**:
独立进程，从队列消费 Job 并执行对应的 Stage（LLM 调用、GitHub 写操作都在这里发生）。与 webhook 服务同代码库不同入口（`app serve` vs `app worker`）。
_Avoid_: 后台进程、consumer
