# P22-03 边界记录：候选池、导出与报告的 current Electron 闭环

## 冻结输入

- 授权：`docs/phase-22-change-proposals.md` 的 P22-03；这是独立测试任务，不等同于 `DEV-PLAN.md` 中正式的 Phase 23。
- 需求：`Product-Spec.md` 的 CLIP-005、CLIP-REAL-005 至 CLIP-REAL-008。
- 页面边界：不修改 V49 HTML、页面结构、运行时桥、IPC、数据库或产品源码；不进行候选池/报告的视觉验收。
- 隔离：每次运行生成独立临时用户数据目录、媒体目录与输出目录，结束后移除。

## 实际改动

- 新增 `tests/current/original-clip-pool-export-report.spec.ts`。
- 将该文件登记到 `docs/test-suite-boundary.json` 的 current suite。
- 更新 P22-03 提案状态与本记录。

## 实际 Electron 证据

1. 在隔离 Electron 中导入短媒体夹具，写入 ASR 时间锚并生成候选。
2. 经工作区的“确认候选”按钮将候选推进至 `confirmed`。
3. 进入候选池，断言候选 ID 来自真实数据；先进入报告，断言“尚无可查看的真实完成报告”。
4. 由候选池打开导出模态，选择隔离输出目录并启动真实 FFmpeg 导出，轮询到 `exported`。
5. 进入报告，断言“真实批次”、该候选 ID 和真实输出目录；不把静态演示行当作证据。

## 实际验证

- `pnpm run build`：通过；版本一致性和 renderer Model Studio 边界检查通过。
- `pnpm run rebuild:electron && pnpm exec playwright test tests/current/original-clip-pool-export-report.spec.ts --project=current --workers=1`：1 passed（9.0s）。
- `pnpm run rebuild:node && pnpm exec vitest run src/main/services/original-clip-service.test.ts src/main/services/original-clip-generation-gate.test.ts src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.test.ts src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.test.ts src/renderer/src/pages/OriginalClipPoolReportInteractionBridge.test.ts src/renderer/src/pages/StaticPrototypeSurface.test.ts src/renderer/src/pages/StaticPrototypeSurface.component.test.tsx`：7 文件、82/82 通过。
- `pnpm run validate:test-boundary`：通过，current 为默认套件，共 18 个已登记 E2E 文件。
- `pnpm run typecheck`：通过。

`better-sqlite3` 的 Node/Electron ABI 需要按以上顺序重建；Electron 证据和 Vitest 证据分别在各自 ABI 下通过。

## 未完成与允许依赖

- P22-01 的真实汇总绑定、P22-02 的导出配置策略、P22-04 的候选池/报告视觉迁移仍未执行。
- 后续只能消费本闭环证明的当前行为；若要改页面、数据槽或 V49 结构，须先获得用户明确确认并建立独立迁移/变更卡。
