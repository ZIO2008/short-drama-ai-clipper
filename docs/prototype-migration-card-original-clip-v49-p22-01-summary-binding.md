# P22-01 原型迁移卡：候选池与完成报告的真实汇总绑定

## 范围与设计源

- 设计源：`design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`，SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。
- 工作类型：**屏内数据绑定**。候选池和报告已在运行时以 V49 原始 DOM 挂载；本次只替换已有数字和状态文本，不改变外壳、网格、滚动、元素顺序、样式或 V49 HTML。
- 用户授权：P22-01。它不是正式 Phase 23，且不启动候选池/报告的视觉迁移验收。

## DOM 所有权与映射

| 原型节点 | 运行时数据 | 统计范围 | 允许改动 |
| --- | --- | --- | --- |
| `#screen-clip-pool .clip-inspector-stat > div > b` | `listClipCandidates(dramaId)` | 当前剧目的所有真实候选：已确认（`confirmed`、`exporting`、`exported`）、已导出（`exported`）、待导出（`confirmed`）、待复核（`pending_review`、`editing`、`failed`） | 仅四个数字文本。 |
| `#screen-clip-report .clip-task-summary` | `getLatestClipExportBatch(dramaId)` 与该批次的真实候选 | 最近真实完成批次：覆盖剧集数、已确认候选、已完成导出、待导出/复核 | 仅小状态文本和四个数字文本。 |

空、加载或读取失败时，两个汇总均显示实际的 0 与对应状态，不保留演示数。候选池全剧目统计与报告最近完成批次统计绝不共用数值。

## 固定边界与验证

- 不改 V49 HTML、`StaticPrototypeSurface.tsx`、CSS、路由、IPC、数据库或导出合同。
- 不新增状态 DOM，也不声明候选池/报告视觉验收完成。
- 验证：桥接 Vitest 覆盖真实聚合、空报告及读取失败时两个汇总清零；current Electron E2E 覆盖候选池和报告不再显示演示汇总；类型检查、构建、独立审查。
