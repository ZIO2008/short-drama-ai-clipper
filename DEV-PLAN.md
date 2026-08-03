# Development Plan — 短剧投流素材生成平台

> **当前整合核验（2026-08-02）：** 本计划的历史 Phase 只作已发生工作的证据，不能决定当前静态整合的范围或顺序。当前唯一设计源为 `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`（SHA-256 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`）。按其结构依赖核验的顺序是：应用壳与剧目库 → 任务中心 → 同一剧目工作区标签关系 → 原剧切片三阶段 → 字幕资产入口/详情关系。四个剧目页签必须共享首屏页头基线；字幕批量操作归入列表工具栏。每一块先在 `docs/prototype-gap-register.md` 记录差异，再合并整页；不使用独立状态审阅页或孤岛页面。本阶段保留已有真实数据、IPC、路由和功能，但不扩展字幕内部后端能力，不新增 P2 解说/TTS/旁白面，也不继续开发或宣称完成多集拼接。完成证据必须包含 1440×900/1280×720 当前 Electron 截图、全量命令、两阶段独立审查；缺项目库逐态视觉基线时，`audit:fidelity` 必须如实保持未完成。

> 本计划只覆盖 Product-Spec.md 中本轮 P0 资产管理修复。

## Phase 1: 导入状态、自然排序与增量合并（已完成）

**交付内容：**
- 为剧目迁移并持久化最近成功导入目录，供文件和文件夹对话框作为初始目录。
- 将导入服务改为按集号自然排序、跳过已有相同引用、记录同集号不同文件冲突并继续处理其他项。
- 将导入结果贯通 IPC、preload、共享契约和 UI，显示导入、跳过、冲突摘要。

**关键文件：**
- `src/main/db/schema.ts` — 按剧目的导入偏好表与索引。
- `src/main/db/migrate.ts` — 兼容已有数据库的列迁移。
- `src/main/services/drama-service.ts` — 导入合并、排序与结果规则。
- `src/main/ipc/video-file-dialog.ts`、`src/main/index.ts` — 按剧目传递 defaultPath 的独立选择器。
- `src/shared/contracts.ts`、`src/preload/index.ts`、`src/renderer/src/App.tsx` — 结果和选择器参数契约。

**验收标准：**
- 已有 1 至 23 集时导入 1 至 30 集，缺失集导入且已有项不阻断。
- 数据库、资产列表和生产选择均按 1、2、…10、11 升序。

## Phase 2: 资产维护与长列表体验（已完成）

**交付内容：**
- 在资产行提供删除剧集确认和结果反馈，不删除原始视频。
- 刷新删除后的健康概览、生产资格和列表排序。
- 修复主内容区与资产表在 85 集时的页面滚动、滚动条和键盘浏览。

**关键文件：**
- `src/renderer/src/pages/DramaAssetsPage.tsx` — 导入摘要、删除操作与确认交互。
- `src/renderer/src/pages/DramaWorkspacePage.tsx`、`src/renderer/src/pages/DramaLibraryPage.tsx` — 维护回调与刷新。
- `src/renderer/src/styles/prototype-interactions.css` — 内容区和资产表滚动规则。

**验收标准：**
- 确认删除只移除应用记录，源视频仍存在。
- 85 集在 100%/125%/150% DPI 下可滚动至最后一行。

## Phase 3: 回归、真实验证与交付（已完成）

**交付内容：**
- 新增服务、IPC、组件与 E2E 回归测试。
- 使用指定真实素材前 30 集做独立数据目录的只读引用验证。
- 打包新 Windows 目录包，做隐私审计、100%/125%/150% DPI 烟测和独立代码审查。

**关键文件：**
- `src/main/services/drama-service.test.ts` — 导入、排序、冲突和源文件保护。
- `src/main/ipc/video-file-dialog.test.ts` — 记忆目录和独立对话框。
- `src/renderer/src/pages/DramaAssetsPage.test.tsx` — 删除、摘要与长列表交互。
- `tests/e2e/` — 真实导入和 DPI 包级验证。

**验收标准：**
- typecheck、完整测试、目标 E2E、隐私审计通过。
- 代码审查 Stage 1/2 无 HIGH/MEDIUM，新目录包不覆盖旧包。

## Phase 4: 供应商目录与配置引导（进行中）

**交付内容：**
- 建立共享、可维护的供应商目录，记录能力、费用标签、质量/场景、接入难度、官方来源、核验日期与预填配置。
- 将设置页改为“筛选候选 → 查看决策信息 → 预填并确认保存 → 自定义接入”的路径，保留旧配置和密钥引用。
- 统一能力标识并通过兼容迁移保留旧 `text_semantics`、`video_understanding` 默认方案；让能力状态与项目页受控模式提示使用同一事实来源。

**关键文件：**
- `src/shared/provider-catalog.ts` — 目录数据、筛选类型与预填模板。
- `src/main/db/migrate.ts`、`src/main/services/provider-profile-service.ts` — 旧能力标识兼容与本机/云端配置规则。
- `src/main/ai/capability-registry.ts`、`src/main/ipc/app-ipc.ts` — 统一能力状态。
- `src/renderer/src/pages/SettingsPage.tsx`、`src/renderer/src/pages/AiRemixWorkspacePage.tsx` — 目录选择、保存提示和项目内推荐。
- `src/renderer/src/pages/SettingsPage.test.tsx`、`src/main/services/provider-profile-service.test.ts`、`src/main/ai/capability-registry.test.ts`、`tests/e2e/` — 目录、迁移、状态和隔离桌面流程回归。

**验收标准：**
- 可按能力、费用、质量、接入难度筛选并对照候选；用户可跳转官方资料或选择自定义接入。
- 选择目录项只预填草稿；保存后才更新默认方案，旧密钥不被覆盖。
- 本机、缺密钥和云端适配器未启用状态都真实可见；P2 仍无入口。

## Phase 5: 独立能力页与默认浏览器外链（已完成，v0.1.20）

**交付内容：**
- 将 ASR 字幕识别、文本语义分析、视频理解复核拆成独立的设置配置页；总览只承担入口和状态摘要。
- 将候选目录移到独立能力页首屏，展示常见方案、费用快捷筛选、质量和接入难度筛选，并继续按当前能力过滤。
- 新增受限外链 IPC，经 Windows 默认浏览器打开官方资料和价格页，拒绝非 http(s) 与内嵌凭据 URL。

**关键文件：**
- `src/renderer/src/pages/SettingsPage.tsx`、`src/renderer/src/components/ProviderCatalogPicker.tsx`、`src/renderer/src/styles/prototype-interactions.css` — 独立入口、首屏目录与可发现筛选。
- `src/main/ipc/app-ipc.ts`、`src/preload/index.ts`、`src/shared/contracts.ts`、`src/main/security/external-url.ts` — 受限默认浏览器外链。
- `src/renderer/src/pages/SettingsPage.test.tsx`、`src/renderer/src/components/ProviderCatalogPicker.test.tsx`、`src/main/security/external-url.test.ts`、`tests/e2e/p0-workflows.spec.ts` — 配置、筛选、外链和隔离桌面回归。

**验收标准：**
- 三种能力不共用配置页面；当前能力以外的目录项不可见。
- 1440×900 首屏可见费用快捷筛选、质量、难度和候选；本机、免费/试用、按量付费路径可分别验证。
- 外部资料在系统默认浏览器打开，恶意 URL 被拒绝，P2 继续不可达。

## Phase 6: Open Design 设计保真收口（已完成，v0.1.21）

**交付内容：**
- 历史记录：当时以 `design/open-design/v2026-07-27/`、`DESIGN-HANDOFF.md` 与 `DESIGN-MANIFEST.json` 作为页面级视觉真相。本 Phase 不再决定当前范围；当前结构整合以 Version 48 最终静态 HTML 为唯一裁决源。
- 复核应用框架、剧目库/工作区、任务中心、设置和三项供应商能力页；只以真实数据、安全提示、系统原生行为替换演示内容。
- 将供应商能力页恢复为原型的桌面双栏工作区：候选与筛选在左，当前能力草稿在右；窄宽度再折叠，保留现有目录、密钥和外链安全行为。

**关键文件：**
- 历史证据：`docs/open-design-v2026-07-27-reuse-matrix.md`；当前设计源、页面映射、差异边界与验收见 `design/open-design/v2026-07-30-open-design-final/`、`docs/open-design-v2026-07-30-reuse-matrix.md` 与 `Product-Spec.md` §10.11。
- `src/renderer/src/components/ProviderCapabilityPage.tsx`、`src/renderer/src/styles/prototype-interactions.css` — 供应商双栏与响应式布局。
- `tests/e2e/p0-workflows.spec.ts` — 1440×900、1280×720 供应商页对照截图和无横向溢出断言。

**验收标准：**
- Open Design 原型的 P0/P1 页面均有生产映射或明确的范围外记录；P2 解说/TTS/旁白仍无生产可达性。
- 供应商能力页在 1440×900 双栏可见候选与草稿，在 1280×720 无横向溢出并保留可操作筛选/表单。
- 文档、版本、全量测试、E2E 截图、候选包和独立审查均可追溯。

## Phase 7: P1 受控二创与内部试点收口（已完成，v0.1.22）

**交付内容：**
- 将 P1 文本语义分析、视频理解复核与 ASR 接入受控能力状态；未配置密钥时不发起网络请求，并在界面保留区域、费用和人工确认边界。
- 完成 P1 二创的 30%/40%/50% 处理检查点、可追溯草稿、固定轨审核时间线和人工确认后导出。
- 将 P2 解说/TTS/旁白保持为未来态：不新增生产路由、preload、IPC、任务、结果或供应商入口；历史 `ai_narration` 草稿在导出服务入口被明确拒绝。
- 生成 P1 1440×900 / 1280×720 证据截图，并打包唯一的 `v0.1.22-p1-internal-trial` Windows 目录候选。

**关键文件：**
- `src/main/ai/remix-export-service.ts`、`src/main/ai/remix-export-service.test.ts` — P1 草稿导出、人工确认与 P2 历史草稿拒绝。
- `src/main/ipc/app-ipc.ts`、`src/preload/index.ts`、`src/renderer/src/pages/AiRemixWorkspacePage.tsx`、`src/renderer/src/pages/AiReviewTimelinePage.tsx` — P1 受控可达面与审核交互。
- `tests/e2e/p1-remix-workflow.spec.ts`、`docs/design-evidence/v0.1.21/`、`docs/p1-delivery-audit.md` — 双视口流程和交付证据。
- `release/candidates/v0.1.22-p1-internal-trial/candidate-manifest.json` — 可执行文件与 app.asar 的固定哈希清单。

**验收标准：**
- P1 仅在本地受控数据和人工确认边界内运行；公共能力列表不出现 `tts`，preload 不暴露 `createNarrationTask`。
- P2 历史草稿在任何导出或生成记录前被拒绝；生产物不含 P2 任务或成果路径。
- `typecheck`、完整测试、构建、桌面 E2E、视觉审计、候选包 DPI/长列表验证和独立审查均有可复查证据；干净机验证仍明确列为外部条件下的未执行项。

## Phase 8: 原剧分集切片与共享字幕资产重构（已完成；v0.1.28 发布闭环）

**目标：**
- 将单集数字入/出点工作区升级为“生成候选切片”优先、双时间线联动的 P0 剪辑工作台；在同一滚动工作区清晰管理全部分集状态、批量候选和可控重复。
- 将字幕证据链提升为剧目级共享字幕资产中心：SRT/VTT、固定区域 OCR、离线/受控 ASR、冲突队列、人工决议、导出审计与合法剪映/DaVinci SRT 交换，不再堆进切片页。
- r5 以“候选池 + 独立导出”为核心：生成仅创建候选；候选按分集分组但在同一可虚拟化窗口中汇总查看；确认候选后以单个/批量独立导出交付，禁止将多剧集候选默认拼为一条成片序列。压力基线为 100 集、5,000 候选、500 个待导出项。
- 字幕资产中心只负责 ASR/OCR 证据差异与校验；展示字幕的优化发生在具体候选片段的剪辑上下文，保留来源与差异审计。r5 必须修复字幕预览为完整源画幅 `contain` + OCR 区域叠加。
- 设计实现必须以完整静态原型 `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html` 为唯一组合源（SHA-256：`D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`）：保留既有素材生产入口、应用壳、剧目标签、成果库和任务中心，直接嵌入 SCREEN-005 / SCREEN-011 及候选池、导出、字幕优化状态。不得把独立 r5 HTML 当作设计源或把本 Phase 缩减成两页孤岛开发。

**设计门禁（已通过，2026-07-30）：**
- 用户确认完整静态原型 `short-drama-material-studio.html` 为本轮唯一组合设计源；此前 r5 独立草稿全部废弃。实现必须从素材生产入口进入，继续保留应用壳、剧目上下文、任务与成果的真实可达性，而不是把切片和字幕做成孤岛。
- 复用、替换和真实数据差异见 `docs/open-design-v2026-07-30-reuse-matrix.md`。任何偏离该原型的信息层级、操作顺序或视觉 token，必须先记录为实现差异；不得以旧切片工具或浏览器默认样式补位。

**实施顺序：**
1. 先扩展共享契约、SQLite 迁移、候选服务与任务记录：候选生成、分集状态聚合、可控重合、候选内字幕变体审计、导出预检/批量队列与可重试项均使用真实本地数据；原剧切片任务保存完整导出快照，任务中心重试必须恢复快照并真实执行导出，不能只更新状态。
2. 再实现“候选工作区 → 全部候选 → 完成报告”的同一工作区状态，以及独立字幕资产标签；所有页面复用最终原型的壳和可达路径。
3. 最后补齐虚拟化压力、双视口视觉证据、桌面 E2E、P2 不可达扫描与独立代码审查；缺少真实 OCR/ASR 引擎时只报告未测，不伪造准确率或费用。

**验收：**
- 见 Product-Spec `CLIP-001` 至 `CLIP-004`、`SUB-001` 至 `SUB-003`；测试覆盖、真实样本统计、P2 冻结、独立审查与 Windows 证据均不可缺失。
- 已完成源码、Electron 与包级验收：候选池、独立导出、真实 FFmpeg 重试、共享字幕互证、完整结论队列、双视口截图、P2 provider 与历史时间线冻结门禁、100%/125%/150% DPI、85 集长列表和实际 EXE 启动均通过。最新入口及哈希见 `docs/v0.1.28-p1-internal-trial-closure.md`；v0.1.23 至 v0.1.27 均仅保留为不可覆盖历史证据，不作为最终工具。

## Phase 9: Open Design Version 48 逐态对齐（实施中；v0.1.32 记录不构成完成证明）

**依赖：** `Product-Spec.md` §10.9、Open Design 项目库 Version 48、既有 Phase 8 服务与 P2 冻结守卫。

**交付清单：**
1. 以 `ClipCandidatePoolPage` 重构为“当前分集 + 窗口化候选”的第二阶段；保留真实筛选、搜索、选择、导出与 5,000 候选压力基线，新增逐集可达性与窗口测试。
2. 新增原剧切片完成报告路由状态和页面，接收真实导出任务/候选结果；回退素材生产，成果库仅作为显式后续回链。
3. 历史 Phase 8 曾以 `SubtitleAssetsPage` 承载字幕列表与详情；该实现已由 Phase 11 删除，不得再用作当前页面、样式或交互先例。
4. 对齐 `clip-module.css`、复用组件和页面可访问性：最终 token、窄滚动条、模态焦点/图标关闭、1440×900 与 1280×720 布局。
5. 更新 Playwright/Electron 视觉审计、差异清单、复用矩阵、closure；修复终审发现的逐集字幕首屏竞态、请求乱序隔离与导出批次报告绑定后，递增候选包至 v0.1.32 并重新终审。
6. 补齐 ALIGN-007：将 FFprobe 宽高贯通 episodes 持久化、共享契约、工作台与字幕详情；缺媒体/加载/未选中占位保持该画幅并提供可辨识暖色场景骨架。工作台和字幕详情均接通“前往剧目资产重新关联”；空 `sourcePath` 进入缺媒体态而不崩溃；重关联到不可读路径时保留旧宽高、清除时长与帧率。以 16:9、9:16、空路径及真实读取失败的 Electron 回归验证，不把手工 DOM 事件作为唯一故障证据。
7. 补齐 ALIGN-008：从任一剧目内嵌工作区点击应用壳“剧目库”时，强制退出库内选中状态并回到根列表；退出信号不得重挂整个库页或丢失根页的搜索、筛选、排序、视图和创建草稿。重新打开剧目必须重新读取持久化数据。覆盖字幕资产内更新为缺媒体后经全局导航重开，以及根页状态保留的 Electron 回归。
8. 补齐 ALIGN-009：按 Version 48 将 `OriginalClipWorkspacePage` 默认态收敛为媒体优先的源分集—监视器—双时间线—候选检查器；生成配置只在生成前/预检状态显现，候选内字幕变体改为按需入口，保持独立字幕资产标签和真实证据链。覆盖 1440×900、1280×720 与无横向溢出回归，禁止删除现有候选生成、左右微调、确认和字幕来源能力。
9. 补齐 ALIGN-010：按 Version 48 收紧既有应用壳的侧栏、顶栏和内容内边距，使切片工作台在 1440×900 首屏完整呈现监视器、当前候选时间线和源分集时间线；不得通过新壳、隐藏全局导航或页面滚动替代嵌入式布局对齐。
10. 补齐 ALIGN-011：候选池页面保留“原剧切片工作区”模块标题和返回语义，将“全部候选”限制为第二阶段与候选区标题；左侧剧集和右侧队列以真实媒体/候选状态显示未生成、待确认、已确认、导出中、已导出、异常、媒体缺失和计数。以真实 Electron 回归证明当前源分集窗口化、批量选择和导出入口没有因层级修正而回退。
11. 补齐 ALIGN-012：创建导出时持久化本次 candidate ID 批次，成功完成后在候选池提供“查看最近完成报告”回链；页面仅可传递该批次候选给完成报告，重启后仍可恢复，未完成/不存在批次时不可伪造报告入口。补齐服务、迁移、IPC、组件与 Electron 回归。
12. 补齐 ALIGN-013：完成报告显示 Version 48 三阶段导航；候选工作区/全部候选回到真实工作区，导出继续在候选池使用真实抽屉而非单独阶段，完成报告为第三个活动阶段。补充阶段可达性与双视口报告截图。
13. 审查收口：候选池只保留当前分集的真实窗口化（“全部”仅为当前集状态筛选）；单候选、批量、重试导出统一持久化批次，校验 candidate ID 去重并在写入前原子抢占。补齐空/运行中/取消/失败批次不开放报告、重启后恢复完成批次、遗留运行批次在重启时如实取消并释放仍持有候选，以及并发拒绝的服务、组件和 Electron 证据。
14. 补齐 ALIGN-014：工作台阶段栏改回 Version 48 的分段边框和暖沙橙活动态；收紧时间线与媒体区域的分配，在 1440×900、1280×720 真实 Electron 回归中断言监视器、候选时间线、源时间线的边界均位于首屏，且继续保留 `object-fit: contain`、真实缺媒体画幅和无横向溢出。
15. 补齐候选池键盘滚动：源分集与当前候选区域取得焦点后，Home、End、PageUp、PageDown 与上下方向键只滚动对应内层容器；用真实 50 候选 Electron 场景证明 End 不滚主页面，并保留 5,000 候选窗口化单测。
16. 补齐完成报告受限画布：第三阶段复用应用壳内的全高布局，结果行仅在报告内层滚动；1440×900、1280×720 不得出现由报告底部内边距引起的 `#main-content` 默认滚动条、首屏裁切或独立报告页。
17. 补齐多轮生成配置可达性：候选已选态不在源分集列常驻参数；顶栏再次生成先打开按需配置与预检，重启后仍可明确设置数量、时长、低重合和重复来源。
18. 补齐 ALIGN-015：字幕详情读取与全剧集状态汇总并发但隔离，慢速 90 集列表不得阻塞当前详情；任一核心证据读取失败时详情各列和结论区如实保持错误态，不得用空数组渲染“未导入”。将既有本地固定区域 OCR 服务接入详情的可达按钮，只有 ASR、固定区域与本机引擎齐备时执行；成功仅新增 OCR 证据，失败不伪造结果。识别设置仅保留有真实证据归档/校验语义的导入策略，不提供“仅作为展示字幕”。补齐慢列表、快速切集、OCR 成功/未就绪/失败的组件回归。
19. 补齐 ALIGN-016：原剧切片工作区为分集生产状态及当前候选字幕证据/展示变体建立独立 `loading → loaded | error` 状态和请求 ID 隔离。读取失败时不伪造“未生成”或“先建立字幕”，错误仅影响依赖区，不阻塞监视器、双时间线、候选编辑与确认。覆盖状态汇总失败、字幕读取失败、候选快速切换乱序与刷新后恢复。
20. 补齐 ALIGN-017：爆点前置二创的能力状态读取建立 `loading → loaded | error`、能力缺失错误与单独重试；读取失败不能把空数组渲染为“已配置全部能力”，也不能阻塞受控本地分析。覆盖失败、缺 API、重试恢复和迟到响应；不新增云端或 P2 执行面。
21. 补齐 ALIGN-018：候选池导出抽屉以 `exportId` 隔离进度轮询、取消、重试和消息；旧批次迟到响应不得覆盖当前批次，失败如实显示。覆盖连续批次、关闭后迟到响应和失败路径。
22. 补齐 ALIGN-019：以 Version 48 候选池实际项目库预览重收敛候选行的序号/时码/来源/时长/状态/打开操作与面板密度；当前分集已在工具栏明确时不重复渲染列表组标题。显示序号按持久化创建顺序稳定、后续生成不重排，且 `C-xx` 与源时码均可搜索。候选行不常驻选择框，批量选择改由“配置并导出”的按需抽屉承接，默认预选全部已确认候选并能逐项取消；预检、导出、批次持久化和键盘可达性必须继续使用该次真实选择。保持 5,000 候选窗口化；分离顶部“返回素材生产”与第一阶段入口。补充组件和 1440×900、1280×720 Electron 截图/边界回归，不将数据量差异或截图临时态写成视觉通过。
23. 补齐 ALIGN-020：批量生成返回多个分集候选时，首个真实候选的 `episodeId` 必须同步驱动当前源分集、监视器、双时间线、左侧激活行与检查器；空结果不改变原选择。补充跨分集生成的组件回归，避免候选已切换而源时间线仍停留旧集。
24. 补齐 ALIGN-021：候选池检查器严格复用 Version 48 的导出→完成报告路径；删除跳过第三阶段的成果库入口，只有完成报告保留通往成果库的显式后续动作。覆盖无完成批次时报告禁用、有完成批次时可达报告，以及候选池不存在成果库跳转。
25. 补齐 ALIGN-022：以最终 Version 48 覆盖脚本收紧素材生产页为三项 P0/P1 方法，逐字复制三张卡的标签、说明与入口，移除 P2 解说未来卡及无引用 P2 样式；P2 负向 Electron E2E 必须在重建后的产物中验证生产页无卡片、无禁用按钮、无路由/IPC/provider/任务/成果入口。定点三卡顺序、说明、入口及三条真实回调必须回归。
26. 对所有依赖 `out/` 的 Electron E2E，测试脚本必须先构建当前源码再重建 Electron 原生模块；不得让 P2 冻结或视觉回归在旧构建产物上取得假绿。
27. 补齐 ALIGN-023：按 Version 48 合并剧目库完整页头、工具栏、三列卡片/同卡片列表和每页六项分页；删除无设计依据的页头计数、卡片操作条、摘要 rail 与表格壳，保留真实剧目/封面/筛选/排序/创建/导入/工作区编辑可达性。加载、全空与读取错误状态未经 Open Design 依据不得自由改造。
28. 补齐 ALIGN-024：以 `screen-assets` 579–585 行及终版字幕标签注入脚本为默认态组合源，完整核对 `DramaWorkspacePage`、`DramaAssetsPage`、`DramaEditorPage` 的剧目上下文、标签、健康条、工具栏、七列资产表、内层滚动与 1280×720 断点。字幕标签、文件夹导入、删除应用内引用、剧本预览仅作为有规格依据的真实扩展保留；加载、空、失败、缺媒体、删除确认、85 集压力等非原型状态先登记为 Open Design 设计依赖，不能自由美化。补齐定点组件和真实 Electron 长列表/重新关联回归；未取得项目库双视口同态基线前，不得标视觉完成。
29. 补齐 ALIGN-025：多集拼接的第 4 阶段在任务运行结束、取消或用户重开报告时，从既有 `tasks:list` 与 `tasks:report` IPC 读取当前剧目作用域的 `multi_episode` 任务真实汇总与项明细；按 dramaId 持久化当前 taskId，重开时验证 taskId、dramaId、type，禁止猜测“最近任务”。`onRunTask` 返回只表示执行请求返回：仅 `completed`、`partial`、`failed`、`cancelled` 终态可进入报告，运行/暂停保持真实状态并轮询刷新。以真实成功/缩减/跳过/失败/取消数量、输出路径与原因替代“任务已进入队列”的伪报告；成果库与失败到任务中心保持显式回链，取消保留已完成结果，报告读取错误独立重试。新任务创建必须清除旧终态报告；成果库回链先刷新当前剧目材料再跳转。组件与真实 Electron P0 回归覆盖运行态、连续任务、跨剧目/跨类型指针隔离及重开同一报告。先完成功能真实性，再仅按原型已覆盖的默认报告结构合并，运行/失败/取消视觉状态不自由设计。

    验收记录：ALIGN-025 功能与独立两阶段审查已通过；定点 3 文件 / 13 测试、`pnpm test` 71 files / 303 tests、typecheck、build、design-contract 和 Electron P0（6 passed / 8 skipped）通过。`audit:fidelity` 仍为 `completed=0 incomplete=92`，且运行/失败/取消的 Open Design 双视口基线未齐，因此本项视觉验收仍未完成。

