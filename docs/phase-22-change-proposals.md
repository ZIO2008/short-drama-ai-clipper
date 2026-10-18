# Phase 22：原剧切片待确认变更提案

> 本文不是授权。每一项都可单独批准、拒绝或延后；在用户确认前不改代码、页面、V49 静态文件、数据库或 IPC。

## 提案 P22-01：将候选池和报告的演示汇总替换为真实聚合（已完成）

**拟改位置**：

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`
- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.test.ts`
- 新增候选池/报告的当前 Electron 回归用例；不修改 V49 HTML、网格、滚动或元素顺序。

**依据**：当前桥已读取真实候选、分集状态、最近完成批次和成果，但未替换 V49 `clip-inspector-stat` 与 `clip-task-summary` 中的演示数字。详见 `phase-22-original-clip-runtime-baseline.md` 的 P22-GAP-01、P22-GAP-02。

**实际结果**：候选池右栏按当前剧目的候选状态聚合“已确认 / 已导出 / 待导出 / 待复核”；报告顶层只按最近一个真实完成批次聚合“覆盖剧集 / 已确认候选 / 已导出 / 待导出或待复核”。加载、读取失败和无完成批次时均写入零值和真实状态文案，不再保留 `500 / 486 / 14` 或 `120` 等演示数字。

**影响与风险**：会修改页面内已有文本数据槽和相关测试，不改布局。风险是“候选池全剧目统计”与“报告最近完成批次统计”语义不同，必须分别标注，不能共用一个数字。

**验证范围**：桥测试、当前 Electron 候选池/报告路径、受影响 7 文件 Vitest、类型检查和测试边界检查均通过。未改视觉结构，故未宣称候选池或报告已完成视觉验收。详见 `docs/prototype-migration-card-original-clip-v49-p22-01-summary-binding.md` 与 `docs/original-clip-phase-boundaries/p22-01-real-summary-binding.md`。

**推荐优先级**：已执行。它关闭了演示统计在运行时页面中冒充事实的缺口，但不替代候选池和报告的页面级视觉迁移验收。

## 提案 P22-02：补齐原剧切片导出配置合同

> 2026-10-18追溯覆盖：命名已独立交付；字幕三方式为最终设计未沿用的早期Agent建议，不作为当前待补需求。以下保留原提案，不能视为授权或下一任务。见 release-readiness/2026-10-18-subtitle-export-provenance.md。

**拟改位置**：待用户先确认交互落点后再确定；可能涉及：

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`
- V49 `exportModal` 的独立迁移卡和经确认的原型数据槽
- `src/shared/contracts.ts`、`src/main/ipc/production-ipc.ts`、`src/preload/index.ts`（仅当现有合同确有缺口）
- 对应桥/Electron 测试

**依据**：现有服务合同支持命名、字幕和冲突策略；当前桥固定 `clip_{episode}_{candidate}`、`none`、`append`。产品规范要求在导出前可配置这些项目。

**必须先由用户决定的事项**：V49 导出模态没有已证明的一一对应数据槽时，是否允许在该模态增加这些配置，还是保留 V49 页面不动、将功能配置放到已存在的其它运行时入口。两种选择会产生不同页面和交互，不能由实现自行猜测。

**影响与风险**：若新增模态字段，即是对 V49 静态结构的明确偏离，需先更新迁移卡并获得双视口视觉证据；若不新增字段，则产品规范中的配置能力继续不闭环。

**验证范围**：真实预检、配置快照、取消/重试、FFmpeg 导出边界与对应 Electron 状态；不使用用户生产媒体或数据库。

**推荐优先级**：高，但需要用户先选择页面策略。

## 提案 P22-03：补齐候选池到报告的 Electron 闭环回归（已完成）

**拟改位置**：

- `tests/current/p0-workflows.spec.ts`，或拆出的同一 current suite 辅助测试文件
- 必要时只增加测试夹具和证据元数据，不改产品实现

**依据**：当前 Electron P0 证明了隔离数据中的候选生成和 `screen-clip` 审阅三态；候选池、原剧导出和报告目前只有服务/桥的隔离测试证据。

**实际结果**：已在隔离数据目录中创建候选、经工作区界面确认、进入候选池、验证无完成批次报告态、执行一次受控 FFmpeg 导出并轮询完成，最后进入报告核对唯一真实完成批次、候选 ID 和输出目录。实现位于 `tests/current/original-clip-pool-export-report.spec.ts`；没有修改产品实现、V49 HTML 或页面结构。

**影响与风险**：只改变测试和长期证据，不改变产品页面。风险是 Electron/FFmpeg 测试耗时上升及本机原生模块 ABI 切换；按现有 `rebuild:node` 与 `rebuild:electron` 串行规则执行。

**验证范围**：current E2E、受影响服务测试、类型检查、构建；未因只增加测试而宣称候选池或报告通过视觉验收。具体命令与输出见 `docs/original-clip-phase-boundaries/p22-03-current-electron-e2e.md`。

**推荐优先级**：已执行。它已把后续 Phase 的功能判断从桥测试提升为真实 Electron 证据。

## 提案 P22-04：候选池与完成报告的 V49 视觉迁移验收

**拟改位置**：

- 新建 `docs/prototype-migration-card-original-clip-v49-candidate-pool.md`
- 新建 `docs/prototype-migration-card-original-clip-v49-report.md`
- 仅在映射和静态夹具通过后，才可能修改相应运行时桥和新增视觉证据

**依据**：两个页面已有 V49 静态区域和运行时挂载入口，但设计台账仍标为 `planned`，没有同视口原型—Electron 对照。

**预期结果**：分别以完整 V49 页面为基线，明确 DOM 所有权、真实数据槽、空/加载/失败状态和受控偏离；每个获批页面在 1440×900 与 1280×720 留存同状态视觉证据。

**影响与风险**：这是页面级工作，不是单纯补截图。若发现当前运行时与 V49 状态无法一一对应，必须暂停在迁移卡，提交偏离说明给用户，不能以 CSS 覆盖或静态示例伪装。

**验证范围**：静态夹具、真实 Electron 状态、视觉对照、功能回归和独立代码审查。

**推荐优先级**：中。在 P22-01、P22-03 完成前，不建议启动；否则会把演示汇总和缺少 Electron 证据带入视觉验收。

## 建议顺序

1. P22-03 已完成，作为候选池—导出—报告的真实 Electron 证据。
2. P22-01 已完成，运行时统计不再沿用演示数字。
3. 对 P22-02 先作页面策略决定，再安排独立功能/视觉 Phase。
4. P22-04 最后单独决定；它不自动跟随任何业务修复启动。
