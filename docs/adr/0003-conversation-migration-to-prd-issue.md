# Conversation migrates to PRD Issue; Intake Issue closes once PRD is produced

开发者提交需求并和 app 沟通的载体是 **Intake Issue**，但它只是 **Conversation**（抽象沟通通道）的当前实现。Refinement Stage 产出 **PRD Issue** 后，Intake Issue 立即被关闭（closed，不删除），并留一条自动评论指向 PRD Issue。之后所有需求讨论在 PRD Issue 进行。

**为什么 PRD Issue 是 Feature 的根，而不是 Intake Issue**：Intake Issue 的职责是"把需求聊清楚"，聊完即退场；它是用过即弃的入口。Feature（聚合根）必须锚定在一个长生命周期的工件上——PRD Issue 是后续 Decomposition/Implementation/Review 的唯一事实来源，自然承担根的角色。

**为什么 Conversation 是抽象、issue 是实现**：开发者明确希望"以后有更合理的沟通途径（chat UI、DM、外部集成）时可以取代原始 issue 的功能"。把 Conversation 定义为与载体解耦的语义概念，使得未来替换实现不破坏 Feature 模型。

**为什么 Intake Issue 被关闭而不是保留 open**：保留 open 会造成两个 issue 同时承载需求讨论，沟通通道分裂、追溯链混乱。关闭并自动评论指向 PRD Issue，保持"任意时刻只有一个活跃沟通通道"。

**Intake Issue 关闭 ≠ 删除**：GitHub 不允许 app 删除他人 issue；内容永久保留，可被 permalink 引用，作为"需求如何演化成 PRD"的历史记录存在。