**关键文件：**
- `src/renderer/src/pages/ClipCandidatePoolPage.tsx`
- `src/renderer/src/pages/OriginalClipReportPage.tsx`（新建）
- 历史文件 `src/renderer/src/pages/SubtitleAssetsPage.tsx`（Phase 11 已删除；仅保留此处的历史追溯）
- `src/renderer/src/App.tsx`、`src/renderer/src/pages/DramaWorkspacePage.tsx`
- `src/renderer/src/styles/clip-module.css`
- `src/main/ipc/app-ipc.ts`、`src/preload/index.ts`、`src/shared/contracts.ts`（仅字幕生成/设置真实能力需要时）
- `src/main/db/schema.ts`、`src/main/db/migrate.ts`、`src/main/services/episode-import-service.ts`、`src/main/services/drama-service.ts`
- `src/renderer/src/components/MediaMonitor.tsx`、`src/renderer/src/styles/clip-module.css`
- `tests/e2e/phase9-open-design-alignment.spec.ts`（新建）

**验收标准：**
- ALIGN-001 至 ALIGN-006 的每项在 `docs/prototype-gap-register.md` 有原型证据、生产文件、真实交互和双视口截图；无“未实现”非 P2 项。
- `pnpm test`、`pnpm run typecheck`、`pnpm run build`、`pnpm run test:e2e`、`pnpm run audit:fidelity` 通过；P2 负向 E2E 继续通过。
- v0.1.32 候选包将以 manifest 指向的 EXE 实测启动，通过包级 DPI/长列表 E2E、哈希核验与新的独立两阶段审查。

