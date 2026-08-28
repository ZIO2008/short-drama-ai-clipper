# P22-01：候选池与报告真实汇总绑定

> 状态：已完成。此项是用户单独批准的 P22-01 提案实施，不启动 DEV-PLAN 的后续正式 Phase。

## 范围与不可变边界

- 仅替换 `screen-clip-pool` 与 `screen-clip-report` 已有统计文字槽的内容。
- 未修改 V49 HTML、CSS、网格、滚动、元素顺序、导航、导出模态、IPC、数据库或产品合同。
- V49 仍只是视觉基线。本项不声称候选池、导出或报告已完成视觉验收。

## 事实映射

| 既有区域 | 真实来源 | 统计语义 |
| --- | --- | --- |
| 候选池 `clip-inspector-stat` | 当前剧目的 `listClipCandidates()` | 已确认=`confirmed/exporting/exported`；已导出=`exported`；待导出=`confirmed`；待复核=`pending_review/editing/failed` |
| 报告 `clip-task-summary` | `getLatestClipExportBatch()` 的成员候选 | 覆盖剧集=不同 `episodeId`；已确认=`confirmed/exporting/exported`；已导出=`exported`；待处理=`confirmed/pending_review/editing/failed` |

报告在加载、读取失败或没有真实完成批次时统一写入 `0 / 0 / 0 / 0`，并显示相应实际状态文案；不得保留 V49 的演示统计。

## 改动

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`：增加仅在既有槽位内渲染的聚合函数和空/加载/失败处理。
- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.test.ts`：验证多状态候选的池统计、最新完成批次的报告统计和空报告零值。
- `tests/current/original-clip-pool-export-report.spec.ts`：在真实 Electron 路径中验证候选池、无批次报告和一次真实导出后的报告统计。

## 验证记录

| 验证 | 结果 |
| --- | --- |
| 真实 Electron：候选创建→候选池→导出→报告 | 通过，`test-results/e2e/.last-run.json` 为 `status: passed` |
| 相关 Vitest | `7 files / 84 tests` 通过 |
| 类型检查 | 通过 |
| Playwright suite 边界 | 通过，`18 tests across 3 suites; default=current` |
| 构建 | 通过；本项之后未改产品源码 |

运行 Electron 前需执行 `pnpm run rebuild:electron`；运行 Vitest 前需执行 `pnpm run rebuild:node`。这是 `better-sqlite3` 在 Electron 与当前 Node ABI 之间的环境切换，两个结果均已在各自正确环境中核验。
