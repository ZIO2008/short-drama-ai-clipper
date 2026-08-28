# Version 48 设计合并续接台账

> 目的：把 Version 48 从“截图参考”变成可执行的开发输入。任何上下文续接、任何视觉代码修改前，必须先读本文件、`docs/design-contract-v48.json`、`docs/prototype-gap-register.md`、`docs/open-design-v2026-07-30-reuse-matrix.md` 与对应原型 HTML。原型目录只读。

## 冻结设计源

- Open Design 项目：`01b5725c-2688-4cbc-bc29-7432712449b3`，Version 48。
- 唯一页面源：`design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`。
- SHA-256：`D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。
- 设计裁决顺序：项目库预览与 Version 48 HTML > `Design-Brief.md` > `Product-Spec.md` > 既有生产样式。
- 固定验收视口：1440×900、1280×720；每个状态必须有同状态 Open Design 项目库基线和 Electron 截图。`audit:fidelity` 当前仍为 `completed=0 incomplete=92`，不得写为已通过。
- 非原型覆盖的真实状态（加载、空、失败、媒体缺失、导出中、压力）必须先在 Open Design 形成可预览依据并获用户确认，再编码。

## Version 48 非 P2 页面覆盖图与收口顺序

> 范围按真实渲染入口，而不是按原型中早期、已被终版脚本覆盖的静态片段统计。`NarrationWorkspacePage` 及全部解说/TTS/旁白入口为 P2 冻结项，明确排除；P1 二创仍属非 P2，必须保留在最终审计范围。

| 顺序 | 原型 / 生产入口 | 生产组件 | 当前台账状态 | 收口依赖 |
|---|---|---|---|---|
| 0 | 应用壳、全局侧栏、顶栏、通知 | `AppShell.tsx` | 需补完整页台账 | 先有项目库默认/通知/窄视口基线 |
| 1 | `screen-library` 剧目库 | `DramaLibraryPage.tsx` | 需补完整页台账 | 默认、空、搜索/筛选、压力列表 |
| 2 | `screen-assets`、剧目工作区/资产/成果标签 | `DramaWorkspacePage.tsx`、`DramaAssetsPage.tsx`、`DramaEditorPage.tsx` | 默认态完整台账已建立；静态结构已核对，逐态视觉未验收 | 真实媒体、缺媒体、成果回链、脚本关联 |
| 3 | `screen-production` 素材生产 | `ProductionPage.tsx` | 已有完整台账；终版三方法标签与 P2 卡片移除已合并，视觉未验收 | P0/P1 入口，P2 不显示生产卡片 |
| 4 | `screen-clip` 候选工作区 | `OriginalClipWorkspacePage.tsx` | 已有完整台账，待状态附件确认后静态合并/取证 | 四个状态附件、双视口基线 |
| 5 | `screen-clip-pool` 全部候选 | `ClipCandidatePoolPage.tsx` | 已有完整台账，功能回归通过、视觉未验收 | 三个状态附件、5,000 候选压力 |
| 6 | 候选池内导出抽屉 | `ExportDrawer` / `ClipCandidatePoolPage.tsx` | 已有完整台账，待状态附件确认后静态合并 | 五个状态附件、真实导出批次 |
| 7 | `screen-clip-report` 完成报告 | `OriginalClipReportPage.tsx` | 已有完整台账，功能回归通过、视觉未验收 | 报告状态项目库基线 |
| 8 | `screen-subtitles` 字幕资产 | `StaticPrototypeSurface.tsx` + `SubtitleRecognitionSettingsBridge.ts` | Phase 11 已删除旧 renderer；只允许静态原文及受限设置桥接，当前 Electron 实机验证未完成 | 字幕状态项目库基线、原型设置读写路径 |
| 9 | `screen-stitch` 多集拼接 | `MultiEpisodeWorkspacePage.tsx` | 需补完整页台账 | 预检、运行、失败/恢复、批量压力 |
| 10 | P1 二创工作台/审阅时间线 | `AiRemixWorkspacePage.tsx`、`AiReviewTimelinePage.tsx` | 需补完整页台账 | P1 真实能力状态；不得连带恢复 P2 |
| 11 | `screen-tasks`、`screen-tags`、`screen-settings` | `TaskCenterPage.tsx`、`TagManagementPage.tsx`、`SettingsPage.tsx` | 需补完整页台账 | 各自 loading/error/长列表项目库基线 |

### 全局完成门槛

任何一行只有在“完整台账 → 静态合并 → 真实行为/异常/压力 → Open Design 与 Electron 双视口同态证据 → `audit:fidelity` → 独立两阶段审查”均有可复现证据时，才能从“视觉未验收”改为完成。功能测试、旧截图或单个 1440×900 对比均不构成整页完成。

## 当前页：剧目资产与工作区（`screen-assets` / `DramaWorkspacePage`、`DramaAssetsPage`）

**阶段：默认态完整差异清单已建立。** 裁决源为最终 HTML 579–585 行、基础 CSS 41–49 行及终版脚本 756 行；最终脚本在资产/生产/成果标签中插入“字幕资产”，故该标签不是生产偏离。项目库默认、loading、empty、error 的 1440×900 / 1280×720 可归档基线仍未齐，`audit:fidelity` 不得视为通过。

### 本页不变的真实行为边界

- 资产、健康统计、脚本关联、导入、重新定位、删除和成果均使用 IPC/SQLite 的真实数据；不以 D-2407、68 集或演示路径填充生产页面。没有持久化剧目代号时，不伪造原型示例代号。
- `字幕资产` 是剧目级共享证据入口；它不进入候选池，也不改变 ASR/OCR 互证边界。`导入视频文件夹`、删除“应用内引用”和剧本拆分预览均有 Product-Spec 依据，保留真实入口及原片不移动/不删除保证。
- 资产表保持七列、自然排序、真实状态与操作；长列表必须拥有可达垂直滚动、粘性表头、鼠标/滚动条/PageDown/End 路径，不能为首屏截图改为截断或全页默认滚动。

### 完整差异清单

| 区域 / 状态 | Version 48 证据 | 生产位置 | 当前差异 / 裁决 | 静态合并动作 | 验收证据 |
|---|---|---|---|---|---|
| 页头与剧目上下文 | HTML 580：剧目代号、名称、集数/标签/本地路径、返回和编辑 | `DramaWorkspacePage.tsx` 资产分支 | 生产有真实名称、集数、标签、路径语义、返回/编辑；无独立持久化剧目代号，不能伪造示例 `D-2407` | 保持原型层级与 20px 页面壳；剧目代号列为真实数据差异 | 默认、真实长名称/多标签、返回和编辑 modal 的双视口 Electron |
| 工作区标签 | HTML 581 三标签；终版脚本 756 在成果前插入字幕资产 | `WorkspaceTabs` | 生产四标签，顺序为资产/生产/字幕/成果 | 已与终版脚本一致；不删除独立字幕资产入口 | tabs 切换、焦点、1280×720 无横溢出 |
| 健康概览 | HTML/CSS 49：四格、细线分隔、12×14 内距、11px 标签/16px 等宽数值 | `.health-strip`、`AssetHealth` | 生产使用真实可用/缺集/失联/剧本关联；结构与数值 token 已对应 | 无演示计数；保持四格并在窄视口记录换行/裁切 | 默认、混合异常、零剧集的项目库+Electron 基线 |
| 工具栏与状态筛选 | HTML 583、CSS 41：添加剧集、批量重新定位、导入剧本、右侧 40px 状态筛选 | `DramaAssetsPage.tsx` `.toolbar`、`.asset-page > .toolbar .select` | 生产多出“导入视频文件夹”；这是 FLOW-001 明定独立回调，不可为截图删除。审查发现其筛选控件继承 44px，已限定资产页修正为 40px | 保持原型动作顺序，把文件夹导入登记为业务扩展；不得加入无来源面板或说明 | 文件/文件夹导入、重新定位、剧本导入、筛选、窄视口换行 |
| 资产表、状态与操作 | HTML 584、CSS 48：七列、最小 760px、11×12px 单元格、粘性表头、紧凑行、状态 badge、查看/重新定位 | `DramaAssetsPage.tsx`、`.asset-table-wrap` | 生产增加“删除剧集”以满足 FLOW-002；审查发现表格继承 9px 内距且无明确最小宽度，已限定资产表修正 | 保留删除确认与原片保护；默认表格维持七列和原型密度，不设演示缺集行 | 可用/缺集/失联、路径截断、重新定位、删除确认、真实 Electron |
| 剧本资产/拆分预览 | 原型默认态未显示 | `DramaAssetsPage.tsx` 仅在有脚本或预览时渲染 | 有规格化真实功能，不能挤进默认空表格页面或改造成常驻卡片 | 默认态不改；仅记录为非原型业务扩展，视觉不自由调整 | 导入 TXT/DOCX/PDF、关联/取消关联、失败文本保持真实 |
| 加载、空、失败、缺媒体与压力 | 合同声明 `loading/empty/error`，最终 HTML未给这些具体布局 | `DramaWorkspacePage` state panel、`DramaAssetsPage` empty/error、资产服务 | 真实状态存在但无同版本逐态设计源 | 不改其颜色、密度或结构；先在 Open Design 形成可预览依据并获确认 | 85 集 100%/125%/150% DPI、空/失败/缺媒体双视口项目库+Electron |

**本页禁止返工模式：** 不为对齐早期三标签片段删除字幕资产；不把文件夹导入、删除保护、剧本预览或重新定位从真实工作区移走；未有逐态项目库依据前，不单独重画 state panel、空态、错误、确认弹窗或滚动条。

**本批验证（仍不等于视觉验收）：** `DramaAssetsPage.test.tsx` 与 `DramaWorkspacePage.test.tsx` 共 10 项通过，新增断言锁定默认工具栏顺序、七列资产表、四标签和四格健康条；P0 Electron 已进一步断言资产筛选器 40px、资产表 `min-width:760px` 与 `11px 12px` 内距。`pnpm test` 为 70 files / 297 tests 通过，`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract` 通过，`pnpm run test:e2e` 为 6 passed / 8 skipped。`pnpm run audit:fidelity` 的真实结果仍为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`；当前没有 `screen-assets` 的项目库同态双视口基线，故默认态只完成结构/行为回归，不得标为视觉完成。