## Phase 10: 设计交接与视觉验收门禁（设计合同已就绪，逐状态证据待补齐）

**交付内容：**

1. 维护 `docs/design-contract-v48.json`：唯一项目 ID、版本、SHA、页面、状态、双视口与允许差异；不允许依据旧 r5 或历史截图覆盖该合同。
2. 用 `tools/validate-design-contract.mjs` 验证 HTML 哈希、页面标识、Open Design 同版本 `design-brief.md`/`Product-Spec.md`、artifact 和镜像 SHA-256；候选打包前必须通过。
3. 以项目库预览为基线，补齐每个 `screen × state × viewport` 的 Electron 视觉证据和区域差异；将当前 `captured-current-flow-historical-reference-unavailable` 等旧审计结果列为失败，不能进入 closure。
4. 建立不可混用的 fixture→状态映射：原剧切片空工作区只能对应 `loading`/`missing-media`，生成并选中候选后才对应 `default`/`candidate-selected`；字幕资产首屏混合状态、单集详情（`validated`/`needs-review`/`missing-media`）和 90 条压力样本分别采集，不得用空态截图替代已选态或把同一张概览图复制到多个状态。

**关键文件：**

- `docs/design-contract-v48.json`
- `docs/design-delivery-gate.md`
- `tools/validate-design-contract.mjs`
- `tools/pack-current-candidate.mjs`
- `tools/visual-fidelity-report.mjs`

