# Progressive dogfood: develop DevFlow using DevFlow itself, one Stage at a time

DevFlow app 用它自己的开发流程来开发。采用**分阶段渐进 dogfood**：每实现一个 Stage，立即用它驱动下一个 Stage 的开发。

**为什么不从零全流程 dogfood（结构 A）**：悖论——app 不存在时无人响应 `/refine`，没有 Refinement 就产不出 PRD，没有 PRD 就没法开发 app。必须先用 Stage Stand-in（人扮演未实现的 Stage）启动循环。

**为什么不在 v2 才 dogfood（结构 C）**：dogfood 的全部价值在"开发过程中暴露设计缺陷"。等 v2 再 dogfood，v1 里犯的设计错误已经固化。

**开发顺序锁定为 Stage 顺序**：`Refinement → Decomposition → Implementation → Review`。只有前一个 Stage 能用了，才有意义用它开发下一个。Refinement 最简单（读 issue + 写 PRD，无仓库副作用），先做风险最低、最快进入 dogfood 循环；Implementation 最难放最后，那时前三个 Stage 已稳定，能给它的开发提供高质量 PRD 和拆分。违反"先做最难的"直觉，但渐进 dogfood 要求这个顺序。

**Stage Stand-in 与 Cutover**：某 Stage 实现就绪前由人扮演（产出相同 Artifact，打 `handcrafted` 标签区别于 `devflow:prd` 等自动标签，使 dogfood 数据可追溯）。一旦实现就绪发生 Cutover，该 Stage 新触发走 app；已存在的 Stand-in Artifact 保留不重做。

**Phase 0 不 dogfood**：基础设施（GitHub App 注册、webhook 接收、签名校验、队列表、worker 骨架、Sandbox、Claude Code headless 集成、installation token 获取）是 dogfood 的地基，必须先于任何 Stage 用传统方式开发。