### 续接记录

| 时间 | 已交付 | 重复返工 / 根因 | 剩余缺口 | 下一完整页面动作 |
|---|---|---|---|---|
| 2026-08-01 | 建立资产/工作区完整台账和 ALIGN-024；验证四标签、健康条、工具栏和七列表；审查发现并以页面作用域修复 44px 筛选、9px 表格内距和缺失表格最小宽度，复审关闭两个 MEDIUM | 先前把“已有组件和已有 E2E”误当作默认态数值已经对齐，未逐项对照最终 HTML CSS 41/48 | `screen-assets` default/loading/empty/error 缺 Open Design 项目库与 Electron 同态 1440×900、1280×720 基线；85 集三档 DPI 仍是外部实机/包级跳过项 | 转到多集拼接，先以已有全量差异表复核默认态静态数值和真实报告功能缺口，再做同批合并 |

## 下一页：剧目库（`screen-library` / `DramaLibraryPage`）

**阶段：默认态整页静态合并已完成，行为回归待复验；视觉验收未完成。** 只读裁决源为最终 HTML 557–578 行及其最终 CSS 81–96、103–114 行；其默认态明确为页头、搜索/标签/排序、卡片/列表切换、三列剧目卡和分页。项目库默认、空、错误的 1440×900/1280×720 基线仍未归档，因此不得把现有 Skeleton、错误面板或自由布局称为 Version 48 设计。

### 本页不变的真实行为边界

- 创建剧目、选择文件/目录、导入、真实封面、打开剧目工作区和根页状态保留均继续使用既有 IPC/SQLite；封面缺失只能使用与原型语义一致的代表画面占位，不能伪造媒体封面。
- 从全局“剧目库”退出当前剧目工作区的 `ALIGN-008` 行为、根页的搜索/标签/排序/视图/未提交创建草稿保留；编辑、删除、导入入口不丢失，但应从剧目工作区的“编辑剧目”入口抵达，而不是在 Version 48 卡片上额外加一排操作。
- 多页/长列表必须限制当前可渲染卡片数；筛选、排序、页码切换和卡片/列表切换均不得读取或修改演示数据。列表视图应复用同一组真实剧目卡数据，不得为方便而变成另一套无原型依据的表格页面。

### 完整差异清单

| 区域 / 状态 | Version 48 证据 | 生产位置 | 当前差异 | 静态合并动作 | 验收证据 |
|---|---|---|---|---|---|
| 页头与工具栏 | HTML 558–559、CSS 81–88：只有标题、说明、创建；工具栏为搜索、标签、排序、40px 图标切换器（36px 按钮、surface 激活态） | `DramaLibraryPage.tsx` 页头/`.library-toolbar` | 已移除页头“n 部剧目”，并以专属 selector 合并 grid/list 图标、容器和激活态；搜索/筛选/排序继续使用真实状态 | 已按原型顺序及尺寸合并；不改变其它页的通用 segmented 规则 | 默认与筛选：两视口首屏顺序、按钮和工具栏均待项目库基线验收 |
| 卡片网格与密度 | HTML 560–570、CSS 92–97：三列、14px 间距、16:7 封面、14px 内容、紧凑底栏 | `DramaCard`、`.prototype-drama-grid`、`.drama-card` | 已移除独立“编辑剧目”操作条；网格间距由 16px 修正为 14px；编辑在工作区资产页继续可达 | 合并为原型的封面→标题/状态→元信息→底栏；卡片打开真实工作区 | 默认、真实封面缺失、异常状态；文本不溢出待 Electron 验证 |
| 列表视图 | HTML CSS 108–114 与脚本 794：同一剧目卡切为 220px 封面+内容的紧凑列表，分页沿用 | `DramaCard list`、`.library-list` | 已删除独立表格和操作列 | 同一真实卡片数据切换为原型列表行 | 卡片/列表切换、键盘、窄视口无横溢出待 Electron 验证 |
| 分页与长列表 | HTML 571–573、CSS 103–106、脚本 794：每页 6 条、页码状态、上一页/下一页 | `DramaLibraryPage.tsx` | 已补真实筛选/排序后的六项分页；筛选、排序和视图切换重置第一页 | 无演示数据或全量 DOM 渲染 | 7+、大量剧目、无匹配；组件与 Electron 两视口待验证 |
| 生产/资产摘要 | Version 48 `screen-library` 不含 rail；全局任务中心和剧目资产已分别承接 | 删除 `.library-rail`、`.rail-panel` | 已移除剧目库的重复任务/资产摘要 | 真实任务继续在全局任务中心，资产异常在剧目工作区可达 | 无隐藏入口丢失；全局任务/资产回归待验证 |
| 页面外层内边距与通用 CSS 影响 | HTML 41：桌面 `.screen` 为 20px；现有全局 `.segmented/.card-title` 还被多集拼接等页面复用 | `.screen`、全局组件样式 | 本轮将桌面 `.screen` 从 16px 对齐为 20px；未改写既有全局 segmented/card-title，以免在未建台账的多集拼接页自由重构 | Library 新增规则均以 `.library-screen` 范围限定；多集拼接的既有全局样式影响列为下一整页台账项 | 需重跑所有 Electron 回归；项目库双视口基线缺失前不标视觉通过 |
| 空、加载、错误 | 合同要求 `empty/error`，最终 HTML 仅有筛选后空态 571；无加载/读取错误设计 | `LibrarySkeleton`、`state-panel` | 已有真实状态但无同版本项目库状态设计 | 不自由改变其结构、色彩或密度；先获得 Open Design 可预览状态和用户确认，才做状态 UI 合并 | 记录为设计依赖，不能用当前截图充数 |

**本页禁止返工模式：** 不保留额外卡片操作条、任务/资产 rail 或无来源表格当作“功能需要”；不把动态真实封面、真实任务状态或编辑可达性换回演示数据；未取得项目库状态基线前不单点微调颜色、间距或空/错误页。