**验收标准：**

- `pnpm run validate:design-contract` 通过；若同版本交接物缺失则必须失败。合同已通过但逐状态预览或 Electron 证据缺失时，`pnpm run audit:fidelity` 必须明确失败并逐项列出缺口，不得保留历史跳过状态。
- 每个合同状态都有项目库预览基线、Electron 截图、fixture、交互断言和允许差异说明；不能用当前应用截图替代原型基线。
- 打包脚本拒绝未通过设计合同的 UI 候选；设计合同通过后才允许恢复候选包流程。

## Phase 11: Version 48 剧目工作区壳重建（进行中）

**目标：** 停止在旧 renderer 布局上逐点修补。只以 `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`（SHA-256 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`）中的 `screen-clip`、`screen-clip-pool`、`screen-clip-report`、`screen-subtitles` 取代错误页面结构，再接回真实数据和既有业务回调。

**交付清单：**

1. 删除 `OriginalClipWorkspacePage.tsx`、`ClipCandidatePoolPage.tsx`、`OriginalClipReportPage.tsx`、`SubtitleAssetsPage.tsx` 及其旧测试，不从中复用任何布局或视觉逻辑。
2. 直接从原型原文加载四个目标 `screen-*` 节点及其原始 CSS；`DramaWorkspacePage.tsx` 只保留已有路由上下文和最小的返回/成果回链桥接。
3. 将原型演示数据逐项替换为既有真实数据和 IPC 结果；任何原型未出现的内容、控件或状态不得进入切片和字幕屏幕。
4. 只验证桥接的真实数据与回调，不再以重写页面的截图/差异台账作为布局验收路径。
5. 本轮候选池与完成报告只恢复终版原型中已有的会话交互；不接 SQLite、IPC、导出、成果库或文件系统。必须覆盖分集/阶段/筛选/搜索/分页/候选“打开”/报告行选择/抽屉与弹层的可操作状态，以及关闭、包装预览和禁用反馈。

**关键文件：**

- `src/renderer/src/pages/DramaWorkspacePage.tsx`
- `src/renderer/src/pages/StaticPrototypeSurface.tsx`
- `src/renderer/src/pages/SubtitleRecognitionSettingsBridge.ts`
- `src/renderer/src/pages/SubtitleRecognitionSettingsBridge.test.ts`
- `src/renderer/src/pages/SubtitleImportBridge.ts`
- `src/renderer/src/pages/SubtitleImportBridge.test.ts`
- `src/main/services/subtitle-asset-service.ts`
- `src/main/services/subtitle-asset-service.test.ts`
- `src/renderer/src/styles/prototype-interactions.css`
- `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`

**验收：** 已删除的旧页面不再被 renderer 引用；运行时载入的目标 DOM 来自同一 SHA 的四个 `screen-*` 原文，静态页面不因 React/JSX 翻译产生差异。字幕识别设置桥接必须覆盖六项回显及保存、读取失败保护、不支持的展示策略拦截、关闭重开后的迟到读写忽略和同会话单次保存。字幕列表必须只在 `subtitle-list-scroll` 内滚动；导入桥接必须覆盖取消、SRT/VTT 成功、失败、重复点击与选择/写入超时保护，且只调用既有选择/导入 IPC；既有字幕资产服务必须保证迟到重试不重复创建同源资产、轨道或字幕条。必须通过桥接及幂等服务测试、`pnpm run typecheck` 与 `pnpm run build`；`audit:fidelity` 的项目库基线缺口仍如实保留，不能被本迁移替代。

## Phase 12: 字幕资产本地真实可用（待实施）

**依赖：** `Product-Spec.md` §10.12、最终 Open Design Version 48 的 `screen-subtitles` 原文、已有 `SubtitleAssetService`、`SubtitleEvidenceService`、`LocalOcrSubtitleService` 及其 IPC/preload 契约。

**目标：** 不改变 `screen-subtitles` 的静态结构、样式、文案或交互顺序；只在 iframe 外层桥接真实本地字幕数据、设置和 OCR，使原型中已有入口可实际使用而不冒充云端能力。

**交付清单：**

1. 盘点并补齐共享契约、IPC 与 preload 中已实现的字幕资产/轨道/证据/媒体/识别设置读取接口；不重复创建服务或数据库模型。为单集详情提供独立读取聚合，列表汇总与详情读取并发且以请求 ID 隔离。
2. 将字幕列表的每一行映射到真实剧集及其导入、ASR、OCR、媒体状态；“查看画面/状态”打开原型详情模态后，写入真实源画幅、OCR 区域、轨道、差异/质量和证据。加载、空、错误和缺媒体必须各自可辨，不能继续显示原型样例值。
3. 保留既有导入桥接并将成功后的真实资产重新读取到列表/当前详情；取消、格式/解析失败、IPC 超时、迟到重试和同源幂等均要可回归。
4. 保留六项设置原型弹层，读写真实持久化配置；保存中锁定重复提交，读取/保存失败不覆盖旧值；将不支持的“仅作为展示字幕”保持为阻止保存的显式错误。
5. 将原型列表工具栏已有的“一键生成字幕”连接到既有本地 OCR：详情模态没有 OCR 控件，不新增原型外入口；关闭详情后保持当前剧集选择，供“当前剧集”范围执行。仅对范围内具备 ASR、固定区域、本机引擎和可读媒体的剧集执行；逐集报告真实未就绪/失败原因，成功后只新增 OCR 轨和证据并刷新列表及仍打开的详情。
6. 补桥接与服务回归：90 集慢列表不阻塞当前详情、快速切集的迟到响应隔离、核心读取失败不伪造未导入、导入/设置/OCR 成功及失败路径、本机引擎缺失和缺媒体。完成后执行独立两阶段 code review、`pnpm test`、`pnpm run typecheck`、`pnpm run build` 和隔离 Electron 实机路径。

**关键文件：**

- `src/renderer/src/pages/DramaWorkspacePage.tsx`
- `src/renderer/src/pages/StaticPrototypeSurface.tsx`
- `src/renderer/src/pages/SubtitleImportBridge.ts`
- `src/renderer/src/pages/SubtitleRecognitionSettingsBridge.ts`
- `src/renderer/src/pages/SubtitleAssetDetailBridge.ts`
- `src/renderer/src/pages/SubtitleAssetRuntimeBridge.ts`（新建，如现有桥接无法保持单一职责）
- `src/main/services/subtitle-asset-service.ts`
- `src/main/services/subtitle-evidence-service.ts`
- `src/main/services/local-ocr-subtitle-service.ts`
- `src/main/ipc/app-ipc.ts`、`src/preload/index.ts`、`src/shared/contracts.ts`

**验收标准：**

- `SUB-REAL-001` 至 `SUB-REAL-005` 每项均有真实数据/IPC 断言和负向路径测试；没有一处把示例条数、状态或 toast 作为真实结果。
- 最终 `screen-subtitles` 的静态屏幕源仍来自同一 Version 48 HTML；生产桥接不向 iframe 添加原型外控件、文案或布局。
- `pnpm test`、`pnpm run typecheck`、`pnpm run build` 和 `pnpm run validate:design-contract` 通过；隔离 Electron 回归同时证明导入、设置和本地 OCR 的成功/失败路径。项目库逐态预览仍缺失时，`audit:fidelity` 必须保留失败，不得据此宣称视觉验收完成。

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|---|---|---|---|
| Desktop | Electron | 43.1.1 | Windows 本地文件对话框与打包 |
| UI | React | 19.2.7 | 资产管理界面 |
| 数据库 | better-sqlite3 / SQLite | 12.11.1 | 本地持久化与迁移 |
| 测试 | Vitest / Playwright | 4.1.10 / 1.61.1 | 单元、组件与包级验证 |

## 数据库表

| 表名 | 所属 Phase | 用途 |
|---|---|---|
| `drama_import_preferences` | Phase 1 | 保存按剧目的 `last_import_directory` 选择器初始目录 |
| `episodes` | Phase 1 | 保持剧集引用、数值排序与冲突比对 |

## 开发规则

- 不提交、不推送、不删除或移动 `E:\剪辑盘` 下真实源视频。
- 每个 Phase 执行代码审查、测试完整性、类型检查和功能测试。
- Windows 目录包使用新 release 目录，不覆盖旧包；不执行干净机验证。
## Phase 13: 原剧切片候选工作区本地真实可用（实施中）

**目标：**
- 将最终静态原型 `screen-clip` 的演示/会话桥接替换为真实候选工作区，不重写原型的 HTML、CSS、初始布局或其它模块。

**交付内容：**
1. 以当前剧目 `EpisodeAsset`、`listClipCandidates` 和 `listClipEpisodeStatuses` 填充原型的左轨、监视器、双时间线和检查器；读取中、错误、缺媒体和无候选不可混淆。
2. 将当前候选的源时间线拖动和四个微调按钮持久化到 `updateClipCandidate`，保留 0.1 秒最短时长与源分集边界；连续拖动按最新范围合并写入。
3. 接通真实 `confirmClipCandidate`，并按原型既有“生成候选切片”入口先预检再调用生成；成功后切换至首个实际生成候选和其源分集。
4. 为真实读取、切集乱序、缺媒体、候选写入、确认、生成和失败反馈建立桥接回归；完成后进行独立两阶段代码审查、专项测试、类型检查、构建和设计合同核验。
5. 用最新原型原文中的“本集候选”切换区展示当前真实分集候选，固定四项窗口并将切换接回同一候选选择状态；不得保留 `C-01` 演示数据。

**关键文件：**
- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.ts`
- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.test.ts`
- `src/renderer/src/pages/DramaWorkspacePage.tsx`
- `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`

**验收标准：**
- 工作区不再包含硬编码分集、候选或演示确认；所有显示与操作均对应当前 `dramaId` 的真实本地数据。
- 分集切换不会遗留旧候选、时间线或媒体；无法读取时只显示失败事实。
- 编辑和确认确实经已有 IPC 持久化，源视频没有写入；不新增候选池、报告、导出或多集拼接范围。

## Phase 14: 原剧切片全部候选与完成报告本地真实可用（待实施）

**目标：**

- 将 Version 48 的 `screen-clip-pool` 与 `screen-clip-report` 演示桥接替换为真实本地候选、导出批次与报告数据；不重写原型 HTML/CSS/布局，不改其它模块。

**实施顺序：**

1. 以真实 `EpisodeAsset`、`listClipCandidates`、`listClipEpisodeStatuses` 重建全部候选左轨、当前集窗口、状态筛选、搜索、翻页和“打开”定位；不保留演示编号或跨集候选混排。
2. 将原型既有导出弹层接到 `chooseOutputDirectory`、`preflightClipExport`、`startClipExport`、`getClipExportProgress` 与 `cancelClipExport`；只导出真实已确认候选，按 `exportId` 隔离轮询和反馈。
3. 以 `getLatestClipExportBatch`、真实候选与已有成果记录渲染完成报告；仅真实已完成批次可打开报告，行操作返回对应候选工作区或原型已有成果库回链。
4. 为读取/空/缺媒体/搜索无结果/预检拒绝/取消/失败/乱序和完整 Electron 路径建立回归，并完成独立两阶段审查、类型检查、构建和设计合同核验。
5. 以原型垃圾桶按钮为每行候选提供确认删除：仅允许删除未导出候选及其从属字幕变体，严格拒绝导出中/已导出候选以保留批次、报告和输出审计；剧目资产删除按钮改为同原型图标，保留既有确认和源视频保护。

**关键文件：**

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`
- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.test.ts`
- `src/renderer/src/pages/DramaWorkspacePage.tsx`
- `tests/e2e/phase14-original-clip-pool-report.spec.ts`
- `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`

**验收标准：**

- 全部候选与完成报告不再含硬编码分集、候选、状态、文件或成功 toast；每个显示和操作均对应当前 `dramaId` 的真实本地数据。
- 只有真实完成导出批次进入报告；运行、失败、取消和无批次不会伪造报告或成果。
- 未改动候选工作区、字幕资产、剧目库、成果库、批量拼接、P2 能力或源视频。

## Phase 15: 能力供应商原型直连试跑（实施中）

**目标：**

- 固定 `screen-settings` 的能力供应商总览和三个 `screen-*` 独立配置页为“最终静态原型原文 + 外部 Bridge”，用它完成一次不需要用户参与的真实配置流程试跑。

**实施顺序：**

1. `StaticPrototypeSurface` 仅按需隔离当前 settings/provider 屏幕，保留原型设置页面与三项供应商页面，不改 HTML 文件。
2. 断开、删除旧 React 供应商总览/目录/配置页；`SettingsPage` 只保留路由状态和对既有非供应商设置项的承接。
3. Bridge 回接真实 profile、密钥状态、目录预填、密钥保存、profile 保存和受限外链；原型已有费用筛选由原型脚本处理。
4. 覆盖总览状态、三项路由、手填字段保护、保存、外链、错误校验与非供应商设置回退；然后执行 Electron 路径、构建和独立审查。

**关键文件：**

- `src/renderer/src/pages/StaticPrototypeSurface.tsx`
- `src/renderer/src/pages/ProviderSettingsPrototypeBridge.ts`
- `src/renderer/src/pages/SettingsPage.tsx`
- `src/shared/provider-catalog.ts`
- `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`

**验收标准：**

- 目标页面来自最终静态原型原文；旧 React 供应商组件不再存在或被引用。
- 三项真实配置、目录预填、密钥安全存储、保存状态更新和系统默认浏览器外链均可验证；不触发云端调用，P2 仍冻结。
- 供应商页只按需存在一个 iframe；其他设置项、剧目库和工作区不因本次实现持有或叠加 iframe。

## 独立工具：剪映字幕识别小工具（已交付，不属于主项目 Phase）

`D:\个人工作\剪映字幕识别小工具\` 是可独立完成任务的 Windows 小工具，负责在用户已登录的剪映专业版中识别字幕并导出 SRT。它的代码、运行合同、锚点和实机证据均在独立目录维护，不与本 Electron 产品共享发布节奏。

当前不计划将它接入主产品。若用户后续明确决定集成，必须作为新的需求立项，单独定义调用契约、版本探测、前台控制权、失败隔离、用户授权、日志归属与端到端验收；在此之前不得增加主产品入口、IPC、任务、设置或发布声明。
