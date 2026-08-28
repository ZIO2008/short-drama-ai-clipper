# Open Design v2026-07-30 最终原型复用矩阵

> **历史矩阵。** 本文只追溯 Version 48 当时的复用判断，不是当前设计、开发或视觉验收输入。当前全产品唯一设计源为 V49 HTML；当前需求见根 `Product-Spec.md`，当前执行范围见根 `DEV-PLAN.md`。
>
> 2026-08-03 当时的治理校验按项目库 Version 48 动态状态复核，源码 SHA-256 为 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。以下“唯一”“必须”“当前”均按该历史时点理解，不得覆盖 V49。

## 设计源与不可变边界

- 唯一设计源：`design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`。
- 校验值：SHA-256 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`；同目录 `artifact.json` 记录原型交接元数据。该目录只读。
- 本矩阵替代 Phase 8 对旧 `v2026-07-27` 与 r5 独立草稿的引用；旧矩阵保留为已发布 Phase 6 历史证据，不回写。
- 现行产品约束与安全边界以根 `Product-Spec.md` 的 `CLIP-*`、`SUB-*`、数据安全与 P2 冻结条款为准；本矩阵不再引用已归档的旧节号 §10.8。
- 固定对照视口：1440×900、1280×720。主画布、源分集与候选池均不得横向溢出。
- 审计边界：Phase 8 由本最终源的 SHA、屏幕标识及 Electron 截图严格追溯。旧 2026-07-27 原型未被复制为本轮可变基线；其历史页面只保留当前流程截图和 E2E 布局/行为证据，报告必须写明“历史参考不可用”，不得伪称像素比对。

## 原型到生产映射

| 最终原型区块 | 生产入口 / 组件 | 必须保留 | 真实实现边界 | 实施状态 |
|---|---|---|---|---|
| 素材生产中的原剧切片入口 | `DramaWorkspacePage`、`ProductionPage` | 已导入原片后立即可见“生成候选切片”主操作 | 入口读取真实剧集生产资格；生成只创建候选，不导出 | 功能已实现；Phase 8 Electron E2E 覆盖，逐态视觉验收未完成 |
| `screen-clip` 候选工作区 | `OriginalClipWorkspacePage`、`MediaMonitor` | 媒体优先画布、源分集状态、双时间线、左右微调、唯一确认动作 | 监视器用真实媒体首帧/有语义占位并 `contain`；无上下步进器主路径；跨分集批量生成后首个真实候选同步驱动当前源分集、两条时间线、监视器和检查器，状态汇总暂缺时来源区间计数仍取本地真实候选 | 功能已实现；组件回归与 Phase 8 Electron E2E 覆盖，逐态视觉验收未完成 |
| 动态 `screen-clip-pool` | `StaticPrototypeSurface` + `OriginalClipPoolReportInteractionBridge` | 按分集固定标题、筛选、搜索、窗口化候选、独立输出 | 本轮只恢复原型演示数据的会话分集、筛选、搜索、窗口翻页、行打开和导出弹层；不读取/写入候选、状态聚合、目录或任务数据 | 原型交互定点测试通过；真实数据桥接不属于本轮 |
| `screen-clip-report` 与导出弹层 | `StaticPrototypeSurface` + `OriginalClipPoolReportInteractionBridge` | 导出设置弹层、完成报告、成果库显式回链 | 本轮仅保留原型内弹层打开/关闭、质量切换、会话保存后进入报告、报告分集/异常筛选/行选择，以及既有成果库导航；不启动导出、取消、重试、预检或读取批次 | 原型交互定点测试通过；真实导出/报告链不属于本轮 |
| `screen-stitch` 第 3/4 阶段 | `MultiEpisodeWorkspacePage`、`MultiEpisodeTaskReportPanel` | 四阶段路径、真实运行状态、完成报告、成果库与任务中心出口 | task pointer 以 dramaId 作用域保存；仅匹配 taskId、dramaId、type=`multi_episode` 才恢复，不猜最近任务；`onRunTask` 仅代表请求返回，状态由 `tasks:list` 轮询裁决，只有终态才读取 `tasks:report`；失败项目保留真实原因并可进入任务中心，取消成果不回滚 | 真实状态/回链组件与 Electron 重开报告回归通过；运行、失败、取消的 Open Design 双视口状态基线及视觉验收未完成 |
| `screen-subtitles` 与字幕详情弹层 | `StaticPrototypeSurface` 原样隔离的 `screen-subtitles` + `SubtitleRecognitionSettingsBridge` | 与资产/生产/成果库共享原型页头、返回剧目库、按剧集归档工具栏与原始设置弹层 | 只回接既有设置 SQLite/IPC：读取、六项回显、保存、读取失败保护、不支持的展示策略阻止、迟到读写隔离及同会话单次保存；不新增识别、互证、导入或导出功能 | 设置桥接单测通过；当前 Electron 实机验证与逐态视觉验收未完成 |
| 原型应用壳、剧目标签、成果库、全局任务 | 既有 `AppShell`、`DramaWorkspacePage`、`TaskCenterPage` | 深色 token、顶栏、剧目上下文、可达路径 | 继续使用真实本地数据；不得重做为独立壳 | 功能保留并随 Phase 8 回归；全屏逐态视觉验收未完成 |
| 原型中的 P2 未来态 | N/A | 仅保留为原型历史/未来稿 | Version 48 终版生产页移除 P2 卡片；不得新增生产可达性 | 冻结，生产 UI 不显示 |

## 允许差异与验收证据

| 类别 | 允许的真实差异 | 必须有的证据 |
|---|---|---|
| 媒体 | 演示封面替换为真实首帧，或没有可解码媒体时显示带画幅、时间码和下一步的占位 | 三个监视器状态的组件/E2E 断言和双视口截图 |
| 系统能力 | 文件选择、目录打开由 Windows 原生对话框/受限 IPC 完成 | IPC/服务测试，不用浏览器假路径替代 |
| OCR/ASR | 未配置引擎时显示未测及配置入口，不请求网络、不伪造准确率或费用 | 服务测试、固定样本报告字段和无网络 E2E |
| 长列表 | 真实候选按当前筛选/分集窗口化，而不是一次插入 5,000 个 DOM 项 | 5,000 项虚拟窗口单元测试、1280×720 无横向滚动断言 |

实施完成后，每一行必须补充生产文件、1440×900/1280×720 截图、真实状态覆盖与已记录差异；未补证据不得标为已核验。

## 2026-08-01 结构整合核验快照

本快照只记录当前最终源已确认的结构事实，不以旧 `docs/history/v48-legacy/design-alignment-ledger-v48.md` 或早期 Spec/DEV-PLAN 决定范围。剧目库、任务中心、剧目工作区、原剧切片和字幕资产都已在同一 Electron 应用壳内有真实可达路径：全局导航承接剧目库/任务中心；剧目打开后在 `DramaWorkspacePage` 共享剧目上下文；素材生产进入原剧切片三阶段；字幕资产由剧目标签或切片按需入口进入并直接载入 `screen-subtitles` 原文。候选、导出、任务和成果分别继续读取真实服务数据。

本阶段不新建独立状态审阅页、孤岛导航、独立 HTML 或无来源卡片；字幕页只落实最终原型已经明确的板块关系，不在此阶段扩展 ASR、OCR、互证或识别设置的内部后端能力。多集拼接与 P2 解说/TTS/旁白不属于本阶段实现面。当前 Electron 结构路径在 `phase8-original-clip-workflow.spec.ts`、`phase10-v48-fixture-mapping.spec.ts` 和 `p2-freeze.spec.ts` 验证；视觉项目库逐态基线仍不完整，因此本矩阵的“逐态视觉验收未完成”结论不变。

2026-08-01 当前应用证据已保存于 `docs/design-evidence/v48/current-electron-run-p0/`（剧目库、任务中心，1440×900 与 1280×720）和 `docs/design-evidence/v48/current-electron-run/`（原剧切片、候选池、完成报告、字幕资产，1440×900 与 1280×720）。运行 Electron E2E 前必须先执行 `pnpm run rebuild:electron`：全量 Node 单测会将 `better-sqlite3` 重建为 Node ABI，未重建时 Windows 可能以该原生模块文件锁使 Electron 启动停在初始化错误；此为本地原生模块前置条件，不得误报为页面或数据功能退化。

截至本快照，Open Design 正在运行但 Computer Use 只读状态接口连续返回窗口句柄失效，不能采集合同所要求的项目库预览；本地最终 HTML 或其浏览器渲染不得冒充该预览。这个外部证据缺口与当前 Electron 结构截图分开记录。

补充核验：项目本地目录虽有 `screens-v48-original-clip-states/` 的 1440×900 与 1280×720 PNG，但其 `ORIGINAL-CLIP-STATE-BASELINE-V48-MANIFEST.json` 明确为 `unmerged-pending-confirmation`、`original-clip-only`，交接说明也禁止替换既有成品。因此它们不能填入最终原型的项目库视觉基线，更不能让 `audit:fidelity` 伪通过；当前 92 项审计缺口的结论维持不变。

2026-08-01 MCP 复核补记：已通过 Open Design 自带的 stdio MCP 以显式项目 ID 读取 Version 48 文件清单，确认该项目只有最终 `short-drama-material-studio.html` 与上述待确认、仅原剧切片附件；没有覆盖合同全部屏幕/状态的项目库预览。再用 Open Design 官方 `export` 渲染最终 HTML，当前 Windows 150% DPI 输出为 2160×1500 的完整可滚动页，而不是固定 1440×900 或 1280×720 视口。缩放、裁切或复制该图都会改变取证语义，故未导入 `docs/design-evidence/`，视觉审计结论不变。

2026-08-01 固定视口补记：已直接渲染上述唯一最终 HTML，生成剧目库、任务中心、原剧切片和字幕资产各自的 1440×900 / 1280×720 参考图，见 `docs/design-evidence/v48/open-design-source-rendered-reference/`。这只补足权威源在固定视口下的可复核结构，不等同于 Open Design 独立预览，也不等同于 Electron；因 Computer Use 在独立预览窗口上仍返回同一窗口所有权错误，图片不能填入项目库预览合同或改变 `audit:fidelity` 的未验收结论。