**本批验证（仍不等于视觉验收）：** `DramaLibraryPage`/`ProductionPage` 定点组件回归 11/11；`pnpm test` 为 70 files / 295 tests 通过；`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract` 通过；`pnpm run test:e2e` 在当前构建上为 6 passed / 8 skipped。P0 Electron 已采集默认、真实剧目卡片和列表截图，并断言 20px 页面边距及 40px/36px 视图切换器；P2 测试改为等待编辑模态实际关闭，避免并发时遮罩层伪失败。Open Design MCP 本轮只读读取返回 transport closed，且项目库 default/empty/error 的两视口基线未归档；`pnpm run audit:fidelity` 仍为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`，因此本页只有行为回归通过，视觉验收未完成。

## 当前页：全部候选池（`screen-clip-pool`）

**阶段：首轮整页静态合并已完成并通过 Electron 行为回归；项目库逐状态基线、像素验收和独立审查未完成。**

### 本页不变的真实行为边界

- 候选始终归属单一源分集，不能堆成跨剧集序列；分集切换只改变当前窗口。
- 按当前分集窗口化：20 个可见项 + 8 个缓冲；5,000 候选压力下不能全量渲染或扫描。
- 候选池右侧只允许“配置并导出”和有真实完成批次时的“查看最近完成报告”；失败原因留候选行，成果库只能由完成报告进入。
- 导出、取消、重试、完成报告、媒体缺失和键盘内层滚动必须继续走真实 IPC/服务，不能用演示状态替代。

### 完整差异清单

| 区域 / 状态 | Version 48 证据 | 生产位置 | 已发现差异 | 静态合并动作 | 验收证据 |
|---|---|---|---|---|---|
| 页面壳、标题、阶段条 | 原型 `screen-clip-pool` 及 `clip-module-board-style`；项目库预览为应用壳内页面 | `ClipCandidatePoolPage.tsx` 页头和 `.clip-stages` | 生产为三步阶段条，原型/完成流应以工作区与完成报告为主；页面不应成为独立的卡片壳 | 逐项比对标题层级、阶段数量、顶部动作顺序和主画布高度；保留真实入口 | 双视口：页头、阶段条、首屏主操作均可见，无主画布横溢出 |
| 三栏板布局 | 原型 `.clip-module-board`：左源分集、中工作区、右检查器，圆角、边框和受限高度由页面壳继承 | `.clip-pool-board`、`.clip-source-rail`、`.clip-pool-main`、`.clip-inspector` | 生产列宽 `176 / fluid / 202` 与原型工作区 `210 / fluid / 244` 存在来源不明的缩窄；高度公式也与原型不一致 | 以最终项目库截图和 HTML 的最终覆盖样式逐项确定列宽、最小高、边框、圆角和内部滚动边界 | 1440×900、1280×720：三栏可见，无横滚，只有分集和候选列表自身滚动 |
| 色彩和混色空间 | 原型根 token 使用 OKLCH 与 `color-mix(in oklch, …)` | `tokens.css`、`clip-module.css` | 候选池覆写 `#11100f/#161411/#100f0e/#39332d/#1c1916`，且大量 `color-mix(in srgb, …)`；根 token 相同仍被旧色盖掉 | 删除候选池旧色覆写；将本页边框、悬停、选中、滚动条和状态底色统一为原型 token/OKLCH 公式 | 代码 token 对照表；两视口像素对照，未达合同阈值仍标未验收 |
| 源分集轨 | 原型：固定左列、状态点和集号/状态信息，内层滚动 | `poolEpisodeState`、`.clip-source-rail/.clip-episode-row` | 状态语义真实，但行高、信息密度、状态点位置和选中层级尚未按最终预览逐项收口 | 不变更状态计算；只合并结构、间距、颜色和内层滚动 | 默认、未生成、媒体缺失、导出中、异常的真实状态截图 |
| 当前集候选主区 | 原型：当前分集为唯一列表上下文，候选按窗口渲染，不重复堆叠跨集标题 | `filtered`、`visible`、`.clip-pool-main/.clip-group-scroll/.clip-candidate-list-row` | 生产窗口逻辑已真实，但工具栏、摘要、行列宽、分割线、密度和空态未完成整页对照 | 保留 20+8 实现；一次调整工具栏、摘要、列表行、页码和空态的静态结构 | 默认/筛选/空/高容量状态；5,000 候选与键盘滚动回归 |
| 搜索与筛选出口 | 原型候选池筛选和搜索均在主区，操作不抢占导出检查器 | 页内 `.clip-filter-row`、`input` | 现有功能正确，但尺寸、换行断点、激活态使用旧样式 | 复用原型按钮层级、输入宽度、OKLCH 激活/焦点样式；保留真实筛选 | 1280×720 不遮挡、不横滚；筛选和搜索真实生效 |
| 导出检查器 | 原型与复用矩阵：右栏仅配置导出与最近完成报告 | 右侧 `.clip-inspector` | 出口已按 ALIGN-021 收紧，视觉仍继承旧面板、统计格和按钮尺寸 | 不新增入口；整合信息层级、间距、按钮顺序与禁用态 | 有/无完成批次、零已确认、导出中真实状态 |
| 滚动与压力 | 原型：应用壳不因候选池默认滚动，分集/候选区各自滚动 | `scrollByKeyboard`、两个 `role=region` | 已有逻辑证据，但 CSS 用不同滚动条颜色和板高；需要视觉与嵌套滚动合验 | 静态调整后保持键盘事件停止冒泡，禁止把内容改回整页滚动 | 5,000 候选、End/PageDown、主页面 scrollTop 稳定的 E2E + 两视口截图 |
| 失败/缺媒体/空 | 原型与合同 `screen-clip-pool` 的 default/empty/filtered/high-volume；缺媒体为真实差异 | `poolEpisodeState`、空态和候选行失败原因 | 真实文本已存在；未有项目库逐状态设计依据 | 只完成原型已覆盖的静态语义；未覆盖状态先列为待补 Open Design，不能自由设计 | 项目库状态基线 + Electron 同状态截图；缺前不标验收 |

### 禁止的返工模式

1. 本页台账中仍有“静态合并动作”未完成时，不得单独修改颜色、按钮、文案或某一列宽。
2. 未取得同状态的 Open Design 项目库基线时，不得用 Electron 截图、测试或 `audit:fidelity` 绿灯替代视觉验收。
3. 任何新交互出口先检查本页“不变行为边界”；不符合即不实现。

## 续接记录

| 时间 | 已交付 | 重复返工 / 根因 | 剩余缺口 | 下一完整页面动作 |
|---|---|---|---|---|
| 2026-08-01 | 冻结 Version 48 设计源；完成候选池首份全量台账；Open Design 项目库预览已人工核对为三栏应用壳 | 过去多轮直接改候选池单点，未先穷举结构/出口/滚动/密度/token/状态差异；旧 `clip-module.css` 硬编码色与 sRGB 覆写令根 token 无法生效 | 候选池的最终项目库 1440×900/1280×720 逐状态基线、全页静态合并、真实状态视觉验收和独立审查均未完成 | 从静态色彩/token、三栏尺寸、工具栏/行密度和滚动容器作为同一批次合并；完成后再执行真实状态与压力验收 |
| 2026-08-01 | 候选池完成一批静态合并：删除候选池 `#11100f/#161411/#100f0e/#39332d` 覆写，改为 Version 48 根 token/OKLCH；三栏为 `210px / fluid / 244px`，板高为 `calc(100dvh - 248px)`；摘要、候选行和分页归入同一个内层滚动区；分集行恢复编号+标题+状态的信息层级。新 Electron 证据：`docs/design-evidence/v48/screen-clip-pool/default/{1440x900,1280x720}/electron.png` | 首次截图发现摘要位于滚动区外、与首行边界冲突；根因是生产网格保留了旧的四行结构。已在同一静态批次内改为原型的 `auto / minmax(0, 1fr)` 两行结构并重采集 | Open Design 项目库仍未取得候选池 default/empty/filtered/high-volume 的 1440×900、1280×720 基线和 metadata；`pnpm run audit:fidelity` 仍为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`。顶栏“返回素材生产”不是未裁决差异：`Product-Spec.md` ALIGN-019 明确规定它返回素材生产，阶段栏“1 候选工作区”才进入第一阶段。原型局部 `r5`/sRGB 样式与 Version 48 根 OKLCH token 存在历史冲突；按当前目标维持根 token 单一来源，待项目库基线裁决，不回引蓝灰遗留样式 | 取得项目库逐状态预览；用同状态 Electron 图做像素对照；核对根 token 与项目库成像后再结束颜色裁决；之后重派独立两阶段代码审查 |
| 2026-08-01 | 以 Version 48 最终 `r5Polish`/`clip-module-board-style` 为准，将候选池暖石墨 token 集中到 `tokens.css`，候选池局部混色统一为原型的 sRGB 公式；补齐筛选后空态单测和无完成批次时右侧检查器的可见资格说明。验证：候选池 14 项单测、typecheck、build、design-contract、Electron Phase8/P2 均通过；独立复审无新增代码、功能或安全问题 | 审查曾将原型早期全局 OKLCH 与最终局部 r5Polish 混为一谈；重新逐行对照最终 HTML 后确认候选池局部的暖石墨值与 sRGB 公式才是裁决源。无完成批次时原因仅存在 disabled title 的缺口已修复 | `pnpm run audit:fidelity` 最新实测仍为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`：候选池 default 1440×900 的像素差超过零阈值，default 1280×720 缺项目库预览，empty/filtered/high-volume 两视口均缺项目库预览、Electron 截图与 metadata。因此本页只能标“功能回归通过、视觉验收未完成”，不得收口为完成 | 不新增自由设计；继续取得 Version 48 项目库逐状态、双视口基线，再与真实 Electron 同态取证和像素审计 |

