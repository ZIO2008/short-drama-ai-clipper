# Phase 22 边界记录：运行时核验与页面映射

## 冻结输入

- 产品需求：`Product-Spec.md` 中 CLIP-001、002、003、004、005、008、045 与 CLIP-REAL-001 至 010。
- 计划：`DEV-PLAN.md` 的 Phase 22。
- 设计：current V49 快照；只有 `screen-clip` 三种已授权状态已视觉验收。
- 禁止范围：产品源码、数据库、IPC、V49 HTML、设计合同、打包和发布。

## 实际产出

- `docs/phase-22-original-clip-runtime-baseline.md`
- `docs/phase-22-change-proposals.md`
- 本边界记录

## 实际验证

- 原剧切片定点 Vitest：执行 `pnpm run rebuild:node` 后，7 文件、82/82 通过。完整命令与七个文件清单见 `docs/phase-22-original-clip-runtime-baseline.md` 的“本 Phase 核验结果”。
- 当前 Electron P0：执行 `pnpm run rebuild:electron` 后通过；结果记录为 `test-results/e2e/.last-run.json` 的 `status: passed`。
- 类型检查：通过。
- 构建：通过，版本一致性与 renderer Model Studio 边界检查通过。

`better-sqlite3` 是原生模块：Electron P0 前的 `pnpm run rebuild:electron` 与 Vitest 前的 `pnpm run rebuild:node` 会切换它对应的 ABI。因此两组验证均已各自在正确重建后通过，但不能把其中一组重建后的环境当作另一组的无前置条件复现。每次复验都应按对应顺序记录重建命令、原始结果和 ABI；该环境操作未改产品源码或数据。

## 已冻结结论

- `screen-clip` 的三态视觉验收维持原范围，不外推到候选池、导出或报告。
- 候选池、导出和报告的当前服务/IPC/桥接链可定位，且其隔离测试通过；它们尚无完整 current Electron 闭环证据。
- P22-GAP-01 至 03 和 P22-EVIDENCE-01 只记录为待决提案，未实施任何修复。

## 允许的后续依赖

- 后续 Phase 只能选择 `phase-22-change-proposals.md` 中明确的单项，或由用户提出新的、独立的原剧切片范围。
- 任何回流必须满足 `DEV-PLAN.md` 的“阶段冻结与最小回退规则”，并以定点修复卡说明违反的已冻结标准。
