# Explicit commands as authoritative trigger, no smart routing

触发机制以显式 slash 命令为权威：`@app /refine`、`/decompose`、`/implement`、`/review`，命令名即 Stage 名。裸 `@app` 不做智能路由，而是回复可用命令列表。仅当 issue 带 `devflow` label 时，新 issue 打开自动触发 Refinement。

**为什么不是智能路由**：Stage 的边界 = AI 自主性的边界（Refinement 只写文档，Implementation 要真改代码并推分支）。触发机制必须让用户随时知道"我现在授权它做哪一档自主性"。智能路由让"它为什么自己动了"在早期同时变成用户的困惑和调试难题。label 机制是对"我没 @ 它但想让它动"这一缺口的显式 opt-in，不靠推断。