## 最近可复现验证

```text
pnpm test
pnpm run typecheck
pnpm run build
pnpm run validate:design-contract
pnpm run rebuild:electron
pnpm exec playwright test tests/e2e/phase8-original-clip-workflow.spec.ts tests/e2e/p2-freeze.spec.ts --reporter=line --workers=1
```

> `pnpm test` 会把 `better-sqlite3` 切回 Node ABI 137；之后跑 Electron E2E 前必须运行 `pnpm run rebuild:electron`，否则 ABI 137/148 错误不是 UI 缺陷。

## 下一页：候选工作区（`screen-clip`）

**阶段：全量差异清单已建立，尚未开始视觉代码修改。** 设计源为最终 HTML 的 `#screen-clip`、`clip-module-board-style`、`r5Polish` 与项目库的 `screen-clip:candidate-selected` 预览；真实边界由 `CLIP-001`—`CLIP-004`、`ALIGN-007/009/010/014/016/020` 裁决。

| 区域 / 状态 | Version 48 事实 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 应用壳、页头、三阶段 | 同一应用壳内的“原剧切片工作区”；阶段为候选工作区 / 全部候选 / 完成报告，暖沙橙活动态 | `OriginalClipWorkspacePage.tsx` 页头/`.clip-stages`，`AppShell.tsx` | 工作区继承通用 token，需逐项对照壳层高度、边距、阶段密度，禁止通过放大侧栏或外层滚动挤压画布 | 复用既有壳和真实路由；顶栏主操作必须保持“生成候选切片”，不回引导入或“切片主题” | 项目库 + Electron 的 default/candidate-selected 两视口；元素边界、无横溢出 |
| 三栏编辑台 | 左源分集 / 中监视器与双时间线 / 右候选检查器；暖石墨 `r5Polish` 面板、细线、9px 圆角 | `.clip-workbench-grid`、`.clip-source-rail`、`.clip-editor-canvas`、`.clip-inspector` | 当前工作台仍以通用 `--surface`/`--border` 为主，和候选池已对齐的局部暖石墨体系可能漂移 | 先按最终 HTML 的列宽、板高、边线、内层滚动与暖石墨 token 完成整页骨架，再绑定数据；不能另建页面 | 1440×900/1280×720 首屏完整展示监视器和两条时间线 |
| 源分集轨与真实状态 | 紧凑行、编号、状态层级；未生成/生成中/待确认/已确认/导出中/已导出/异常/缺媒体可区分 | `statuses`、`labelForStatus`、左轨按钮 | 状态真实性已有异步/错误保护，但行 DOM 与候选池的编号+文本层级不同，需核对最终原型而非自由统一 | 保留真实 `listClipEpisodeStatuses` 及 loading/error；没有跨集候选序列 | default、生成中、失败、缺媒体与多分集压力截图 |
| 监视器与缺媒体占位 | 真实画幅 `contain`；可读媒体、读取中、未选中、缺媒体都有可辨识暖色场景、画幅框、时间码与处置动作 | `MediaMonitor.tsx`、`.monitor-placeholder`、`ALIGN-007` | 需核对 placeholder 比例、字幕锚点、场景骨架和监视器高度；不得退化为黑框、蓝灰占位或错误裁切 | 保留视频首帧/播放、宽高持久化与重新关联；无媒体不伪造播放 | 16:9、9:16、缺路径、真实损坏路径；两视口 Electron 与项目库基线 |
| 双时间线与左右微调 | 源分集时间线 + 当前候选时间线同时可见；拖拽为主，左右语义微调，字幕锚点属于候选 | `clip-source-timeline`、`clip-range-bar`、`nudge` | 当前静态高度/标尺与最终 HTML 的时间线密度需同批收口；必须避免上下数字步进成为主剪辑交互 | 保留真实 `updateClipCandidate`、左右按钮和候选独立输出；不把不同分集拼入同一轨 | 1440×900/1280×720、拖拽/左右微调、候选切换和回写 E2E |
| 右检查器与渐进披露 | 候选上下文 → 左右微调 → 重合提示 → 全部候选 → 确认；字幕优化为按需次级入口 | `clip-candidate-context`、`clip-nudge-controls`、字幕 details/modal | 异步字幕证据正确但需审查是否挤压检查器或把资产级证据堆回工作台 | 保留 ASR/OCR 独立互证和展示字幕变体；字幕资产仍由剧目标签进入 | 有/无候选、证据加载/失败/恢复、确认、打开候选池 |
| 生成前、预检与批量 | 首个主操作生成；低频数量/时长/低重合/允许重复只在生成前或按需模态 | `generationConfig`、预检/生成调用 | 需对照原型默认态与候选已选态，避免常驻参数重回编辑画布 | 保留多分集预检、低重合、显式允许重复和生成≠导出 | 无候选、预检、生成后首候选联动、100 集压力 |
| 页面滚动与状态证据 | 应用壳不成为默认滚动条；只允许明确的内层滚动 | `clip-workbench-grid`、`MediaMonitor`、E2E 边界断言 | 目前存在 Electron 默认/候选已选/缺媒体截图，但缺项目库逐状态和默认/缺媒体项目库基线 | 静态收口后重验主画布高度、内层滚动和 1280×720 密度 | `phase8-original-clip-workflow`、`phase10-v48-fixture-mapping`、双视口证据与真实审计结果 |

**本页禁止返工模式：** 在上表未逐项形成“原型数值 / 生产数值 / 合并动作”前，不单独改监视器颜色、时间线高度或检查器按钮；任何原型未覆盖的加载、错误、缺媒体或压力设计必须先在 Open Design 项目形成可预览依据并获用户确认。

