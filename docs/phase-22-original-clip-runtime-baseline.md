# Phase 22：原剧切片运行时事实基线

> 核验日期：2026-08-20。本文只记录当前工作树可定位的实现、隔离测试和 Electron 证据；不把历史 Phase 17–20、静态 V49 演示数据或未提供的外部条件写成当前完成结论。

## 1. 范围、隔离与设计边界

- 范围：`生成候选 → 审阅/确认 → 候选池 → 导出 → 完成报告`。
- 本 Phase 不修改 `src/`、数据库、IPC、路由、V49 HTML 或设计合同。开始时工作树已有 388 项未收口变更，包含源码；它们均不属于本 Phase。
- 当前设计源为 `docs/current-design-baseline.json` 所指的不可变 V49 快照，SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。
- `screen-clip` 的默认候选已选、前后审阅＋倍速、媒体不可读三态已完成双视口视觉验收。候选池、导出模态和完成报告没有视觉验收结论；它们仍是待核验运行时入口，不能借用 `screen-clip` 的通过结论。

## 2. 真实闭环核验表

| 链路 | 当前实现与入口 | 当前证据 | 结论 | 未验证前提 |
| --- | --- | --- | --- | --- |
| 生成前置与候选创建 | `OriginalClipService.preflightGeneration()` 校验媒体、锚点、文本语义能力和资源预算；`generateIntelligentCandidates()` 创建任务轮次与候选；IPC 为 `clips:preflight-generation` 等 | 服务定点测试通过；当前 Electron P0 在隔离数据中写入 ASR cue、发起生成并轮询到候选 | **已在隔离 Electron 证实候选可生成** | 不是用户真实供应商/真实样本验收；真实 profile、凭据、媒体和语义结果仍未核验 |
| 审阅、边界与确认 | `OriginalClipWorkspaceRuntimeBridge` 绑定工作台；`OriginalClipService.confirmCandidate()` 只确认已发布且可编辑候选 | `screen-clip` 三态双视口视觉验收；工作台/服务定点测试通过；P0 验证真实候选、审阅、倍速和缺媒体会话 | **工作台审阅已证实；确认服务有定点覆盖** | 当前 P0 未独立演练“点击确认后进入候选池”的完整 Electron 跳转 |
| 候选池读取与筛选 | `DramaWorkspacePage` 进入 `clip-pool` 时挂载 V49 `screen-clip-pool`，`OriginalClipPoolReportRuntimeBridge` 调用 `listClipCandidates`、`listClipEpisodeStatuses`、`listMaterials` | 运行时桥测试覆盖真实候选搜索、打开、删除保护、窗口化、导出预检；相关 IPC 与共享合同存在 | **结构和主要数据链可定位，隔离 DOM 测试通过** | 当前 P0 未在 Electron 中进入候选池；没有候选池双视口视觉验收；见 §4 的静态汇总数字缺口 |
| 导出任务 | `ClipExportRuntime`、`clip-export-task-config`、`clip-export-verifier` 由 `OriginalClipService` 调用；IPC 提供预检、启动、进度和取消 | 服务定点测试覆盖确认门、批次占用、取消/重试、FFmpeg 运行时路径；桥测试覆盖目录选择、预检、轮询和显式取消 | **服务与桥接链有隔离测试证据** | 当前 P0 未执行一次原剧切片的真实 Electron FFmpeg 导出；当前界面未暴露所有产品合同字段，见 §4 |
| 完成报告与成果回链 | `getLatestClipExportBatch`、候选状态和 `listMaterials` 由同一运行时桥读取；报告只筛选最近完成批次成员 | 桥测试覆盖无完成批次不伪造报告、仅显示完成批次成员和输出路径回链 | **主要数据筛选逻辑有隔离测试证据** | 当前 P0 未在 Electron 中进入报告；没有报告双视口视觉验收；顶层静态任务汇总未绑定真实数据，见 §4 |

## 3. 当前运行时与 V49 的映射

| 运行时入口 | V49 静态区域 | 映射状态 | 允许替换的数据槽 | 结论边界 |
| --- | --- | --- | --- | --- |
| 原剧切片工作台 | `screen-clip`、媒体监视器、双时间线、检查器与已存在浮层 | **已映射并视觉验收** | 剧目/分集/候选文本、真实媒体、状态值和既有回调 | 仅三种已授权状态；不外推到候选池或报告 |
| 候选池 | `screen-clip-pool`、`clipCandidateEpisodes`、`clipPoolTitle`、`clipPoolWindowMeta`、`clipCandidateRows`、`exportModal` | **结构可映射；数据绑定部分完成** | 分集行、候选行、筛选/搜索结果、预检状态、导出进度 | 静态池的右侧汇总仍是演示数字，不能视为真实；未完成视觉验收 |
| 完成报告 | `screen-clip-report`、`clipReportEpisodes`、`clipReportTitle`、`clipReportMeta`、`clipReportSummary`、`clipReportRows` | **结构可映射；数据绑定部分完成** | 最近完成批次、分集结果、输出路径、报告汇总 | 顶部 `clip-task-summary` 仍是演示数字；未完成视觉验收 |
| 导出配置 | V49 `exportModal`、`packagingModal` | **局部映射** | 已确认候选、目录、质量模式、码率、目标大小、帧率、包装选项 | 当前桥固定命名、字幕和冲突策略；静态结构未给出可证明的全部合同数据槽 |
| 静态演示计数与模拟行 | V49 的 `120`、`500`、`486`、`14` 等示例值和原型脚本模拟数据 | **不映射** | 无 | 这些值仅用于静态展示，运行时不得显示为真实成果 |

