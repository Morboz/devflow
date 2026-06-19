# AI writes code by git clone into a worker sandbox, then pushes to a feature branch

Implementation Job 在 worker 的独立临时目录（Sandbox）里 `git clone` 仓库，用普通工具读取真实文件、改代码、跑本地验证（lint/test/format），commit 后 `git push` 到一个 Feature Branch，并从该分支开 Draft PR。

**为什么不是 GitHub Contents/Git Data API 直接推 commit**：API 要求给出整个文件 blob，AI 必须凭空生成完整文件内容，对大文件是灾难，且丢上下文（忘了文件里其他没改的部分）。致命的是**无法在 push 前验证代码正确性**——AI 盲写的文件可能语法都不对，push 上去 CI 才发现。对一个自动产出 PR 的系统，盲写不可接受。

**为什么不是 fork 模型**：fork 同步、PR 从 fork 来的 CI 策略、fork 管理都是额外复杂度。单租户 MVP 的 installation token 有 upstream 写权限，直接推 upstream 的 feature 分支即可。fork 是多租户、upstream 严控写入的演进方向，不是 MVP。

**为什么 clone-to-sandbox 是唯一让 AI 在 push 前验证代码的路径**：agentic coding 的核心价值之一是"写完跑一下 test 看对不对"。这要求 AI 能看到真实文件、能执行本地工具链。Implementation Stage 处理的是"按 PRD 写一个功能"的不确定范围，必须假设需要本地验证。

**Sandbox 纪律**：
- 每个 Job 一个独立临时目录，Job 结束（无论成功失败）删除
- 浅 clone（`--depth=50`）降低带宽和磁盘
- 用 installation token 推送（短期、scope 受限），不用持久 PAT
- 分支命名 `devflow/<feature-slug>-<subissue-number>`，可追溯、可批量清理
- 绝不 push 到主分支，只推 feature 分支

**Draft PR 默认形态**：Implementation 产出的 PR 默认是 draft，明确语义为"代码已写完但待审"。draft 不通知 reviewer、不进合并队列。Review Stage（`@app /review`）是对已存在 PR 触发的；用户手动转 ready-for-review 或直接 `/review` 触发 Review。这让"Implementation 产出"和"进入审阅"之间有显式间隙。