| 时间 | 已交付 | 重复返工 / 根因 | 剩余缺口 | 下一完整页面动作 |
|---|---|---|---|---|
| 2026-08-01 | 工作台完成首批整页静态合并：左侧源分集由旧的标题+小点结构合并为 Version 48 的状态条 + 稳定编号 + 剧集/状态三列；三栏板、阶段栏、监视器、双时间线、候选检查器和微调控制同步切换到集中定义的暖石墨 token、细线与 sRGB 混色。分集状态仍来自真实生产状态。Electron 重采集显示未生成暖黄、媒体缺失红色均可区分 | 首次局部样式把竖向条的默认灰覆盖在状态色之后，截图暴露待确认/缺媒体均变灰；现以更具体的工作台状态选择器恢复语义色。可访问名称也因可见编号变为“02第 02 集”，已用显式 `aria-label` 固定回既有语义 | 工作台仍缺 Open Design 项目库 default / loading / missing-media / candidate-selected 的双视口基线；已有 Electron 证据不能替代。生成前渐进披露和字幕按需入口仍须与最终设计逐项静态核对，尚不能宣称整页完成 | 逐项核对最终 HTML 中生成前/候选已选的检查器密度与渐进披露；每一批先截图检查，再绑定/回归真实状态 |
| 2026-08-01（续） | 重新核对最终 HTML 的 `r5Polish` 数值、当前 Open Design 项目库预览和 Electron 的 `screen-clip:candidate-selected:1440×900`。尝试将工作台直接替换为 HTML 中 `176 / fluid / 214` 三栏与 12px 外间隙后，Electron 截图显示中心监视器被压窄、检查器过早左移；已在同一轮撤回，生产代码没有保留这项偏差。定点工作台单测 13/13、typecheck、设计合同、build、Electron Phase8/P2 回归均通过 | 把最终 HTML 的 CSS 标量当作不经渲染环境换算的几何裁决；项目库预览的实际几何优先，不能把历史断点/缩放条件机械拷进 Electron。项目目录内 `screens-r5*` 图像属于旧交付痕迹，合同未把它们登记为 Version 48 的 `screen × state × viewport` 基线，不能补填证据缺口 | `screen-clip` 缺四个状态的项目库双视口基线，且 `audit:fidelity` 仍不可完成；候选池及其它页面同样缺状态基线。当前只证明没有把已更接近预览的工作台改坏，不证明视觉验收 | 先以 Open Design 项目库中当前 Version 48 的明确状态和固定视口取得可归档基线及 metadata；随后按项目库的实测边界而非 CSS 推测继续收口工作台 |

## 下一页：导出抽屉（`screen-clip-export` / `ExportDrawer`）

**阶段：完整差异清单已建立，尚未修改 UI。** 原型最终 HTML 同时保留独立 `screen-clip-export` 静态样例与四段 `clipStageNav`，但项目库实际预览和 `Product-Spec.md` 的 ALIGN-003/013/021 裁决为：导出是“全部候选”内的抽屉，三阶段只显示候选工作区 / 全部候选 / 完成报告。因此真实抽屉是允许差异，不得为了照抄旧静态屏增加第四阶段或孤立路由。

| 区域 / 状态 | Version 48 与 Spec 裁决 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 入口与阶段上下文 | 候选池检查器仅“配置并导出”；导出不是新阶段，完成后只进本批次完成报告 | `ClipCandidatePoolPage.tsx:60-76`、`ExportDrawer` | 顶栏与检查器均可打开同一抽屉，真实语义正确；尚未用项目库基线核对按钮层级、禁用态和遮罩关系 | 保留两个等价入口和三阶段栏；不能新增成果库捷径或独立导出路由 | default / 0 已确认 / 有已确认，双视口项目库 + Electron |
| 候选选择与压力 | 默认选中已确认候选；取消只影响本批次；大量候选仅渲染当前 28 项窗口 | `ExportDrawer:85-86,96` | 行为已有，但选项区、窗口按钮、已选摘要和抽屉内部滚动尚未逐项对照 | 保留批次选择、28 项窗口与不改变确认状态；不能在候选池行常驻复选框 | 500 待导出、翻窗、取消勾选、关闭再开、双视口截图 |
| 配置字段与原片保护 | 输出目录、命名、编码/尺寸、字幕策略、冲突为新建不覆盖；先预检 | `ExportDrawer:97-102`、`ClipExportConfig`、真实 FFmpeg 服务 | 生产字段比静态样例更完整，需确认信息密度和两列断点，不能删掉真实配置或用假预估替代 | 所有字段继续接真实 IPC；字幕策略只引用候选展示变体，不创建 P2 能力 | default / preflight / blocked 的字段可用性和真实预检 |
| 进度、取消、失败重试 | 导出中显示同一批次逐项进度；失败可重试、可到任务中心；完成进报告 | `ExportDrawer:89-106`、`OriginalClipService` | 真实 `exportId` 代际隔离已存在；但静态运行/失败/完成状态尚未取得项目库依据，不得自由美化 | 轮询、取消、重试只作用当前批次；重启遗留运行批次真实取消；完成回调只传本批次 `candidateIds` | running / failed / completed 双视口基线、Electron FFmpeg 流程、重启恢复 |
| 抽屉框、色彩与滚动 | 最终 `r5Polish` 的暖石墨面板、细线、6/9px 圆角、内部薄滚动条；不得出现浏览器默认滚动条或蓝色主操作 | `.clip-export-modal`、`.clip-export-form`、`.clip-preflight`、`ModalDialog`、`clip-module.css:62-64` | 当前抽屉复用通用 modal；其尺寸、内边距、进度块与最终项目库预览未逐态比对 | 先量取可归档项目库预览，再一次性合并框体、表单、选择区、预检与底部动作；不做单点换色 | 1440×900、1280×720，每状态项目库预览 + Electron + metadata |

**本页禁止返工模式：** 未取得导出抽屉各状态的项目库基线前，不以独立 `screen-clip-export` 静态样例强行改造三阶段流程，不单独调整 modal 宽度、按钮颜色、字段排列或进度卡；所有设计变更必须先在 Open Design 形成当前抽屉状态预览并等待用户确认。

## 下一页：完成报告（`screen-clip-report` / `OriginalClipReportPage`）

**阶段：真实行为和输出边界已核验；完整差异清单已建立，尚未开始视觉代码修改。** 设计源为最终 HTML 的 `#screen-clip-report`、`clip-report-interaction-polish`（152–286 行）、动态结构（916–928 行）和项目库预览。完成报告是三阶段第 3 阶段，不能退回成独立页面或自动跳转成果库。

### 本页不变的真实行为边界

- 只展示持久化导出批次传入的 `candidateIds`；历史候选、其它批次和跨剧集汇总均不得混入。
- 左栏是**本次任务中确有候选的剧集**；缺媒体/生成中但没有候选的真实剧集状态，需要状态附件明确其是否、如何进入报告，不能用演示行填充。
- 每行必须保留候选、源片区间、输出文件、时长、状态和操作；只有 `exported` 且存在 `MaterialSummary` 时显示真实文件名。失败项显示真实失败原因或“未生成输出”，其它未导出项显示“尚未生成输出文件”。
- “打开成果库”是报告完成后的显式动作；点击结果行回到真实候选上下文，不新增伪造的行内预览、文件打开或跨剧集序列。

### 完整差异清单

