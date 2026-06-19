# PostgreSQL as the queue database (not SQLite)

D4 的持久化队列用 PostgreSQL，而不是 PRD §4/D4 提议的 SQLite。

**为什么不是 SQLite**（PRD 的零运维默认）：队列系统的核心难题是**并发 claim**，而 SQLite 是单写者模型——webhook 服务、worker、未来多个 worker、Orphan GC 都是写者，单写者天花板会限制 worker 扩展，且其并发模型（WAL/checkpoint、文件锁、`BEGIN IMMEDIATE` 串行化）会让 D5 的 claim/租约/崩溃恢复逻辑更绕。零运维的收益在 Phase 0 之后很快被并发脊柱的天花板抵消。

**为什么是 Postgres**：
1. `SELECT ... FOR UPDATE SKIP LOCKED` —— D5 worker 并发 claim 的原语：多个 worker 抢 Job 时各拿各的、不冲突、不死锁。SQLite 无等价物。
2. 真正的 MVCC 并发：多写者不互相阻塞，从单 worker 平滑扩展到多 worker 不换脊柱。
3. 原生 partial unique index：D4 的 Active Stage Run Exclusivity 约束 `UNIQUE(feature_id, stage) WHERE status IN ('running','awaiting_plan_approval')` 在 Postgres 是一等公民，schema 即硬约束（ADR-0010）。
4. 生产本来就要跑 Postgres；day-1 用它避免 SQLite 特有 quirk 渗进代码，也省掉未来多租户的迁移。

**代价**：需要 ops——dev 起 Postgres（docker-compose 或本地）、连接串进 `.env`、CI 起 Postgres service。单租户 MVP 这是真实但可控的开销，换来一条从 MVP 到多租户都不用换的并发脊柱。

**派生约束**：连接池在进程内（webhook 与 worker 各自），不引入额外查询层；claim 语句用 `FOR UPDATE SKIP LOCKED`；DB 驱动用 `node-postgres`（`pg`）。
