# Minimal GitHub App permissions; Review Stage only comments, never approves

App 申请最小权限集：Contents Write、Issues Write、Pull requests Write、Metadata Read。明确不碰 CI/Workflows、Admin、Organization。Installation token 短期（1 小时），每 Job 获取新 token、结束丢弃。Review Stage 只发评论，不做 APPROVE / REQUEST_CHANGES。

**为什么最小权限**：用户安装时看到三个 Write 权限已很警惕，再加 Workflows/Admin 会让企业用户拒绝安装。Contents Write 是 Implementation 的必需代价（最强权限，能改所有代码），爆炸半径已经够大，再加是无谓扩大。

**为什么 token 层不细分 scope**：GitHub installation token 是整个 installation 共享的，不支持 per-scope 细分（不能"只给 Refinement issue 权限、不给 Implementation contents 权限"）。单租户下硬做就是应用层 if-else，与"应用层纪律"无异。token 层细分留给多租户阶段（按 installation 隔离）。

**为什么不用便利权限**：CI/Workflows Write 会让 app 能改 `.github/workflows`、触发自定义 workflow，超出 MVP 范围；Admin 能改仓库设置、branch protection、collaborator，违背"app 只做事不治理"纪律；Organization 对单租户仓库级操作无必要。

**为什么 Review Stage 只 COMMENT 不 APPROVE**：Review 的价值是"AI 视角的代码分析反馈给人"，不是"AI 代替人批准"。批准权是人类的责任——让 app 能 approve 会在出问题时模糊"谁批准了这个 PR"的责任归属。REQUEST_CHANGES 能卡住 PR 不让人合并，过于强势。未来可加 `@app /review --approve` 作为显式高授权，但不是默认。