| 区域 / 状态 | Version 48 事实 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 应用壳、标题、三阶段与出口 | 原型 916、908：同一“原剧切片工作区”，`1 候选工作区 / 2 全部候选 / 3 完成报告`；成果库为显式主操作 | `OriginalClipReportPage.tsx:26–29`、路由回调 | 结构和出口已存在；无项目库固定视口基线，不能用原型局部 CSS 或旧截图断言边距/颜色 | 保持三阶段和“返回素材生产”真实路由；禁止加第四阶段或把成果库变成自动去向 | default / completed 的项目库与 Electron 1440×900、1280×720 首屏 |
| 本次任务汇总 | 原型 918、152–203：连续细线汇总条，任务标签与 4 个统计格，不叠卡片 | `.clip-task-summary`、`clip-module.css:61` | 生产统计是真实候选/已导出/待导出/待处理；原型演示为覆盖剧集/已确认/导出/待复核，字段不能机械替换 | 保留真实批次语义；按状态附件裁决默认、部分完成、全失败、无候选时的信息层级与色彩 | 四种状态项目库基线 + 同态 Electron；无附件前不改数值布局 |
| 本次任务分集左栏 | 原型 916–920：固定左栏、编号+剧集+状态层级、内层滚动和暖沙橙选中线 | `OriginalClipReportPage.tsx:30`、`.clip-source-rail/.clip-episode-row` | 生产只显示“第 xx 集 + 有异常/已导出”，缺独立编号、完整状态层级和报告专用滚动 class；缺媒体/生成中无候选不应被伪造纳入 | 先由状态附件裁决各真实状态是否进入报告；之后一次性合并行密度、编号、状态点、选中态和内层滚动，不改批次归属 | 默认、失败、待导出/复核、长批次；100 集压力与键盘滚动 |
| 本集工具栏与筛选 | 原型 916、928：本集标题/归档说明、全部结果/仅异常；筛选不改变任务范围 | `OriginalClipReportPage.tsx:32` | 生产“仅异常”只筛真实 `failed`；原型演示把媒体缺失/待复核也列作异常，不能把不存在候选的状态塞进列表 | 保留真实失败筛选和批次隔离；状态附件确认后再决定其他真实可筛状态的文案与禁用态 | all / exception / 空结果的两视口基线与组件回归 |
| 本集连续汇总和输出明细 | 原型 250–286、928：无嵌套卡片的连续汇总、细线列头、候选/源片区间或文件/时长/状态/操作 | `OriginalClipReportPage.tsx:33–34`、`clip-module.css:61–62` | 真实行列和 5 列头已实现；需要按项目库核对栏高、列比例、状态色、行密度及 1280×720 断点，不能拿现有像素差低于旧值当通过 | 不增加假文件或假操作；失败原因优先于残留成果，点击只进入候选 | completed / failed / pending / empty 项目库+Electron；真实 FFmpeg 导出、异常和历史批次隔离 E2E |
| 行选中、焦点与滚动 | 原型 231–247、949–959 有视觉选中和键盘焦点；结果区为内层滚动 | `.clip-report-rows/.clip-report-list-row` | 生产行点击直接打开真实候选，未保留演示式 selected 行；不可为追截图加无功能的本地选中状态 | 以真实“打开候选”行为为准；仅合并可访问焦点、悬停和受限内层滚动，不让 `#main-content` 出现默认滚动条 | 100+ 行、键盘 End/PageDown、主画布稳定；双视口截图 |
| 空、失败、缺媒体、历史与压力 | 原型仅有演示行，状态附件请求覆盖实际状态；`candidateIds` 是生产唯一批次事实 | 页面 props、导出批次与 `OriginalClipReportPage.test.tsx` | 空/加载/缺媒体/部分完成/全失败/高容量没有可归档 Version 48 项目库基线 | 状态附件完成并经用户确认前，只记录真实文字与行为，不自由设计 | 每状态项目库基线、Electron 截图、metadata；`audit:fidelity` 实测 |

### 当前行为证据（不等同于视觉验收）

- `OriginalClipReportPage.test.tsx` 覆盖报告只取本批次 `candidateIds`、不混历史候选、失败不显示残留输出、无失败原因时如实降级为“未生成输出”。
- `docs/prototype-gap-register.md` 的 ALIGN-031、043、044 已记录真实 FFmpeg 导出后回链、受限报告画布和列比；该页最新 1440×900 像素比较仍超合同阈值，1280×720 缺项目库预览，因此当前状态只能写为“功能回归通过，视觉验收未完成”。

**本页禁止返工模式：** 未取得完成报告各状态的项目库基线前，不单独改报告列宽、抽屉式圆角、统计数量、按钮颜色或 `selected` 视觉；不能用原型演示的 120 集/500 候选填充真实批次，也不能用失败候选残留成果伪造输出文件。

## 历史页面台账（Phase 11 已取代）：字幕资产（`screen-subtitles` / 已删除的 `SubtitleAssetsPage`）

**阶段：已废弃，不得作为当前实现或验收依据。** Phase 11 已删除该 renderer，当前设计源只允许最终 HTML 的 `screen-subtitles` 原文；本节保留旧风险记录，不授予互证、导入、OCR 或详情页实现权限。

### 本页不变的真实行为边界

- 字幕资产是剧目级、按分集归档的共享证据，不是候选池的常驻复杂面板；候选剪辑仅引用它，并在候选内另存展示字幕变体。
- ASR 忠于声音；OCR/导入轨忠于画面。两轨只能互证，差异可标记“已互证”，不得把任一轨“采纳”为另一轨、覆盖原始证据或改写源视频。
- 只有 ASR、OCR 固定区域和本地 OCR 均可用时，才可提取画面 OCR；无离线 ASR 引擎时必须如实拒绝“一键生成”，保留导入 SRT/VTT 的实际路径，不捏造费用、准确率或云端能力。
- 分集汇总慢于当前详情时，当前集详情先显示；请求代际隔离，旧集异步响应不得污染新集。详情、列表、证据、互证、OCR 可用性分别报错和恢复。

### 完整差异清单

| 区域 / 状态 | Version 48 事实 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 页面壳与资产列表 | 终版 `screen-subtitles` 原文 | 历史 `SubtitleAssetsPage.tsx` 已删除；当前由 `StaticPrototypeSurface.tsx` 原样隔离 | 旧页面结构不得回引 | 只允许原型已有入口；本轮不新增列表业务 | 当前 Electron 设置路径、1440×900、1280×720 项目库+Electron |
| 分集资产与状态 | 原型 991、1112–1129：按剧集行展示资产、状态和“打开详情”，压力样本为 3 分钟 90 条证据 | `assetLabel`、`episodeStatus`、列表行 | 真实状态比原型演示更多：未导入、证据不完整、待校验、已完成校验、媒体缺失、读取失败；不得压缩为一个假“已完成” | 状态色和文案先按最终项目库裁决；保留分集独立状态、90 集汇总慢加载和 90 条详情压力 | 90 集汇总、缺媒体、读取失败、混合资产状态；内层滚动与无默认页面滚动 |
| 设置弹层 | 原型脚本生成的独立“字幕识别设置”模态 | `SubtitleRecognitionSettingsBridge.ts`，不创建或改写原型 DOM | 已回接既有设置读写；不支持的展示策略必须阻止保存 | 保留取消、关闭、Esc 与触发点回焦；不在本轮实现详情、OCR 或全量证据 | 打开/关闭、读取、保存、关闭重开、无效策略，Electron+项目库 |
| 历史监视器/OCR 记录 | 已废弃的详情页实现 | 已删除 `SubtitleAssetsPage.tsx` | 不属于当前字幕屏，也不得回引其画幅、OCR 区域或重新定位 UI | 本轮不实现 | 不作为本轮验收 |
| 历史 ASR/OCR 互证记录 | 已废弃的详情页实现 | 已删除 `SubtitleAssetsPage.tsx` 与旧证据 UI | 不属于当前字幕屏，也不得以旧回归证明原型页 | 本轮不实现 | 不作为本轮验收 |
| 历史 OCR/导入/导出记录 | 已废弃的详情页实现 | 已删除 `SubtitleAssetsPage.tsx` 与旧操作入口 | 不属于当前字幕屏，不创建识别、导入或导出任务 | 本轮不实现 | 不作为本轮验收 |
| 错误、并发与长列表 | 原型压力脚本明确 90 条证据独立滚动；真实列表需支持 90 集及异步乱序 | `load`、`loadGeneration`、`episodeEvidence`、现有组件测试 | UI 不能把读取失败显示为“未导入”，也不能让旧集响应覆盖当前集；逐状态项目库基线未齐 | 保留独立 `loading → loaded/error`、请求序号和每区重试；错误设计先补入 Open Design 再合并 | 90 集慢汇总、快速切集乱序、证据失败后恢复、90 条证据滚动、主画布 scrollTop 稳定 |

### 当前行为证据（不等同于视觉验收）

- 历史 `SubtitleAssetsPage.tsx` 的互证/OCR 行为不再构成当前页面证据；当前只验证 `screen-subtitles` 原文的设置桥接，不扩展或宣称上述能力。
- `docs/prototype-gap-register.md` ALIGN-048 已记录 90 集慢汇总、当前详情优先与本地 OCR 提取的真实接入；没有项目库逐状态基线和同状态 Electron 证据前，本页一律不得写为视觉匹配。

**本页禁止返工模式：** 不把字幕资产重新堆回候选池或工作台；不把 ASR/OCR 差异按钮改成“采纳”；不以原型演示的一键生成替代真实引擎可用性；未取得项目库状态基线前，不单独调整 modal、列表、监视器、按钮色或证据列宽。

## 下一页：多集拼接（`screen-stitch` / `MultiEpisodeWorkspacePage`）

**阶段：默认四阶段的静态结构已合并，视觉验收未完成。** 设计源为最终 HTML `screen-stitch`（593–600 行）：四阶段配置/预检/运行/报告，原型中的示例数值只能说明信息结构，不能覆盖真实预检和任务结果。