## 4. 已确认缺口与证据缺口

### P22-GAP-01：候选池右侧汇总仍显示静态演示数字

V49 候选池定义 `clip-inspector-stat` 为 `500 / 486 / 14 / 6`；当前 `OriginalClipPoolReportRuntimeBridge` 会读取真实候选、状态、批次和成果，但不会改写该汇总区。页面若进入运行时，可能同时显示真实列表与演示汇总，违反“状态必须真实”。这不是 V49 应当覆盖业务的结论，而是现有静态数据槽尚未完成真实绑定。

### P22-GAP-02：完成报告顶层任务汇总仍显示静态演示数字

V49 将 `clip-task-summary` 预填为 `120 / 500 / 486 / 14`。运行时桥会重建 `clipReportSummary` 和结果行，但不会绑定 `clip-task-summary`。因此报告结构可复用，顶层汇总却不能作为当前任务事实。

### P22-GAP-01 / P22-GAP-02 后续实施状态（已关闭）

以上两项记录的是 2026-08-20 的初始事实基线。经用户单独批准的 P22-01 已只在既有数据槽中补上真实绑定：候选池统计按当前剧目全量候选状态聚合；报告顶层只按最近真实完成批次及其候选聚合。无批次、加载与读取失败均明确显示零值和真实状态，不再展示静态演示数字。未修改 V49 HTML、网格、滚动、元素顺序或导出模态，也没有因此获得页面视觉验收结论。映射与验证见 `docs/prototype-migration-card-original-clip-v49-p22-01-summary-binding.md`、`docs/original-clip-phase-boundaries/p22-01-real-summary-binding.md`。

### P22-GAP-03：导出界面未覆盖全部现行导出合同字段

`ClipExportConfig` 支持 `namingPattern`、`subtitleStrategy` 和 `conflictStrategy`，但当前桥固定为 `clip_{episode}_{candidate}`、`none` 和 `append`。产品规范要求确认候选后可配置命名、字幕与冲突策略。该项既涉及功能范围，也可能需要在 V49 导出模态增加原型中不存在的数据槽；不能自行决定放置方式或直接改页面。

### P22-EVIDENCE-01：候选池、导出和报告没有当前 Electron 端到端证据

当前 P0 已在真实 Electron 隔离数据中覆盖候选生成和工作台三态，但没有依次进入候选池、完成一次原剧切片导出、进入完成报告。现有桥测试使用 JSDOM 夹具，能证明调用和状态处理，不能替代 Electron 页面与同视口视觉验收。

### P22-EVIDENCE-01 后续实施状态（已关闭）

P22-03 已在隔离 Electron 数据中完成“候选创建 → 候选池 → 一次受控 FFmpeg 导出 → 完成报告”的真实路径，并在 P22-01 中追加了真实统计断言。它提供的是功能证据，不是候选池、导出或报告的视觉验收；详见 `docs/original-clip-phase-boundaries/p22-03-current-electron-e2e.md` 与 `docs/original-clip-phase-boundaries/p22-01-real-summary-binding.md`。

## 5. 初始 Phase 22 核验结果（实施前快照）

本节保留 P22-01 实施前的原始核验计数与范围，因此其中“82/82”和“本 Phase 未改产品源码”均只描述初始事实基线，不描述后续已获批准的 P22-01。P22-01 的当前结果和验证见 `docs/original-clip-phase-boundaries/p22-01-real-summary-binding.md`。

| 项目 | 实际结果 |
| --- | --- |
| 原剧切片相关定点 Vitest | 在执行 `pnpm run rebuild:node` 后，以下 7 文件、82/82 通过。该重建会将 `better-sqlite3` 切回当前 Node ABI；若刚执行过 Electron 重建，必须先做此步才能复现。 |
| 当前 Electron P0 | 在执行 `pnpm run rebuild:electron` 后，`tests/current/p0-workflows.spec.ts` 通过；`test-results/e2e/.last-run.json` 记录 `status: passed`。该重建会切换 `better-sqlite3` ABI，之后要再跑 Vitest 需先执行 `pnpm run rebuild:node`。 |
| 类型检查 | `pnpm run typecheck` 通过。 |
| 构建 | `pnpm run build` 通过；版本一致性与 renderer Model Studio 边界检查通过。 |
| 产品源码与页面 | 本 Phase 未改动。 |

本次 Vitest 使用的可复现命令（原始输出为 `Test Files 7 passed (7)`、`Tests 82 passed (82)`）：

```text
pnpm exec vitest run src/main/services/original-clip-service.test.ts src/main/services/original-clip-generation-gate.test.ts src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.test.ts src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.test.ts src/renderer/src/pages/OriginalClipPoolReportInteractionBridge.test.ts src/renderer/src/pages/StaticPrototypeSurface.test.ts src/renderer/src/pages/StaticPrototypeSurface.component.test.tsx
```

## 6. 下一步决策

本 Phase 只提供事实和提案，不修复 §4。后续只能从 `docs/phase-22-change-proposals.md` 中选择一项或多项，按该项的最小影响范围建立独立 Phase；未获选择的项维持现状。