### 本页不变的真实行为边界

- 多集拼接是 P0 批量确定性任务：连续窗口、步长 1、输出目录新建不覆盖。它与原剧切片的“独立候选”完全不同，不能混用候选池或导出批次。
- 预检必须真实检查连续集数、媒体状态、磁盘、时长、输出参数和包装；配置任何字段后旧预检作废，只有含可运行窗口的已确认预检才能创建任务。
- 运行中的暂停、继续、取消必须保留检查点和已完成成果；取消不得回滚已有输出。报告必须读取真实任务项成功/缩减/跳过/失败，不能显示原型演示统计。
- 包装仅影响输出文件且受安全区约束；不改写原片。P2 解说/TTS/旁白不进入本页任何配置、任务或成果。

### 完整差异清单

| 区域 / 状态 | Version 48 事实 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 页面壳、返回与四阶段 | 原型 594–595：素材生产内的四阶段工作区 | `MultiEpisodeWorkspacePage.tsx` | 已补真实剧目 / 素材生产 / 多集拼接上下文、原型的“保存 / 返回修改”说明和四段边框；仍需项目库核对壳层、阶段密度、暖石墨 token 和窄视口 | 保留返回素材生产；禁用未到达阶段而非制造演示跳转 | config / preflight / running / report，1440×900、1280×720 |
| 配置与渐进披露 | 原型 596：组合、时长、质量、包装、输出位置；完整导出/包装为按需详情 | `:117,130–170`、设置 modal | 真实配置比演示丰富；主页面与模态的字段密度、禁用态、质量条件字段需一次性合并 | 保留真实 `qualityMode`、FPS、输出目录、性能模式和包装安全区；数值输入用于批量参数，不替代切片左右微调 | 无输出目录、质量模式切换、包装开/关、纵横预览、设置保存/取消 |
| 预检结果 | 原型 597：计划范围、实际输出、时长、策略、体积、状态；缩减/跳过可见 | `MultiEpisodeWorkspacePage.tsx` | 已收敛回同序六列：计划范围、预计时长、真实输出、处理策略、预计体积、状态；真实反算码率作为时长下的次级信息，真实原因替代演示文案 | 保留真实服务预检和配置变更失效；失败/无窗口明确解释、不能创建任务 | 媒体缺失、超时缩减、跳过、磁盘/目录问题、100+ 窗口压力 |
| 运行、暂停、继续、取消 | 原型 598：当前项、总体进度、剩余、重试、失败和控制动作 | `MultiEpisodeRunningPanel.tsx` | 已用持久化 `TaskSummary.progressCurrent/progressTotal/elapsedMs/checkpointStage` 绑定确定性进度、完成/计划组合、已用时间和当前阶段；总量未知才用不定进度，未伪造剩余、重试或失败数 | 保留真实 pause/resume/cancel/checkpoint；逐项范围、剩余时间、重试和失败摘要需要后端真实字段后才能补，不能用演示值填充 | 运行、暂停后重启恢复、继续、取消、失败重试、真实 FFmpeg E2E |
| 完成报告与成果库回链 | 原型 599：真实成功/缩减/跳过/失败摘要，成果库为显式动作 | `MultiEpisodeWorkspacePage.tsx`、`MultiEpisodeTaskReportPanel.tsx`、既有 `tasks:list/report` IPC | 已移除“任务已进入队列”的伪报告；第 4 阶段读取当前 task ID 的持久化 `TaskSummary` 和 `TaskReportItem`，显示真实成功/缩减/跳过/失败/取消、输出和原因 | 保持任务 ID 隔离；有当前任务输出时才开放成果库，读取失败仅显示真实错误和重试；不填原型示例数值 | 组件成功/失败读取回归；真实 Electron 三窗口报告、成果库回链；取消/部分完成/全失败仍待状态证据 |
| 结果压力、滚动与错误 | 原型为阶段内内容，不能形成全页默认滚动条 | 页面 stage panels、任务服务 | 长预检/报告、错误/恢复项目库状态未齐 | 每阶段只允许明确内层滚动，保存配置/预检/任务请求错误独立显示 | 100+ 窗口、键盘滚动、双视口、网络/服务错误与重试 |

### 当前行为证据（不等同于视觉验收）

- `MultiEpisodeWorkspacePage.test.tsx` 覆盖无输出目录阻止预检、真实服务预检、配置编辑使预检失效、确认后创建并启动任务、包装安全区预览。
- 当前测试没有证明报告读取真实任务结果，故本页不得因预检/运行测试通过而标记为功能完成或视觉匹配。

**本页禁止返工模式：** 不单独美化某个质量按钮、包装预览或进度条；不以 `onRunTask` resolve 代替真实任务完成报告；不把多集拼接结果混入原剧切片完成报告；未取得项目库状态基线前不自由设计运行/失败/取消状态。

**本批功能更正（仍不等于视觉验收）：** `onRunTask` 返回已不再被当作完成：运行阶段以当前 task ID 的 `tasks:list` 状态轮询裁决，只有 `completed`、`partial`、`failed`、`cancelled` 才切入报告；当前任务指针按 dramaId 写入 session storage，重开后仅在 taskId、dramaId、type=`multi_episode` 同时匹配时恢复，无效即清除，不猜测最近任务。恢复中的运行/暂停任务会直接进入既有第 3 阶段；创建第二个任务会清空上一任务的报告状态。失败报告新增直达任务中心的显式动作；“打开成果库”先刷新该剧的真实材料再跳转。当前批次进一步将页头、阶段栏、预检的六列信息结构和运行壳对齐最终 HTML；运行百分比、完成/计划数量、已用时间、检查点均来自 `TaskSummary`，总量未知才使用不定进度。组件回归覆盖运行态不读报告、真实进度、跨剧目和跨类型指针清除、连续任务隔离、失败回链与读取失败重试；真实 Electron P0 直接从报告按钮进入并验证本次输出，也覆盖离开素材生产后重新进入并恢复同一终态报告。最新定点 `MultiEpisodeWorkspacePage.test.tsx` 为 7 tests 通过，`pnpm run typecheck` 通过；完整包级与 Electron 回归需在本批审查前重跑。`pnpm run audit:fidelity` 的最新真实状态仍为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`；运行、失败、取消和双视口项目库基线尚未验收。

## 下一页：素材生产（`screen-production` / `ProductionPage`）

**阶段：终版已裁决的静态批次已合并；P0/P1 行为回归通过，双视口项目库基线与视觉审计未完成。** 设计源为 `screen-production`（587–590 行）及其后的终版覆盖脚本（806–812 行）。该覆盖把前三个方法标签收紧为“人工审核 / 批量处理 / AI 辅助剪辑”，并移除 `.method-card.future`；因此它优先于早期原型中保留的 P2 示意卡。

### 本页不变的真实行为边界

- 原剧切片：存在至少一个可读剧集才可进入；资产异常不阻塞其它可用单集。
- 多集拼接：至少两个可读剧集才可配置，连续性/缺媒体由预检逐窗口裁决。
- P1 爆点前置二创：仍为受控本地、人工审核的真实入口；P2 解说/TTS/旁白不显示卡片、不提供路由、provider、任务、成果或执行入口。
- 可读剧集资格来自真实 `AssetHealth`，但 Version 48 尚未提供生产页资产异常面板设计；当前仅保留既有按钮可用性，详细缺集、失联与连续性处置在资产页和多集预检中表达。

### 完整差异清单

| 区域 / 状态 | Version 48 事实 | 生产位置 | 当前差异 / 风险 | 静态合并与真实行为边界 | 验收证据 |
|---|---|---|---|---|---|
| 页面壳、剧目上下文与标签 | 原型 587–590：剧目内“素材生产”、资产/生产/字幕/成果标签由工作区壳提供 | `DramaWorkspacePage.tsx`、`ProductionPage.tsx:25–26` | `ProductionPage` 可嵌入，需以项目库预览核对标题层级与 tabs，而非另造页面壳 | 保留真实工作区导航和返回语义 | 1440×900、1280×720 默认/无剧目/资产异常 |
| 三个可用方法卡 | 原型 590、终版 809：原剧切片/多集拼接/AI 二创，标签依次为人工审核/批量处理/AI 辅助剪辑；终版说明与入口文案分别固定为“准备字幕、生成候选并人工审片微调，确认后统一导出到成果库。/进入工作区”、“按滑动窗口批量组合连续剧集，预检时长、体积、帧率和包装后运行。/创建拼接任务”、“基于字幕、分镜和剧情分析生成可解释草稿，必须经过人工审核。/查看工作台方向” | `ProductionPage.tsx:28–31` | 旧代码三卡说明和 P1 入口措辞与最终原型不同；结构、P0/P1 路由、资格判断与 P2 移除正确 | 一次性复制终版三卡静态文案；仅保持既有真实路由和禁用资格，不新增状态/卡片 | 定点组件文案与路由回归；默认/资产异常项目库+Electron 双视口仍缺 |
| P2 冻结 | 终版 810：移除 `.method-card.future` | `ProductionPage.tsx`、`p2-freeze.spec.ts` | 已移除生产页“AI 短剧解说”卡和禁用按钮；旧 E2E 标题/断言已改为验证无卡片 | 不新增替代入口、隐藏路由或 P2 生产能力 | 重建后的 P2 冻结 E2E 已通过；视觉双视口仍缺 |
| 资产异常与资格 | 原型只给三张方法卡，未提供健康说明面板 | `ProductionPage.tsx` 卡片按钮；资产页与多集拼接预检 | 独立审查否决此前加入的健康/错误面板，因为它没有 Open Design 状态依据 | 生产页只保留三卡与既有资格禁用；详细资产异常在已有资产页/预检真实入口呈现。若要新增生产页状态，必须先得到项目库可预览设计并由用户确认 | 单可读集仍可进入切片；少于两集不能创建拼接；资产异常实际在资产页/预检可见 |
| 窄视口、滚动和空态 | 原型三列卡片 | `grid-3`、应用壳 | 无剧目/资产异常的生产页状态未有项目库基线 | 状态附件或项目库预览确认前，不新增卡片以外的面板、网格或说明；保持主画布无默认滚动冲突 | 1280×720、键盘滚动与无横溢出 |

**本页禁止返工模式：** 不以“禁用按钮”保留 P2 卡片；不把资产异常卡片化为原型假数据；不单独调整三张卡的颜色、文案或列数。终版已裁决的三方法标签与移除 P2 必须作为同一静态批次落地。

**本批静态合并与审查：** 三卡已逐字复制最终 Version 48 的标签、说明和入口；保留真实路由/资格判断，删除无引用的 `.method-card.future/.p2-controlled` P2 死样式。定点 `ProductionPage + DramaWorkspacePage` 为 2 files / 6 tests；完整 `pnpm test` 71 files / 303 tests、typecheck、build、design-contract、重建后的 Electron E2E（6 passed / 8 skipped，含 `p2-freeze`）均通过，独立 Stage 1/2 无 HIGH/MEDIUM/LOW。双视口项目库基线仍缺，`audit:fidelity` 的真实状态仍为 `completed=0 incomplete=92`，因此素材生产页不能标为视觉匹配。

## Open Design 状态基线任务记录

- 2026-08-01：已核验 Open Design 项目根目录 `screens-r5-merged/*` 的工作台/导出截图写入时间为 2026-07-29，而最终 Version 48 HTML 写入时间为 2026-07-30；它们是历史设计痕迹，不可复制到 `docs/design-evidence/v48/` 冒充当前 Version 48 项目库基线。
- 2026-08-01：在正在运行的 Open Design 项目中提交一个**独立、待确认**的状态设计附件请求：不改写 `short-drama-material-studio.html` 或既有页面，覆盖工作台 `default/loading/missing-media/candidate-selected`、候选池 `empty/filtered/high-volume`、导出抽屉 `default/preflight/running/failed/completed`；请求明确保持三阶段、单分集候选窗口和 P2 冻结。
- 2026-08-01：附件已写入同一 Open Design 项目库，且 manifest 明确为 `unmerged-pending-confirmation`：`original-clip-state-baseline-v48.html`、`ORIGINAL-CLIP-STATE-BASELINE-V48-MANIFEST.json`、`...-HANDOFF.md`、`...-REUSE-MATRIX.md`，以及 `screens-v48-original-clip-states/{1440x900,1280x720}-original-clip-state-baseline.png`。附件自身是 12 个状态的设计审阅器，**不是**要合并到生产软件的新导航；两张 PNG 都只展示其默认态总览，不能充当 12 个 `screen × state × viewport` 的项目库基线或填充 `audit:fidelity` 证据。
- 附件范围只到工作台、候选池和候选池内导出抽屉，未覆盖完成报告或字幕资产；其 CSS 几何（例如 `164 / fluid / 214`）是附件审阅环境的演示值，不能机械写入 Electron。待用户确认的是状态设计方向与导出抽屉形态；确认前不得用附件改生产 UI，附件也不改变 Version 48 原型只读规则。Open Design UI 的生成流仍出现过重连，但项目文件已存在，因此不得重复提交同一请求。
- 2026-08-01：本轮发现 Open Design MCP 已在 Codex 中注册，但对项目 `01b5725c-2688-4cbc-bc29-7432712449b3` 的 `get_project`、`get_active_context`、`list_files` 均返回 `Transport closed`；本机存在多个 `Open Design.exe` 进程，按用户授权再次启动主程序后连接仍未恢复。未写入、未覆盖或伪造任何项目库预览；`audit:fidelity` 仍为 `completed=0 incomplete=92`。待桥接恢复后，先读取项目库和既有状态附件，再补真实 1440×900/1280×720 项目库基线。
- 2026-08-01（连接层复核）：再次只读调用 `get_active_context`、`list_projects`、`get_project` 均稳定返回 `Transport closed`。本机 `Open Design.exe` 进程处于 Responding，`\\.\pipe\open-design-release-stable-win-daemon`、`-web`、`-desktop` 三条命名管道均存在；Codex 的 `open_design` 配置已具备正确的 `OD_DATA_DIR`、`OD_SIDECAR_IPC_PATH` 与 `ELECTRON_RUN_AS_NODE=1`。因此当前缺口是已启动 Codex MCP 子进程的 transport，而不是“应用未启动”或项目丢失；不杀进程、不改写项目、不用本地/旧截图替代项目库证据。待客户端重连后先做只读 `get_project` 验证。
- 2026-08-01（配置修正）：对照 Open Design 的本机安装片段，发现 Codex 配置的 MCP `command` 指向 payload 内可执行文件，而安装片段指定 `C:\\Users\\ZIO\\AppData\\Roaming\\Open Design\\en\\60304bf71961b691\\Open Design.exe`。已只修正该启动入口，保留同一 daemon CLI、数据目录、命名管道与 `ELECTRON_RUN_AS_NODE=1`；该改动需 Codex 下次重连/启动 MCP 后才会影响 transport。本轮不重启、不终止用户现有 Open Design 进程，也不据此声称桥接已恢复。
- 2026-08-01（只读项目 API 恢复）：经官方启动入口的 `daemon-cli.mjs status --json` 确认 Open Design daemon 健康（v0.16.1、127.0.0.1:59136）；`GET /api/projects/01b5725c-2688-4cbc-bc29-7432712449b3` 与 `/files` 可读取真实项目和文件清单。`ORIGINAL-CLIP-STATE-BASELINE-V48-MANIFEST.json` 仍为 `unmerged-pending-confirmation`，其两张总览 PNG 仍不能填补逐状态双视口基线。故可以继续只读取证和核验冻结源，但不可把附件五态直接写入生产；Codex MCP 仍须在下一次重连后验证。
- 2026-08-01（项目库画布实机复核）：只读查看 Open Design 项目库内 `preview-1280x720`，画布右上角显示 `Version 48 / Pending Confirmation`，左侧为工作台、候选池和导出抽屉的状态导航总览。该实机画布确认附件确属当前项目、视觉方向为暖石墨/暖沙橙/细线/紧凑密度，但仍是待确认的单附件审阅器，不构成任一生产屏幕状态的最终逐状态基线，不能触发生产 UI 合并。
