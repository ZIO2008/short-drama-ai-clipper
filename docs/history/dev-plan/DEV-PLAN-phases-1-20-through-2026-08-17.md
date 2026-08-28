# Development Plan — 短剧投流素材生成平台

> **当前设计治理与顺序（2026-08-17）：** 本计划的历史 Phase 只作已发生工作的证据，不能决定当前静态整合的范围、来源或顺序。V49 是全产品唯一当前设计源：`design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`（SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`）；所有 Version 48 引用只保留历史追溯，不能补充、覆盖或阻断 V49 当前工作。接下来的独立顺序固定为：① 本次上游治理文件收口；② 逐屏将运行时来源迁移到 V49 并逐屏验收结构/行为，不重复已冻结任务；③ 建立 V49 设计合同和证据目录，替换当前 V48 合同/审计/打包门禁；④ 由用户决定是否启动 V49 视觉验收。第 ②、③、④ 项均未开始，不能以旧 `audit:fidelity` 结果标记 V49 通过或阻断其迁移。保留已有真实数据、IPC、路由和功能，不扩展字幕内部后端能力，不新增 P2 解说/TTS/旁白面，也不继续开发或宣称完成多集拼接。

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

## Phase 4: 供应商目录与配置引导（历史实现记录；不在当前队列）

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
- 历史记录：当时以 `design/open-design/v2026-07-27/`、`DESIGN-HANDOFF.md` 与 `DESIGN-MANIFEST.json` 作为页面级视觉真相，后续曾转向 Version 48。它们均不再决定当前范围或结构整合；当前唯一裁决源为本计划顶部列出的 V49 HTML。
- 复核应用框架、剧目库/工作区、任务中心、设置和三项供应商能力页；只以真实数据、安全提示、系统原生行为替换演示内容。
- 将供应商能力页恢复为原型的桌面双栏工作区：候选与筛选在左，当前能力草稿在右；窄宽度再折叠，保留现有目录、密钥和外链安全行为。

**关键文件：**
- 历史证据：`docs/open-design-v2026-07-27-reuse-matrix.md`、`design/open-design/v2026-07-30-open-design-final/`、`docs/open-design-v2026-07-30-reuse-matrix.md` 与 `Product-Spec.md` §10.11；它们不再是当前设计源，当前来源见本计划顶部指定的 V49 HTML。
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

> **归档说明：** 本 Phase 内的 Version 48“唯一组合源”、设计门禁、实施顺序和验收均只记录历史工作；不得恢复为当前设计来源、待办或门禁。当前 V49 队列只继承其真实数据、源文件保护、P2 冻结及行为约束。

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
- 已完成源码、Electron 与包级验收：候选池、独立导出、真实 FFmpeg 重试、共享字幕互证、完整结论队列、双视口截图、P2 provider 与历史时间线冻结门禁、100%/125%/150% DPI、85 集长列表和实际 EXE 启动均通过。最新入口及哈希见 `docs/history/closures/v0.1.28-p1-internal-trial-closure.md`；v0.1.23 至 v0.1.27 均仅保留为不可覆盖历史证据，不作为最终工具。

## Phase 9: Open Design Version 48 逐态对齐（历史记录；不再实施或作为当前门禁）

> **归档说明：** 本 Phase 下的“交付清单”“补齐”“验收标准”和 V48 来源都只记录已发生工作；不得从中恢复待办、视觉门禁或打包/审计命令。当前后续队列仅以本计划顶部的 V49 顺序为准。

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

## Phase 10: Version 48 设计交接与视觉验收门禁（历史记录；不再作为当前门禁）

> **归档说明：** 下列合同、脚本、fixture、截图与验收标准只适用于 Version 48 历史合同。它们不能验证或阻断 V49；V49 合同、证据和脚本替换尚未开始，须在 V49 逐屏运行时迁移完成后独立建立。

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

## Phase 11: Version 48 剧目工作区壳重建（历史实现记录；不在当前队列）

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

## Phase 12: 字幕资产本地真实可用（历史实现记录；不在当前队列）

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
## Phase 13: 原剧切片候选工作区本地真实可用（历史实现记录；不在当前队列）

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

## Phase 14: 原剧切片全部候选与完成报告本地真实可用（历史实现记录；不在当前队列）

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

## Phase 15: 能力供应商原型直连试跑（历史实现记录；SUP-011 已独立冻结）

> **归档说明：** 以下“实施中”、Version 48 来源和旧 DeepSeek 静态源都是历史工作记录，不能构成当前供应商页的视觉来源或继续执行的工作队列。SUP-011 的通用凭据 schema 已独立完成并冻结；当前 V49 迁移不会自动回退或重跑它。

**目标：**

- 固定 `screen-settings` 的能力供应商总览和三个 `screen-*` 独立配置页为“最终静态原型原文 + 外部 Bridge”，用它完成一次不需要用户参与的真实配置流程试跑。

**实施顺序：**

1. `StaticPrototypeSurface` 仅按需隔离当前 settings/provider 屏幕，保留原型设置页面与三项供应商页面，不改 HTML 文件。
2. 断开、删除旧 React 供应商总览/目录/配置页；`SettingsPage` 只保留路由状态和对既有非供应商设置项的承接。
3. Bridge 回接真实 profile、密钥状态、目录预填、密钥保存、profile 保存和受限外链；原型已有费用筛选由原型脚本处理。
4. 覆盖总览状态、三项路由、手填字段保护、保存、外链、错误校验与非供应商设置回退；然后执行 Electron 路径、构建和独立审查。

**本轮扩展（2026-08-05，实施中）：**

- 文本语义分析页的连通性状态以 `design/open-design/v2026-08-05-provider-connectivity-deepseek-candidate/` 的新增静态源和迁移卡为基线；除右侧默认方案、测试中/成功/失败和保存默认节点外，左侧必须含原型原生 DeepSeek 预填候选。ASR、视频理解复核与设置总览继续使用 Version 48 源。
- 新增受限 DeepSeek 配置探测：只允许 `text-analysis + DeepSeek API`，由主进程在用户点击后使用当前草稿和临时或安全存储密钥发出最小无业务请求；测试不保存草稿或密钥，不改变其它能力默认方案，自动化只能走 E2E mock。

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

## Phase 16: 本地 OCR 可移植运行时与发布收口（历史实现记录；不在当前队列）

**目标：**

- 将本地 Paddle OCR 从开发虚拟环境依赖收口为 Windows 包内的相对路径运行时；候选包不含开发机路径、用户数据或凭据，且不改变任何 OCR 业务行为。

**实施顺序：**

1. 识别并隔离当前 `.venv` 中的解释器、依赖、模型、缓存、测试工具与开发机配置；不得继续把原始 `pyvenv.cfg` 或整套开发环境直接打入候选包。
2. 生成可携带的 OCR runner 运行目录，运行时只通过 `process.resourcesPath` 解析；保留开发环境覆盖变量仅用于开发调试，打包运行不得依赖它。
3. 为运行时路径解析与启动环境增加定向单元测试；包级脚本验证 runner、模型和 SQLite 原生绑定存在且 OCR 自检可运行。
4. 新建不可覆盖的 Windows 候选目录，执行 27 项 runner 测试、完整项目测试、类型检查、应用启动烟测和发布目录隐私扫描；失败立即停在发布前，不修改字幕功能或其它页面。

**当前进展（2026-08-08）：**

- 已生成 `release/ocr-portable-20260808-r3/win-unpacked` 验证包；本地 OCR runtime 为自包含 PyInstaller 目录，包内无 `.venv`、`pyvenv.cfg`、数据库、`tlog` 或开发机路径。runner 自检、29 项 runner 单元测试、类型检查和 6 项包级 DPI/长列表烟测通过。
- 该验证包不等同正式候选：当前 `pack:current` 仍受 Open Design 合同哈希不一致拦截，且全量 Vitest 有 4 项与本轮未触及的静态原型/媒体协议预期失败。修复或明确基线后，必须重新执行完整发布链，不得直接分发此验证包。

**验收标准：**

- 打包后 OCR 不读取 `C:\\Users\\ZIO`、`D:\\个人工作` 或本机 Python；无外部 Python/Paddle 安装时仍能启动 runner。
- 包内没有数据库、凭据值、素材、开发缓存、测试文件或开发机绝对路径；目录大小与运行时内容可解释。
- 本轮只触及本地 OCR 运行时、其定向测试、打包脚本与发布文件；OCR 识别算法、时间码、校准、字幕 UI、ASR、导入和供应商均保持不变。

## 独立工具：剪映字幕识别小工具（已交付，不属于主项目 Phase）

### 增量：剧目资产超短时长异常（2026-08-10）

1. 为 `episodes` 增加每集的提示忽略时间戳，并在旧数据库迁移中幂等补齐。
2. 在剧目读取、异常计数、IPC 和 preload 中传递该事实；忽略不变更媒体状态或路径。
3. 将提示绑定到既有剧目资产七列表的状态/操作单元，复用内层表格滚动，不新增页面或表格列。
4. 通过服务、页面、类型检查和构建验证：第 48 集 `1.40 秒`可提示、可忽略、重启后保持；非短片拒绝忽略。

## Phase 17: 字幕三链路收口（历史实现记录；不在当前队列）

**当前范围：** OCR 默认逐集机器选区、当前集人工覆盖与清除；腾讯 ASR 真实时间轴诊断；字幕批量导入映射核验；三轨切片时间质量门禁和实际 EXE 验收。

**已完成的本轮第一步（2026-08-10）：**

- 工具内第 44 集“仅 ASR”真实验收完成：腾讯服务返回 `ResultFormat=3`、`SentenceMaxLength=40` 的句级时间轴，75 秒素材生成 23 条 cue；该轨通过时间质量门禁。旧的粗粒度 ASR 轨归档保留且仍被自动切点阻断。

- 自动 OCR 不再要求先保存整剧区域。runner 在无人工区域时只读全画面预检，稳定证据不足即明确失败，不伪造区域或写入配置。
- 自动 OCR 模式忽略 `drama_default`，每集交给 runner 独立全画面探测；只有固定/人工模式才使用当前集覆盖或整剧基线，避免同剧不同剪辑位置共用旧框导致批量失败。
- 从字幕详情进入校准会保存当前集 `episode_override`；列表工具栏仍保存可选 `drama_default`。清除本集覆盖只删除该配置并恢复机器选择/剧目基线，不删除轨道或历史。
- 已通过 Python runner 38 项、OCR 服务与校准桥接 16 项、字幕运行桥接 31 项、TypeScript typecheck；新版 runner 只读复测确认第 77/82 集可在 300 秒上限内完成并已恢复写入，第 84 集自动区域模式在候选带确认后只读复测成功（61 cue、174.406 秒、自动区域约 65.5%–77.4%）。
- 已在实际 `v0.1.45` EXE 启动后完成生产 SQLite 的只读三源审计，详见 `docs/subtitle-time-axis-audit-2026-08-10.md`：第 2-30 集导入映射无重复、OCR 全覆盖；历史 ASR 的格式元数据与最低锚点密度均不合格，继续由切点门禁阻断。
- 字幕静态原型已有的“导入字幕”入口已接回真实本地批量导入：文件选择、按完整集号逐集预检、人工确认、同页列表刷新与既有 toast 均已闭环。已通过桥接、服务、原型隔离和列表运行时定向测试 `61/61`；取消、无匹配、解析失败、超时、同批同集歧义以及迟到重试均不会产生重复资产、轨道或 cue。原型迁移边界见 `docs/prototype-migration-card-subtitles-v48.md`。

**新增收口规则（2026-08-10）：**

6. 智能切点必须消费已通过时间质量门禁的字幕 cue：候选起点和终点均来自真实 cue 边界；若轨道没有可组成至少 3 秒候选的边界，预检阻断并说明原因，不得回退为固定步长候选。时间质量同时检查首段空档、内部空档和总覆盖率。
7. OCR runner 身份由主进程在新建、继续和仅重试失败项时重新获取并校验；渲染层传入的身份只作为提示，不能成为安全边界。身份不一致时保留旧批次，不续跑。
8. 字幕 Electron E2E 必须使用当前页面实际入口并覆盖导入、三列证据、播放定位、局部滚动、设置返回和删除；静态原型尺寸断言必须来自最终原型，不得保留过期的全屏弹窗假设。
9. 候选预检和实际生成必须共用已有候选的重合筛选，确保预计数量等于可实际生成数量；候选包的 packaged E2E 必须包含字幕真实映射用例。为 runner 身份的 IPC 覆盖保留主进程层回归，不以渲染层测试代替。

1. 先锁定当前实际 EXE、统一 SQLite 与备份，排除多版本窗口共用数据目录造成的错读；升级/迁移验证不丢密钥、字幕轨、历史批次和失败记录。
2. 腾讯 ASR 请求改用官方字幕格式 `ResTextFormat=3`，保留真实 `FinalSentence/StartMs/EndMs` 和分块偏移；以真实样本统计 cue 密度、覆盖和时间质量，不按标点或分块边界补造 cue。时间质量不达标时，切点门禁必须阻断其作为唯一锚点。
   - 活跃轨道缺少 `resultFormat=3` 时按历史/未验证结果处理；质量诊断至少包含有效 cue 数、平均/最大 cue 时长、时间覆盖率、最大间隔和来源元数据。
   - ASR 还必须满足按视频时长推导的最低锚点密度（每 20 秒至少一个有效 cue）；密度不足即标记为稀疏时间轴并阻断自动切点，不能误伤导入/OCR 或手动切片。
   - 导入/OCR/ASR 只要存在真实、有效且足够的时间 cue 即可作为候选生成证据；不得按来源设全剧硬优先级或指定单一默认切点轨。候选边界必须按语义事件和相邻时间窗自动裁决：同一事件 OCR 与 ASR 时间不同，采用 OCR 的画面时间作为切点、ASR 保留为声音证据；无画面字幕的对白可由合格 ASR 单独定锚；没有已定义裁决的真实时间冲突则排除该边界。无合格来源时预检必须返回具体原因。手动创建候选保持原有能力。
3. 对用户真实字幕目录先只读映射预览，再验证单集/批量导入、重复/歧义/取消/迟到请求和安全删除；不得影响其它集或原始文件。
4. OCR 继续采用“每集机器选择为默认、人工单集覆盖可选、清除后恢复机器选择”的优先级；补做失败类型、动态位置、副作用、旧结果隔离和只重跑失败项的实际验证。
   - 稀疏自动区域证据不足时，二次确认采样只在候选字幕带内使用 `0.3 fps`，保持稳定轨最低证据门槛不变；本机运行硬上限为 `420 秒`，超时仍不得写入半成品轨道。该上限只增加低速设备的等待余量，不改变识别算法、采样参数、结果写入和失败隔离。
   - 对“稀疏预检有文字但未形成候选带”的失败类型，允许一次受控 `0.3 fps` 全画面确认；确认必须形成稳定带后才可作为本集临时区域。超短片仅在总采样不超过 `10` 帧时允许最多两帧高亮候选与单帧 Paddle 证据，普通集数不降低稳定轨门槛。
   - 第 44 集自动模式已以约 `73 秒`识别 25 条对白并排除衣服数字/英文贴片；第 48 集自动模式约 `9 秒`识别“你师从何门”；第 47 集以 r8 在临时目录只读复跑 `23.6 秒`，确认未形成稳定硬字幕带并保持失败。验收证据见 `docs/subtitle-time-axis-audit-2026-08-10.md`；不得通过扩大机器区域伪造 OCR 轨。
   - “仅重试失败项”必须在原批次内将失败检查点置回 pending，保留原批次总数、已完成数和剩余失败数；不得用新批次遮住旧批次仍未解决的失败。
   - 单集检查点完成事件只更新当前行；仅最终 `finish` 状态可触发全量异步重读。必须以实际 EXE 验证迟到的 `running` 快照不会覆盖 `partial / failed / completed` 终态。
5. 完成三源独立展示、点击跳转和切点质量门禁后，才重建 runner、生成递增版本的新验证包并在实际 EXE 现场验收；正式候选仍需通过既有 Open Design 合同门禁。

**验证包记录（2026-08-10）：**

- 已生成不可覆盖的 `release/verification/v0.1.48-p1-internal-trial-visual-unverified/`。包清单记录应用版本 `0.1.48`、EXE SHA-256 `97fdec4ed3f33c94083cf0dec742b055edb38ac527507e400719bf35c9e95719`，并已复算一致。
- 以该目录内实际 EXE 执行的 Playwright 验收通过：100% / 125% / 150% DPI 无横向裁切、85 集列表可滚到末行、真实导入字幕保持独立来源列且删除不影响其它证据（7/7）。这些用例以应用窗口内可定位元素验证，不以固定桌面截图充当证据。
- `audit:fidelity` 当前仍报告 `completed=0, incomplete=94`，属于缺失跨页面 Version 48 视觉证据的既有发布门禁。因此本包只能用于功能验证，明确不得称为正式候选或生产发布物。

**边界：** 不把剪映独立工具、P2 解说/TTS/旁白、原始视频、未授权云端执行器纳入本 Phase；正式候选仍必须通过既有 Open Design 合同门禁。

**整批回归补充（2026-08-10）：**

- `v0.1.52` 验证包已在实际 EXE 中通过 8 项整批回归：三档 DPI、85 集滚动、真实导入、三源独立时间轴与逐条定位、证据区局部滚动、OCR 当前集覆盖保存/清除、导入轨删除隔离，以及关闭后重启的批次中断状态。
- 增加 `tests/e2e/subtitle-recognition-recovery.spec.ts`；它只在隔离数据目录写入可追溯的 ASR-only 运行检查点，重启后确认“已中断 / 工具已关闭或重启”跨页面不失真，不会触发云端或生产数据写入。
- `tests/e2e/subtitle-runtime-mapping.spec.ts` 现在以同一真实运行数据验证 ASR、导入、OCR 三列均可单独点击定位，且删除导入轨后 ASR/OCR 保持可用。打包回归入口 `tools/run-current-packaged-e2e.mjs` 已包含这两条字幕用例。
- 验收方法固定为：先收集一整条操作路径的缺陷，再按共享根因集中修复并跑整批 EXE 回归。视觉门禁仍独立：`audit:fidelity` 未完成前只能输出 `visual-unverified` 验证包。

---

## Phase 18: 原剧切片智能候选生成与证据治理（历史实现记录；不在当前队列）

**依赖：** Phase 17 已持久化且通过时间质量门禁的 OCR / ASR / 导入字幕资产；Phase 19 只消费本阶段发布的证据包、语义事件和候选快照，不在本阶段重复实现 `n:m` 时间轴裁决或精确 FFmpeg 导出。

**目标：** 将已存在的字幕、镜头/场景锚点和受限上下文整理为可复核的本地证据包，再以文本语义分析为必需前置、视频复核为按缺口触发的可选增强生成候选。模型只能选择已存在的事件/锚点 ID，程序负责解析和校验真实 PTS；任何缺证据、冲突未闭合或模型能力不可用的情况都必须阻断或降级说明，不能猜秒数、偷偷重跑字幕或把人工审片当自动能力兜底。

**交付内容：**

1. **建立版本化剧集证据包与资格门禁。** 绑定当前源视频指纹、可读性与 PTS、字幕轨来源/证据性质/质量结果、镜头与场景结构、允许的轻量邻集上下文，并建立原子证据单元和覆盖图；为证据记录 `A 主证据 / B 辅助证据 / C 冲突未闭合 / D 缺失不可用`，为候选记录 `qualified / qualified_with_limit / blocked`。不改写原始 cue、文本或时间码，证据版本变化只创建新轮次。
2. **实现受控的语义候选管线。** 在文本语义 profile 缺失、不可调用或结构化结果不合格时预检阻断；使用可变语义窗口和跨窗事件 ID，计算节拍完整性、起点/终点类型、上下文可用性、剪辑用途、时长偏离和叙事去重。模型只能返回 schema 校验过的事件/锚点 ID，最多进行一次结构化修复；视频复核只处理证明缺口的少量窗口，并把触发原因、范围、版本、耗时和结果写入快照。
3. **固化候选发布、任务一致性和数据边界。** 为每轮生成持久化唯一 `taskId`、证据包/配置/provider 快照和显式发布指针；实现重复点击去重、取消/重启、迟到响应拒绝、切集隔离、应用重启中断恢复、资源预算与排队。候选检查器只展示面向编辑的结构化摘要；外发材料、缓存清理、脱敏问题报告、迁移备份和离线样本验收均遵守 Product-Spec 的本地数据保护合同，P2 解说/TTS/旁白继续不可达。

**关键文件：**

- `src/main/db/schema.ts`、`src/main/db/migrate.ts`、`src/main/db/subtitle-evidence-schema.ts` — 新增证据包、原子证据单元、资格、候选快照、发布指针和反馈记录的幂等迁移；复用既有 `production_tasks` / `task_items`，不覆盖旧候选。
- `src/main/services/clip-evidence-package-service.ts` — 构建源媒体/字幕/场景/上下文证据包、覆盖图和 A/B/C/D 资格。
- `src/main/services/clip-candidate-intelligence-service.ts` — 语义分窗、事件地图、候选节拍/用途/上下文/去重/时长排序和结构化模型结果校验。
- `src/main/services/clip-generation-task-service.ts`、`src/main/services/clip-resource-budget-service.ts` — 生成轮次、发布权、取消恢复、排队、预算、迟到结果和中断状态。
- `src/main/services/clip-provider-boundary-service.ts`、`src/main/services/clip-candidate-snapshot-service.ts` — provider 外发边界、数据政策确认、配置继承、模型漂移和不可变快照。
- `src/main/services/original-clip-service.ts`、`src/shared/contracts.ts`、`src/main/ipc/production-ipc.ts`、`src/main/ipc/app-ipc.ts`、`src/preload/index.ts` — 接入预检、候选摘要、阻断理由和任务状态的最小 IPC 契约；不把技术证据等级或提示词暴露到首屏。
- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.ts`、`src/renderer/src/pages/DramaWorkspacePage.tsx`、`src/renderer/src/styles/prototype-interactions.css` — 在现有 Version 48/49 工作区中呈现候选资格、限制、阻断和恢复入口，不新增诊断孤岛页面。
- `tests/unit/clip-evidence-package*.test.ts`、`tests/unit/clip-candidate-intelligence*.test.ts`、`tests/unit/clip-generation-task*.test.ts`、`tests/e2e/phase18-candidate-governance.spec.ts`、`docs/clip-evidence-baseline/` — 独立真实样本、场景卡、任务一致性和 Electron 端到端证据。

**数据库对象：**

- `clip_evidence_packages` — 每集版本化证据包、源媒体指纹、上下文版本和构建状态。
- `clip_evidence_units`、`clip_evidence_qualifications` — 原子证据单元、覆盖范围、资格、规则版本和失败原因。
- `clip_candidate_snapshots`、`clip_candidate_publish_pointers` — 候选生成输入/配置/provider/规则快照及当前可发布轮次。
- `clip_model_runs`、`clip_candidate_feedback` — 结构化模型/视频复核调用记录、人工事实型反馈和离线评测引用；禁止保存密钥、完整提示词或整集原始请求。

**验收标准：**

- 只有已通过 Phase 17 时间质量门禁的持久化轨道、可验证 PTS 和合格结构锚点才能进入证据包；普通导入字幕保持 `reference_unknown`，不能单独驱动自动候选。
- 未配置或不可用的文本语义能力会在预检明确阻断，且不发起网络请求、不触发 OCR/ASR/导入重跑；视频复核只按证明缺口触发，失败时按规则阻断或标记受限，不伪造视觉结论。
- 模型输出只能引用当前快照中的事件/锚点 ID；未知 ID、任意秒数、跨集引用、边界不合法或一次修复仍失败均不生成候选。
- `qualified`、`qualified_with_limit`、`blocked`、真实任务失败四态在候选反馈和任务中心可区分；`blocked` 不进入候选池，且能说明事实、影响和下一步。
- 重复点击、并发生成、切集、取消、迟到回调、资产更新和重启恢复均不会覆盖当前发布指针、旧候选或旧证据；同一轮次的任务、模型调用、缓存和候选可按 ID 完整回链。
- 独立样本基线覆盖 OCR/ASR 对齐与冲突、导入未知来源、无字幕动作、高潮/反应/余韵、VFR、证据不足和 provider 不可用场景；硬门禁 100% 通过后才允许功能验证包。
- `pnpm test`、`pnpm run typecheck`、`pnpm run build`、相关 Electron E2E、`pnpm run validate:design-contract` 和独立 Stage 1/2 审查全部通过；`audit:fidelity` 未完成时仍只能标记 `visual-unverified`。

**2026-08-13 真实媒体治理场景卡合同：** 在不触发云端 ASR 或语义模型的前提下，允许针对冻结副本建立临时 SQLite，绑定当前 SHA-256、媒体指纹和可读 PTS，验证三类纯治理行为：① `dev-05` 的未开始、冻结任务只能按原配置恢复并领取唯一队列槽位；② `dev-06` 的部分成功摘要、blocked 数量和唯一恢复方向必须可持久化回读；③ `hidden-02` 的持久化源指纹与当前冻结媒体不一致时，发布/确认边界必须拒绝。场景状态使用临时任务、快照和资格夹具，仅验证生命周期与授权边界，不得称为真实语义候选、候选质量、OCR/ASR 裁决或导出成功。`hidden-01` 的跨窗口事件仍只能在最终独立验收中使用真实 OCR/ASR 或受控视觉事实输入，禁止用夹具替代。

**边界：** 本阶段不修改原始字幕 cue、不重新实现 Phase 19 的 `n:m` 对齐和精确导出、不新增 P2 入口、不把模型自由文本或人工审片作为切点来源。已有 Phase 19/20 代码在本阶段完成后需做兼容性审查，但不得借此宣称视觉门禁已通过。

**2026-08-14 供应商模型自动选型增量：** 普通用户只填写 API 密钥；对产品维护的目录方案，主进程在官方受限模型目录中发现可用模型，并按共享目录的能力兼容性与优先级自动选择。视频理解复核只可选择明确列为视频理解兼容的模型；没有兼容模型时保持 `controlled`，显示账号开通缺口和官方入口，不再要求用户猜测或填写模型 ID。发现结果必须脱敏、限量、隔离迟到响应，且发现/选型/保存失败不得覆盖既有 profile、密钥、证据包、候选或发布指针。高级自定义接入才允许显式模型覆盖；本轮仍不得上传完整剧集、字幕、候选或提示词进行配置验证。

**2026-08-14 Model Studio 保存边界加固（实施中）：** 所有主进程边界必须以统一的 Unicode 规范化供应商身份识别 Model Studio，并把变体名称规范化持久化为目录规范名；不得因零宽字符或空白变体绕过自动选型证明。模型发现只可向共享目录中逐项列出的官方 HTTPS 主机发送 Bearer 凭据，禁止区域子域泛配。新建临时密钥在发现成功但草稿失效时也必须删除；任何历史或当前 Model Studio 原始模型 ID 都不得返回 Renderer，而应显示稳定状态文案。此整改完成前，不得将既有 Stage 1 审查视为通过。

**同轮 legacy 兼容边界：** `text_semantics` 与 `video_understanding` 到达保存 IPC 时必须先映射为当前能力，再判断 Model Studio 身份并消费 proof；不得因旧能力名落回普通保存路径，也不得因此拒绝原本可迁移、可重新保存的目录配置。

**同轮主进程收口：** Bearer 主机 allowlist 必须从共享供应商目录的受控 Model Studio endpoint 派生，禁止服务层另存可漂移名单。新填写的 Model Studio API key 必须经主进程以短时 provisional record 原子保存；成功保存 profile 时在同一 SQLite 事务中认领并移除标记，失败、超时、窗口/Renderer 中断或删除 IPC 异常时由主进程定时及下次启动恢复清理，不能只依赖 Renderer 尽力删除。

**同轮密钥引用不可变边界：** Renderer 获得的 `secretRef` 仅是用于当前配置流程的非明文句柄，不能作为覆盖、删除或把其它供应商密钥带入 Model Studio 检测的授权。主进程必须拒绝对任何已被 `provider_profiles` 引用的密钥进行 `save` / provisional 覆盖或 `delete`；Model Studio 检测只可读取“当前能力已保存的 Model Studio profile”或“当前窗口新建且尚未认领的 provisional”密钥。所有拒绝均不得改写既有 profile、密钥记录、provisional 标记或候选数据，并以负向回归覆盖。

**同轮 provisional 作用域收口：** Renderer 明文草稿不得作为 Model Studio 检测入口；先由主进程创建 provisional，再只以引用检测。每个 provisional 必须持久化绑定 `text-analysis` 或 `multimodal-review`、创建窗口身份和绝对到期时间；检测前同步验证三项，任何跨能力、跨窗口、过期或历史无归属记录均在读取密钥或建立网络请求前拒绝。迁移中的旧 provisional 无法安全推断归属，只可等待/执行清理，绝不赋权或复用。

**同轮 proof 消费收口：** 发现产生的一次性选型 token 也必须绑定创建窗口身份；保存 IPC 以实际 `event.sender.id` 消费 token，并在任何密钥读取、哈希比对或 profile 写入前拒绝跨窗口 token。该身份只在主进程持有，Renderer 不提交或覆盖它。

**同轮 ASR 目录收口：** `asr` 的 Model Studio 目录卡同样不得把 `paraformer-v2` 等原始模型 ID 放入 Renderer 草稿、保存普通路径或能力状态。它与文本/视频复核共用主进程发现、能力/密钥/窗口绑定 proof 与自动模型选择；本轮不因此启用新的百炼 ASR 执行器。现有腾讯 ASR ResultFormat=3 执行链路不变。

**同轮 ASR 自动检测入口：** ASR 页选中 Model Studio 后必须出现与文本/视频复核一致的“检测并自动选择”入口，调用同一主进程发现服务并只展示稳定标签/固定失败类别；检测只读取受限模型目录，绝不创建字幕识别任务或启用新的百炼 ASR 执行器。腾讯云专用签名检测仍只在腾讯云草稿中出现，两个入口按供应商互斥显示。

**同轮 ASR 提示与目录真实性收口：** Model Studio 自动选择未找到兼容模型时，失败提示必须按当前能力准确说明为 `ASR 字幕识别`、`文本语义分析` 或 `视频理解复核`，不得将 ASR 错报为视频理解；失败必须继续保持旧 profile 与密钥引用不变。腾讯云 ASR 目录卡必须如实说明已支持 SecretId/SecretKey 的安全保存和最小签名连通性检测，但不支持上传媒体或直接创建实际字幕识别任务；“不适用”只针对希望立即创建识别任务的场景。上述文案与测试必须同步，避免目录承诺和运行时能力脱节。

**2026-08-14 本轮提示/目录整改结果：** 已改为从共享能力标签表生成 Model Studio 无兼容模型提示，并补 ASR 失败不保存 profile、也不删除既有密钥引用的 Renderer 回归；腾讯云 ASR 目录与 Electron 页面均明确“最小签名检测，不上传媒体、不创建识别任务”。定向单测 2 文件 / 27 测试、定向 Electron 6 测试、全量单测 106 文件 / 610 测试、typecheck、build、design contract 和全量 Electron E2E（17 passed / 8 skipped）已通过。`audit:fidelity` 仍为 `completed=0, incomplete=94`，本轮及 Phase 18–20 继续只可标记 `visual-unverified`；新的独立 Stage 1/2 审查仍待完成。

**2026-08-14 Stage 1 追加整改：** 检测入口及保存入口都必须使用同一完整能力标签，不能只在保存 toast 修正而将检测结果降级成“字幕识别”或“视频理解”。ASR 任意目录供应商切换后也必须统一刷新两类检测节点：仅 Model Studio 显示“检测并自动选择”，仅腾讯云显示签名检测，切换后的旧入口不得残留成可见死按钮；必须补三能力无兼容模型和 Model Studio → 腾讯云 → Model Studio 的互斥回归。

**2026-08-14 Stage 1 追加整改结果：** 检测面改为直接使用 `PROVIDER_CAPABILITY_LABELS`；ASR 节点创建会分别补齐按钮和面板，供应商切换同时重绘两类检测面。为抵抗既有原型 CSS 覆盖 `[hidden]`，ASR/视频复核的非活动检测节点使用显式 `display:none`，文本页因与 DeepSeek 共用节点不保留 inline display 覆盖。Renderer 三能力失败文案、ASR 供应商往返切换及 Electron 真正的 Model Studio → 腾讯云 → Model Studio 可见性路径均已回归。全量单测 106 文件 / 612 测试、typecheck、build、设计合同和全量 Electron E2E（17 passed / 8 skipped）通过；`audit:fidelity` 仍为 `completed=0, incomplete=94`。修复后须重新开始独立 Stage 1 审查。

**2026-08-14 Model Studio 配置审查闭环：** 新的独立 Stage 1 与 Stage 2 均为 HIGH=0、MEDIUM=0。审查确认检测/保存都使用同一能力标签、ASR 供应商往返切换互斥、腾讯目录/签名检测边界真实、原始模型 ID 未进入 Renderer，且 token/provisional/官方 endpoint 边界未回归。该闭环只覆盖配置和最小连通性状态；不代替真实文本语义候选、帧级复核、视觉保真或 Phase 17–20 的完成验收。

**同轮目录策略隔离：** 原始 Model Studio 模型 ID、优先级与兼容性选择器仅存在于主进程模块；共享 Renderer 目录只包含安全展示标签与 endpoint。`providers:list` 必须按内部自动选型来源标记返回“已自动选择兼容模型”或“等待自动选择”，绝不返回内部来源标记或原始模型 ID。

**2026-08-12 审查整改范围：** 本地整改已覆盖：① 基于真实 PTS、轨道来源/质量/版本及音频、视觉、环境覆盖关系的不可变证据包，且 A/B/C/D 不由“存在 cue”推断；② 文本语义事件地图、节拍/用途/上下文/核心事件校验和 `qualified` / `qualified_with_limit` / `blocked` 收束；③ 仅对必要证明缺口派生局部帧/片段的 `multimodal-review` 复核及一次受控重试；④ 以剧集、源指纹、证据包、配置、profile 和输入清单为键的任务去重、单调轮次、完整轮次原子发布和迟到结果拒绝；⑤ 向既有工作区/任务反馈暴露真实任务 ID、阶段、耗时和取消入口，不新增设计孤岛。独立 Stage 1/2 已通过；Phase 18 仍不得标记完成，直至真实 6+2 证据样本与视觉门禁完成。Phase 19/20 继续仅为 `visual-unverified` 集成验证状态。

**2026-08-12 Stage 1 第六轮回归：** 语义窗口、视觉事实 claim 作用域、`pending` 去重与检查点 ETA 已获静态复核；但审查仍确认两项可本地修复缺口：① 重开 Version 49 工作区时，必须按当前分集回读最近原剧切片任务的已持久化 blocked 摘要与唯一恢复入口；② 到达目标时间后只能进入一次有限延期，延期届满必须暂停并要求继续/停止决策，不能只写入 ETA 字段后无限运行。真实 6+2 样本指纹仍依赖用户提供的隔离媒体，继续保持硬失败和 Phase 18 实施中状态。

**2026-08-12 第六轮整改结果：** 工作区刷新现在同时读取任务中心列表，以 `generation.episodeIds` 将当前分集匹配到最近 `original_clip` checkpoint，回显已持久化 blocked 摘要和唯一素材/字幕恢复入口；达到阶段 ETA 时服务端暂停任务并发出一次继续/停止决策，工作区提供对应操作。全量验证：`pnpm test` 93 文件/532 测试通过、typecheck/build/design contract/Electron E2E（15 passed, 8 skipped）通过、`git diff --check` 通过。Phase 18 仍不可完成：`verify:clip-evidence-baseline` 因 8 个真实样本 SHA-256 未登记失败；`audit:fidelity` 仍 `completed=0, incomplete=94`。不得称为正式候选或发布。

**2026-08-12 Stage 1 第八轮整改：** 独立复审确认重开工作区的 blocked 回读已满足，但发现“继续”没有服务端次数上限。现已将唯一有限延期设为硬约束：`extensionGranted` 后拒绝再次继续；延期期限到达时服务端自动取消任务并保留检查点。仍需重跑独立审查；真实 6+2 样本和视觉保真门禁保持外部未验收状态。

**2026-08-12 延期重启收束：** 唯一延期的截止时间现在是 checkpoint 持久化事实而非仅内存定时器：应用启动会先取消已经到期的延期任务；仍未到期的持久队列任务在重新领取 provider 槽位时按原截止时间恢复自动收束。这样重启不能绕过一次延期上限或延长期限。

**2026-08-12 Stage 1 第十轮整改：** 复审发现续跑初始化会覆盖 `extensionGranted`，并且阶段 ETA 与延期截止共用 timer 槽位。已修正为：续跑重建 checkpoint 时保留延期标记与原截止；阶段 ETA / 延期截止各自独立计时。故进度写入不能取消唯一延期的硬截止，也不能让第二次决策遗漏已使用延期。

**2026-08-12 延期状态机补充：** 进入唯一延期后，所有后续进度 checkpoint 保留其标记和原截止，并停止创建新的阶段 ETA 决策 timer；同意延期时主动清除旧阶段 timer。因此旧 ETA 不会在延期中覆盖状态或再次发出继续决策。

**2026-08-12 Stage 1 第十一轮整改：** 应用启动的通用中断标记会先把运行任务置为 `interrupted`，故到期收束已覆盖该状态；原剧智能候选的任务中心通用“继续”路径已拒绝，避免绕过工作区的专用继续/停止期限决策。

**2026-08-12 Stage 1 第十二轮整改：** 复审发现通用 `tasks:recover` 仍能让原剧切片进入 `TaskQueue.recover`，与已拒绝的 `tasks:resume` 形成绕过。现将原剧切片的通用恢复同样拒绝，任务中心隐藏原剧切片的通用继续/恢复操作，仅保留工作区专用期限决策；修复后必须从 Stage 1 重审。

**2026-08-12 Stage 1 第十三轮整改：** 复审发现阶段 ETA 后的 `awaiting-decision` 虽记录截止时间，但没有到期收束，重启也只处理已授予延期的任务。现将决策窗口同样纳入计时器、启动收束与服务端截止校验：超时自动取消、保留检查点，迟到 continue / stop 不再可改变任务状态；修复后必须重新 Stage 1 审查。

**2026-08-12 Stage 1 第十四轮整改：** 复审发现重开工作区的任务回读错误地用 blocked 文案筛选 `awaiting-decision`，使正常 ETA 决策入口不可达。现分离 blocked 摘要与决策任务查询，始终优先恢复当前分集最近的专用期限决策按钮，并补工作区重开回归；修复后必须重新 Stage 1 审查。

**2026-08-12 Phase 18 本轮审查与回归：** 独立 Stage 1、Stage 2 均无 HIGH/MEDIUM；决策窗口在线到期、重启前未到期后的重新挂载、重启后已到期收束、迟到决策拒绝、单次延期与工作区重开入口均有服务/工作区回归。`pnpm test` 93 文件 / 538 测试、typecheck、build、design contract、Electron E2E（15 passed / 8 skipped）和 `git diff --check` 通过。本阶段仍为实施中：真实证据基线仍缺 dev-01~06 与 hidden-01~02 的 SHA-256，`verify:clip-evidence-baseline` 硬失败；`audit:fidelity` 仍为 `completed=0, incomplete=94`，Phase 19/20 只能继续标注 `visual-unverified`，不得称为正式候选或发布。

**2026-08-12 18→19 集成整改：** 生成轮次必须在入队前冻结并持久化分集证据包 ID、源指纹和候选输入快照；同一任务的预检、排队恢复、模型请求和候选落库只读取该冻结包，禁止再次从活动字幕轨裁决语义事件或重建证据。确认、0.1 秒受限微调和所有导出/重试入口都必须由服务端验证当前发布成员、快照资格及源指纹；无发布成员的自动候选、`blocked` 快照、指纹漂移和越出冻结范围的修改一律拒绝。历史手动候选仅在不伪装为自动生成时保持兼容。本整改完成前，Phase 18 仍实施中，Phase 19/20 仍为 `visual-unverified`。

**2026-08-12 18→19 提交时授权收束：** 导出开始时的授权并不覆盖 FFmpeg 执行期间发生的发布指针、快照资格或源媒体指纹变化。现规定在登记 `exported` 状态和 `generated_materials` 的同一 SQLite 事务内再次执行发布授权校验；提交失败则不登记成果，并删除本次刚生成的唯一输出文件。自动候选生成只允许经 `startIntelligentGeneration` 创建带 `requestedPackages` 的任务，旧锚点入口永久拒绝，内部执行函数不再公开。

**2026-08-12 延期回归补测：** 新增服务回归覆盖“先写 interrupted 再启动时收束过期延期”为 `cancelled`，以及已使用 `extensionGranted` 的第二次 continue 被拒绝；不再只依赖静态审查结论。

**2026-08-12 Stage 1 复审增补：** 视频复核成功只能新建带运行 ID、PTS、帧哈希、字节数、审阅范围和被证明事实的受限 A 级 `multimodal-visual-fact` 单元；不得把原 B 级场景结构锚点直接抬升。候选只有在其具体关键视觉 claim 被该 A 级事实覆盖后才能进入 `qualified` 或 `qualified_with_limit`。持久化 `pending` 任务必须在应用重启后仅恢复尚未开始的队列首项，运行中的模型请求仍明确中断；预检和队列 checkpoint 必须给出槽位、请求/派生量、保守 ETA 与等待原因。无论本轮是否已有可发布候选，所有 `blocked` 的数量、事实缺口和唯一恢复方向都必须保存在任务 checkpoint，供既有任务中心和工作区回看。

**2026-08-12 第三轮复审整改：** 语义窗口不得读取候选目标时长或固定时长切断事件；当前实现以连续原子单元与前后完整保护单元提交受限事件地图，候选数量/时长只在结果回到冻结 PTS 锚点后筛选。视频复核响应必须声明它实际支持的关键结论类别，A 级视觉事实只覆盖同范围、同结论类别的 claim，并使用独立事实 ID，原场景锚点保持 B。活动任务去重覆盖 `running/pending`；运行 checkpoint 需保守呈现剩余、目标完成及有限延期截止时间。独立样本基线、场景卡和任务治理回归必须继续扩充；在独立 Stage 1/2 无 HIGH/MEDIUM 前仍不得标记完成。

---

**Phase 18 本轮增量（2026-08-12）：** 语义窗口已改为由冻结语义事件的自然连续块和已验证场景转场决定，不再固定为两个单元，也不读取候选时长或数量；接缝不清仍至多带入前后各一个完整保护单元并只重试一次。补充的工作区回归确保部分成功仍展示 blocked 摘要和唯一恢复入口。新增 `docs/clip-evidence-baseline/manifest.v1.json` 及 `pnpm run verify:clip-evidence-baseline`，强制校验 6 集公开 + 2 集隐藏验收集的隔离路径和 SHA-256；真实媒体与指纹尚未提供时该命令预期失败，CLIP-032 因此仍未验收，Phase 18 保持实施中。

## Phase 19: 原剧切片多源语义对齐与精确导出（历史实现记录；不在当前队列）

> **归档说明：** 本 Phase 的 `visual-unverified`、验证要求和任何“待复核”均为历史状态，不创建当前待办，也不要求回退或重跑 Phase 18 / SUP-011。当前只按本计划顶部的 V49 全产品迁移、合同替换和用户决定的视觉验收顺序推进。

**依赖：** Phase 17 的合格字幕资产与 Phase 18 已发布的证据包/候选快照；本阶段只负责多源时间裁决、锚点复核和精确导出。

**目标：** 按 `Product-Spec.md` 的 CLIP-009/010/011 让自动切点只使用真实、质量合格且可回链的字幕或镜头/场景边界；用可追溯的逐事件裁决消除“全剧单轨优先级”；并让正式导出实际守住确认的画面边界。

**实施顺序：**

1. 在不改写 `subtitle_tracks`、原始 cue 文本或其起止时间的前提下，增加派生的语义事件关联和边界裁决记录。每条记录必须能回指所有参与 cue、来源、规则版本、裁决结果与拒绝原因；迁移必须幂等，旧数据未重新分析前保持可读但不得伪称已经对齐。
2. 新建纯领域服务，按时间重叠/相邻间隔、去标点空白后的文本相似度和连续性计算 OCR/ASR 的 `n:m` 事件对齐。相邻断句、换行、敏感词替换以及仅一侧存在的时段都必须有确定性结果；不能可靠裁决的时间冲突只产出拒绝理由，不偷偷合并、平移或交给人工兜底。
3. 将原剧切片候选生成切换为读取这些派生裁决：对白/画面文字候选端点只能是合格 cue 的真实边界；没有合格字幕端点的动作、情绪、视觉揭示或叙事环境候选只能读取已持久化、源媒体验证、可回链的镜头/场景转场锚点。场景锚点必须记录验证时的源媒体指纹并在生成前与当前分集重新比对，分集重关联或文件变更即失效。两类锚点均不得由模型临时给秒数；剧情、画面、音频分析只允许给已锚定候选排序和写依据，不能创建或移动边界。OCR 与 ASR 同义但时间不同以 OCR 视觉时间切点；ASR-only 对白仍可定锚；没有合格端点必须在预检阻断。
4. 将原剧切片的正式导出默认改为精确模式：在输入后定位并重编码视频/音频，禁止以输入前 `-ss` 加 `-c copy` 作为正式候选的“精确”输出。流复制只能是显式标记的预览/草稿模式；导出后 probe 校验时长、PTS/首尾边界与任务实际范围，不符即失败且不登记成果。
5. 先完成单元、迁移、服务、IPC 契约与真实最小媒体回归；再在隔离数据目录跑候选生成与 FFmpeg 输出边界验收。所有验收须覆盖：`n:m` 对齐、标点/换行、敏感词替换、OCR/ASR 同义但时间不同、OCR-only、ASR-only、真实不兼容冲突、无合格时间轴阻断，以及导出首尾帧精度。P2 解说/TTS/旁白继续不可达。

**关键文件：**

- `src/main/db/schema.ts`、`src/main/db/migrate.ts`、`src/main/db/subtitle-evidence-schema.ts` — 派生关联、裁决证据与可逆迁移。
- `src/main/services/semantic-event-alignment-service.ts` 及其测试 — `n:m` 对齐、规则版本和拒绝理由。
- `src/main/services/original-clip-service.ts` 及其测试 — 候选门禁、裁决消费、精确 FFmpeg 导出和输出验证。
- `src/shared/contracts.ts`、受限 IPC/preload — 仅在现有原剧切片闭环需要展示裁决/阻断理由时传递最小字段，不重做字幕或原剧切片原型结构。

**完成标准：**

- 不再存在“导入 > OCR > ASR”的候选生成硬优先级；每个自动候选均可回溯到其具体 cue、语义事件和裁决，或回溯到同集、同源媒体已验证的镜头/场景转场锚点。
- 人工确认仍是导出的唯一授权；人工微调只调整已生成候选前后少量帧，不替代缺失证据或冲突裁决。
- 正式输出可用自动化媒体探测证明其首尾落在已确认范围；无法证明时不得登记为成功成果。
- `pnpm typecheck`、完整单元/集成回归、真实最小媒体 FFmpeg 验收、打包路径回归和独立 Stage 1/2 审查均通过后，才能更新本节为完成。

**2026-08-13 真实导出边界场景卡合同：** 新增显式开关的隔离验收，仅使用 Baseline v1 的公开 `dev-06` 只读副本和临时 SQLite/输出目录，创建不伪装为自动生成的手动候选，调用当前导出服务实际 FFmpeg/ffprobe，验证输出文件可读、登记时长与请求范围一致、源文件指纹保持不变、任务/导出批次/生成素材均只写临时库，结束后删除输出和临时库。该场景只证明 Phase 19 的真实媒体导出/边界验证链路，不证明 OCR/ASR、自动候选资格、语义裁决或视觉门禁。

## Phase 20: Version 49 原剧切片监视器与轻量审片（历史局部实现记录；不代表全产品 V49 迁移）

> **归档说明：** 本 Phase 只记录此前针对原剧切片的局部 V49 实现和验证。下列交付、命令、证据与 `visual-unverified` 状态不构成当前全产品 V49 迁移、合同或发布门禁；尤其旧 `validate:design-contract` 与 `audit:fidelity` 只可作 Version 48 历史诊断，不能执行或引用为 V49 验收。全产品 V49 迁移仍按本计划顶部的固定顺序独立开始。

**依赖：** Phase 19 的候选快照、质量门禁与精确导出闭环；`Product-Spec.md` 的 CLIP-008、CLIP-045；`docs/prototype-migration-card-original-clip-v49.md` 所指向的 Version 49 `screen-clip` 静态源。

**交付内容：**

1. 将当前原剧切片工作区的媒体会话收敛为“当前源分集唯一播放源”：源时间线使用真实 PTS，候选时间线仅显示相对位置；切换候选暂停并定位到入点，切换分集、缺媒体、加载或定位失败时原子停止并解绑旧画面、音频、播放头和字幕高亮。
2. 在既有监视器、双时间线与候选检查器内接入 Version 49 的单行 transport、审阅范围组和四个边界微调按钮：支持静音/音量、0.5×/1×/1.5×/2×、源片/当前候选/前后审阅，以及每次 0.1 秒的入点前移、入点后移、出点前移、出点后移；播放和粗定位绝不修改候选范围。
3. 建立受限键盘与时间线会话交互：工作台焦点内 `Space` 播放/暂停，候选时间线焦点内左右键每次定位 1 秒；输入框、模态、抽屉和非工作台焦点不响应。点击或拖动任一时间线必须暂停并定位，且不抢夺用户手动证据选择、列表滚动或候选持久化状态。
4. 为源片播放至结束、候选到出点默认停止、显式循环、前后审阅的 ±1 秒边界、0.1 秒最短片段、源时长封顶、媒体切换竞态和无横向溢出补齐组件/Electron 回归；继续禁止帧号、帧级步进、波形、常驻音轨、多轨时间线，以及 P2 解说/TTS/旁白的任何可达面。

**关键文件：**

- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.ts` — 原剧切片会话状态、真实分集/候选绑定、播放和边界修改桥接。
- `src/renderer/src/pages/DramaWorkspacePage.tsx` — 将 Version 49 的监视器、双时间线和检查器控件嵌入既有剧目工作区，不新增孤岛路由或页面壳。
- `src/renderer/src/styles/prototype-interactions.css` — 复用 Version 49 的 transport、审阅范围组、微调按钮、焦点和双视口布局 token。
- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.test.ts` — 媒体解绑、候选/分集切换、审阅范围、速度、键盘作用域和边界约束回归。
- `tests/e2e/original-clip-monitor-review.spec.ts` — 以真实 Electron 媒体会话验证 1440×900 与 1280×720 的播放、审阅、切换、缺媒体和无横向溢出。
- `docs/prototype-migration-card-original-clip-v49.md`、`docs/prototype-gap-register.md` — 固化 Version 49 源、允许差异、状态映射及双视口证据，不将静态演示数据视为运行时完成证据。

**验收标准：**

- 当前源分集、监视器、源 PTS、候选相对时间线与检查器始终一致；任何切换或媒体失败均不会遗留上一集的画面、声音、时间码或字幕状态。
- 源片可播放至结束；候选审阅在出点停止，前后审阅严格在 `max(0, in-1)` 到 `min(duration, out+1)` 内停止，仅显式循环才返回起点；四个微调始终保持 `0 ≤ in < out ≤ sourceDuration` 且最短 0.1 秒。
- 1440×900、1280×720 的真实 Electron 验证中，监视器、两条时间线和候选检查器同屏可用，无页面级横向溢出；P2 负向回归仍通过。
- 本阶段不升级 Electron/React/Playwright 或新增播放器依赖：现有锁定版本用于可复现回归；依赖升级须另立评估并重新验证 Electron 原生模块与目录包。
- **历史验证记录：** 当时运行过 `pnpm run typecheck`、完整测试、构建、相关 Electron E2E、`pnpm run validate:design-contract`、`pnpm run audit:fidelity` 与独立 Stage 1/2 审查；其中旧设计合同与视觉审计不得再作为当前 V49 验收命令或发布门禁。视觉证据缺失的历史结果仅为 `visual-unverified`，不构成正式候选或发布。

**完成证据（2026-08-11）：**

- Phase 19 已实现 n:m OCR/ASR 事件裁决、源指纹与真实源帧 PTS 场景锚点门禁、冲突时间窗硬阻断、候选事件/锚点可追溯持久化，以及正式 FFmpeg 重编码后的时长、输出 PTS 和源/输出首尾画面校验。场景锚点只在没有合格字幕事件的时间窗参与；任一不可裁决视觉冲突会同时阻断字幕和场景自动候选。
- Phase 20 已实现当前源分集唯一媒体会话、候选/分集切换原子解绑、缺媒体短路、审阅范围、显式循环、0.5×/1×/1.5×/2×、音量/静音、四个 0.1 秒微调及受限 Space/左右键操作。V49 Electron 截图输出：`test-results/e2e/phase8-original-clip-workf-aa342-irms-a-real-local-candidate/v49-clip-workspace-1440x900.png`、`.../v49-clip-workspace-1280x720.png`。
- 验证：`pnpm test` 为 90 文件 / 504 测试通过；`pnpm run typecheck`、`pnpm run build`、`pnpm run test:e2e`（15 通过、8 项受条件限制跳过）、`pnpm run validate:design-contract` 和 `git diff --check` 通过；独立复审 Stage 1/2 无 HIGH/MEDIUM。
- `pnpm run audit:fidelity` 如实为 `completed=0, incomplete=94`，原因是项目库逐状态视觉基线缺失。因此两阶段只标记 `visual-unverified`，当前开发树 `0.1.52` 不是正式候选，未打包、提交、推送、部署或发布。

**2026-08-12 当前树隔离包：** 为避免把本轮 Phase 17–20 整改误验为旧 EXE，当前开发树递增至 `0.1.53`，仅生成不可覆盖的 `verification-only` 包，并使用新建隔离用户数据目录运行包级回归。该版本号不是正式候选或发布标记；真实 6+2 媒体 SHA-256 与 `audit:fidelity` 的 94 项视觉基线仍为硬缺口，故 Phase 17 继续进行中、Phase 18 继续实施中、Phase 19/20 继续为 `visual-unverified`。

**2026-08-12 当前树隔离包结果：** `release/verification/v0.1.53-p1-internal-trial-visual-unverified/` 已生成并核验 manifest 的 EXE / `app.asar` 哈希（分别为 `088d53c4861c34ed103a28fa615648eef5d4a918518983fdefcc4bb71f566cf2` / `bf74b1be2c34b8799f814f64d643166f06a6c8304e2078e819f22789f75a9cae`）。直接运行该 EXE 的包级回归为 8/8 通过：三档 DPI、85 集滚动、三源字幕映射和批次重启恢复；测试均使用临时隔离数据目录。manifest 仍明确标为 `verification-only`、`notFormalCandidate: true`、`visualFidelity: incomplete`，不改变任何真实媒体或视觉门禁结论。

**2026-08-12 当前树全量回归：** `pnpm test` 93 文件 / 539 测试通过；`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract`、`git diff --check` 通过；完整 Electron E2E 为 15 passed / 8 skipped / 0 failed。`pnpm run verify:clip-evidence-baseline` 仍因 `dev-01` 至 `dev-06`、`hidden-01` 至 `hidden-02` 的 SHA-256 未登记而失败；`pnpm run audit:fidelity` 仍为 `completed=0, incomplete=94`。两项失败是未提供真实验收输入的事实，未以代码、旧包或演示数据掩盖。

**待执行的真实源片负向验收（2026-08-12）：** 历史“真实原剧切片”脚本仍依赖已关闭的手填秒数候选入口，不能证明当前 Phase 18 冻结证据闭环。现改为显式环境变量触发的只读实机试验：在新建临时 SQLite 与当前 verification EXE 中导入第 1–30 集真实源片及其 30 份 SRT，验证完整集号映射、三源记录的导入性质为 `reference_unknown`，并断言智能候选预检/启动均被阻断且输出目录没有 MP4。该试验仅证明“不可信导入不能越权为自动切点”，不把导入字幕伪装为 OCR/ASR，不替代 CLIP-032 的 6+2 冻结样本、真实 OCR/ASR 或视觉验收。

**2026-08-13 实机负向验收实现：** `tests/e2e/real-original-clip-trial.spec.ts` 已重写为上述只读 30 集试验，并补充正式智能生成入口的同步预检拒绝：没有合格分集时，任务不会先持久化再在后台失败。单元回归覆盖导入 `reference_unknown` 轨道被预检和正式入口共同拒绝且不创建任务/候选。原 `v0.1.53` 验证包早于这次整改，不可作为它的证据；当前树已递增为 `0.1.54`，并已用新建、不可覆盖的 verification EXE 执行。

**2026-08-13 实机负向验收结果：** 新建 `release/verification/v0.1.54-p1-internal-trial-visual-unverified/` 后，直接指定其 EXE（SHA-256 `1efd035340ab2be422c82ef2bc161b129fb27caf10b8cc51b59e76762b8b5785`；`app.asar` SHA-256 `5194b70e45c5a7ce6fbb8f0142cf845b6a392ece7f33ef3bb2d0818a2a5e374f`）运行真实试验通过，耗时 12.9 分钟。独立输出 `D:\个人工作\短剧AI切片工具\80_测试候选\phase17-20-real-import-blocked-20260813-r2\real-original-import-blocked-trial.json` 记录 30/30 集号映射、30/30 导入、全部导入轨为 `imported/reference_unknown`、预检可生成数 0、正式入口拒绝、候选数 0、MP4 输出数 0，以及只读源片和 SRT 的 SHA-256。该结果仍只证明不可信导入不能越权，不能替代 6+2 基线或视觉门禁。

`D:\个人工作\剪映字幕识别小工具\` 是可独立完成任务的 Windows 小工具，负责在用户已登录的剪映专业版中识别字幕并导出 SRT。它的代码、运行合同、锚点和实机证据均在独立目录维护，不与本 Electron 产品共享发布节奏。

当前不计划将它接入主产品。若用户后续明确决定集成，必须作为新的需求立项，单独定义调用契约、版本探测、前台控制权、失败隔离、用户授权、日志归属与端到端验收；在此之前不得增加主产品入口、IPC、任务、设置或发布声明。

**2026-08-13 生成门禁与生命周期复审：** 智能候选正式入口已在写入 `production_tasks` 前执行预检；`imported/reference_unknown` 导入字幕不得作为自动切点依据。真实 30 集导入隔离试验确认：30/30 映射和导入后均为 `imported/reference_unknown`，合格分集 0，未写入任务、候选或 MP4。生命周期职责已拆入 `clip-generation-lifecycle.ts`，保持 UUID 输入合同，取消/stop 清理阶段与延期计时器，重启过期延期与一次 continue 的到期均收束为取消。独立 Stage 1/2 审查无 HIGH/MEDIUM；`pnpm test` 95 files / 520 tests、`pnpm run rebuild:electron`、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract`、Electron E2E（15 passed / 8 skipped）和 `git diff --check` 均通过。真实 6+2 SHA-256 基线与逐状态视觉证据仍是硬缺口；本轮不得将 Phase 17–20 标为正式完成或发布，Phase 19/20 仍为 `visual-unverified`。

**2026-08-13 正式完成审计：** `docs/phase17-20-completion-audit-2026-08-13.md` 已按目标逐项列出当前可验证实现、证据来源和剩余验收项。用户授权的 6+2 真实媒体已复制到隔离目录并登记指纹，`pnpm run verify:clip-evidence-baseline` 已通过；场景卡/证据包/候选质量仍待逐集真实验收。`audit:fidelity` 仍为 `completed=0, incomplete=94`（91 项缺项目库或 Electron 证据，3 项现有配对超阈）。合同禁止拿本地 HTML 渲染、历史附件或当前 Electron 图替代 Open Design 项目库预览；视觉基线到位后必须按审计顺序重验。

**2026-08-13 6+2 基线指纹验收：** 用户授权的 44、2、47、84、77、6 集作为公开开发集，29、48 集作为隐藏验收集；只读副本位于 `D:/shortdrama-evidence-baseline/v1`，8 个实际 SHA-256 已登记。`pnpm run verify:clip-evidence-baseline` 输出 `CLIP_EVIDENCE_BASELINE_OK version=1 public=6 hidden=2`。该命令只证明隔离文件/路径/指纹完整，不能替代场景卡证据包和候选质量验收；Phase 18 继续实施中。

**2026-08-13 6+2 媒体证据包预检：** 显式环境变量的只读测试已按 `dev-01,dev-02`、`dev-03,hidden-02`、`dev-04,dev-05`、`dev-06,hidden-01` 四批在临时 SQLite 建包。8/8 均验证当前媒体指纹与可读视频 PTS，均为 `ready`，且每批 0 候选、0 导出、0 字幕轨、未接触生产库。测试不接受输出目录、也不生成报告文件，避免真实验收信息经路径或链接写入仓库。媒体可读性仅探测一帧真实 PTS；场景锚点继续要求完整帧表逐端点验证，不能借预检降低锚点门槛。此结果不等价于真实 OCR/ASR、场景卡、候选资格或导出边界验收；Phase 18 继续实施中，Phase 19/20 继续 `visual-unverified`。

**2026-08-13 真实 OCR 隔离接入：** 新增显式开关 `real-ocr-evidence-baseline.test.ts`，允许仅对 `dev-01`、`dev-02`、`dev-04` 在系统临时 SQLite 中重新执行本地 Paddle 自动选区；`dev-01` 已实跑通过（1 passed，111.82 秒），生成唯一一条 `generated/visual_aligned` OCR 轨和 `ready` 证据包，且为 0 `task_items`、0 `clip_export_batches`，退出后清理临时目录。测试会比对冻结媒体 SHA-256，并固定 Python/runner SHA-256；发现任何 OCR 环境变量即拒绝运行，不能被任意外部 runner 替换。它与媒体预检“0 字幕轨”不是同一测试。该试验未调用云端 ASR、不读取/输出密钥、不写生产库或源媒体；真实 ASR、跨轨裁决、候选资格和导出边界仍未验收，Phase 17/18 不得标记完成。

**2026-08-13 真实 OCR 三集复验：** 在上述冻结约束下，`dev-02` 已实跑 1 passed（241.78 秒），`dev-04` 已实跑 1 passed（164.45 秒）；二者均在临时 SQLite 中生成唯一 `generated/visual_aligned` OCR 轨与 `ready` 证据包，且均为 0 任务、0 导出并自动清理。Paddle 模型缓存固定到同一临时目录，结束时恢复环境并删除，避免写入公共或用户缓存。`dev-02` 仍不能声称完成 OCR/ASR 冲突场景，`dev-04` 仍不能声称完成视觉事实场景；两者各自等待真实 ASR 与受控视觉验收。

**2026-08-13 真实 OCR 清理断言：** SQLite 初始化、执行和关闭均由同一 `try/finally` 管理；隔离用例在结束时必须断言 `PADDLE_PDX_CACHE_HOME` 已恢复到进入前值、临时 SQLite/帧/模型缓存所在根目录已不存在；若关闭、清理或环境恢复失败，用例直接失败，不再仅靠实现阅读推断。

**2026-08-13 真实 ASR 预检边界：** Phase 17 的真实 ASR 场景只能由新建临时 SQLite 承载；Baseline v1 媒体 SHA-256 由 `verify:clip-evidence-baseline` 独立锁定。ASR 服务必须在 FFmpeg/ffprobe 提取、音频读取、创建腾讯任务或发出任何网络请求前确认“腾讯云 ASR profile + 已授权凭据”存在。无 profile、无凭据或无单独云端授权一律在本地阻断，且断言 0 字幕轨、0 任务、0 导出。历史 `live-asr-quality-sample.bundle.mjs --database <任意路径>` 不满足此边界，不得作为 Phase 17–20 验收入口。

**2026-08-13 真实 ASR 无授权预检实跑：** `real-asr-evidence-preflight.test.ts` 使用已登记 `dev-01` 基线条目和临时 SQLite 已通过（1 passed）。该用例不打开真实媒体内容；无 profile、腾讯 profile 无 `secretRef`、腾讯 profile 的凭据内容无效均在任何媒体提取之前拒绝，所有分支的 FFmpeg 调用数为 0、网络 `fetch` 调用数为 0，数据库为 0 字幕轨、0 `production_tasks`、0 导出，结束后断言临时根目录已删除。该绿色仅证明无授权不会外发或写入，不能替代真实 ASR、OCR/ASR 裁决或候选场景卡。

**2026-08-13 真实 ASR 已授权隔离入口与本地凭据阻断：** 新增 `tools/real-asr-evidence-baseline.ts`（由 `pnpm run build:real-asr-evidence` 生成 bundle），仅允许 `dev-01/dev-02`。入口先校验 Baseline v1 媒体 SHA-256，再以只读方式读取当前应用的腾讯 ASR profile 与**加密**凭据记录，复制到新建临时 SQLite；生产库、原始媒体、任务和导出均不写入。三个 OCR runtime 覆盖变量均在打开源库、创建临时库、读取媒体或网络调用前拒绝，且实际验证均返回退出码 1；Paddle 缓存和临时根目录均在 finally 恢复/删除。最终独立 Stage 1/2 审查无 HIGH/MEDIUM。正常实跑 `dev-01` 时，当前保存凭据在 `DefaultAsrSubtitleService` 的本地双凭据 schema 校验失败，因而未开始 FFmpeg/ffprobe、未读取音频、未创建腾讯任务、未发起网络请求。该事实不构成真实 ASR 验收完成；用户重新保存有效 `SecretId + SecretKey` 后，必须用同一入口完成 `dev-01/dev-02` 的 ResultFormat=3、OCR/ASR 对照和资格场景卡。

**2026-08-13 真实 ASR 凭据上下文修正：** 用户在 `v0.1.54` 验证 EXE 的腾讯云 ASR 页面完成了 271 ms 签名校验；这证明测试表单中的双凭据可用，不能据开发期 Electron 的解密失败断言用户未保存密钥。真实验收改为由同一打包 EXE 身份执行只读凭据预检，再将 profile 与加密记录映射到临时 SQLite。预检会在接触媒体和网络前分别验证来源库与隔离库的可解密版本化双凭据结构；若失败，仅报告加密上下文/格式状态。正式 `dev-01/dev-02` ASR 仍待该打包身份预检通过后执行，Phase 17/18 状态不变。

**2026-08-13 真实跨轨裁决收口要求：** 打包身份的真实 OCR+ASR 试验不得仅以两条轨道和 `ready` 证据包作为结束；必须调用生产使用的 `readAnchorReadiness`，让其持久化语义事件并排除未闭合冲突区间，再以不含字幕文本、音频、路径或数据库内容的摘要记录：语义事件数、冲突阻断区间数、冲突外可用锚点数和候选范围数。若场景卡期望冲突而实测为零，必须如实标为“未证明冲突”，不得将数目为零伪装成冲突场景通过；没有可用文本语义 provider 时，不得使用 fixture 冒充真实候选资格。

**2026-08-13 真实跨轨裁决实跑：** `v0.1.62` 打包身份对 `dev-01` 和 `dev-02` 的完整隔离链路均通过。`dev-01` 为 14 个语义事件、0 个未闭合冲突、14 个可用锚点和 14 个候选范围；`dev-02` 为 51 个语义事件、0 个未闭合冲突、51 个可用锚点和 44 个候选范围。两集均保持 `ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready` 和生产库写入 0。`dev-02` 因没有实测未闭合冲突，仍不能通过其 `ocr-asr-conflict` 场景卡；Phase 17 保持进行中，Phase 18 保持实施中，Phase 19/20 继续仅为 `visual-unverified`。

**2026-08-13 v0.1.62 包级回归：** 以该验证包实际 EXE 在新建隔离目录运行 9 项 Playwright：100%/125%/150% DPI、85 集末行滚动、三源字幕独立定位/删除隔离、字幕批次重启恢复和 Version 49 监视器候选审阅/微调/确认均通过。此项证明当前包未回退 Phase 17 与 Phase 20 的 UI/交互链路；`audit:fidelity` 仍为 `completed=0, incomplete=94`，不得称为正式视觉验收或发布。

**2026-08-13 Phase 18 真实语义请求收束：** `dev-02` 有 44 个冻结分析窗口但本轮只请求 1 条候选；provider 合同现明确接收应用持有的候选上限，并仍携带全部窗口与完整上下文。模型超过上限、漏掉必需事件、返回窗口外 ID、倒置边界或未闭合接缝仍只允许一次修复后阻断，绝不由应用截断或猜测。定向回归 11/11、typecheck 与差异检查已通过；下一步必须使用新的不可覆盖 verification EXE 重跑真实 `dev-02`，`ocr-asr-conflict` 和视觉门禁状态不因该请求形状调整而改变。

**2026-08-13 Phase 18 真实语义失败分类：** v0.1.70 的 `dev-02` 复验仍在严格结构合同处阻断，因此将验证摘要从泛化 `provider-response-invalid` 细分为仅含枚举的窗口、事件映射、时间顺序、跨窗连续性或候选数量子码。此类分类不采集或存储模型原文、字幕正文、密钥、音频、媒体路径或数据库内容；新包需实跑验证分类，而非猜测结构原因。

**2026-08-13 Phase 18 语义输出示例回归修复：** 数量上限接入时不得把完整 `selections` 对象示例替换为文字占位；v0.1.73 恢复完整字段示例，并在最外层继续声明 `candidateLimit` 与数组长度上限。冻结窗口、上下文、模型可见 ID 和服务端严格校验保持不变；需用不可覆盖的实际 EXE 重跑 `dev-02`，此前 v0.1.70–v0.1.72 的失败证据保持原样。

**2026-08-13 Phase 18 真实 `dev-02` 资格复验：** v0.1.73 verification EXE 在冻结 Baseline、当前 EXE 身份只读凭据和临时 SQLite 下完成 OCR 23、腾讯 ASR 51、ready 证据包与真实 DeepSeek 候选生成；得到 1 条 `qualified_with_limit`，blocked 为 0，生产库写入为 0，退出后没有临时语义目录或 OCR/FFmpeg 子进程。此项收口真实文本语义候选资格的同集复验；`ocr-asr-conflict` 场景卡仍因实测 0 未闭合冲突保持未通过，Version 48 视觉门禁仍为 `completed=0, incomplete=94`。

**2026-08-13 Phase 18 严格 JSON 合同复审：** 删除从任意自由文本截取 JSON 子串的兼容回退；文本语义只接受完整 JSON 或完整 Markdown JSON 代码块，前后夹带说明文本会受控阻断。新增该负向回归后，独立 Stage 1/2 复审均无 HIGH/MEDIUM；必须由升级后的 `v0.1.74` verification EXE 重跑冻结 `dev-02`，不得把 v0.1.73 的历史成功直接等同于更严格合同下的成功。

**2026-08-13 Phase 18 叙事事件映射合同收紧：** `v0.1.74` 对冻结 `dev-02` 的实跑在 `provider-response-invalid-event-map` 受控阻断。模型输出不能省略事件完整受限上下文：合同现明确一个事件只可对应一个 proposal，`sourceEvidenceIds` 必须原序完整包含 `contextBeforeIds`、`coreEvidenceIds`、`contextAfterIds`，候选仅可用同窗口 core IDs。定向 13/13、typecheck、差异检查及独立 Stage 1/2 均通过；须用 `v0.1.75` 新 verification EXE 重跑，旧失败摘要不可覆盖，视觉门禁及 `ocr-asr-conflict` 状态不变。

**2026-08-13 Phase 18 严格映射真实复验：** `v0.1.75` verification EXE 在相同冻结 `dev-02` 上通过：OCR 23、腾讯 ASR 51、`ready` 证据包、1 条 `qualified_with_limit`、0 blocked、0 生产库写入；退出后本轮无 OCR/FFmpeg 子进程。说明严格 JSON、完整事件上下文映射和候选数量合同可在真实 DeepSeek 调用中同时满足。该成功不把 `ocr-asr-conflict=0` 改写为冲突通过，亦不替代 `qualified`/视频复核、hidden-01 跨窗或 Version 48 `completed=0, incomplete=94` 视觉门禁。

**2026-08-13 Phase 18 真实 schema 失败诊断：** `dev-01` 同合同实跑仍为受控结构失败，原摘要不足以区分 schema 与窗口/事件/时间等条件。新增 `schema → provider-response-invalid-schema` 的脱敏 checkpoint/摘要映射，并以唯一 provider 标记的非法对象回归确认错误消息不含该标记；没有放宽 JSON、ID、资格或单次修复约束。定向 16/16、typecheck、差异检查通过；需用 `v0.1.76` verification EXE 重跑 `dev-01`，不覆盖 v0.1.75 的历史失败。

**2026-08-13 Phase 18 schema 错误脱敏修复：** 独立审查发现未知 schema 字段名可被 Zod issue 文本回显并进入失败持久化链路。现将所有 schema 失败归一为固定“输出不满足结构合同”原因，保留 `schema` 枚举分类而不保存未知字段名、字段值或 provider 原文。未知字段名为唯一标记的回归、定向 16/16、typecheck、差异检查及独立 Stage 1/2 均通过；`v0.1.76` 才能用于重跑真实 `dev-01`。

**2026-08-13 Phase 18 有限候选事件收束：** `v0.1.76` 的真实 `dev-01` 在 `provider-response-invalid-event-map` 受控结束，未泄露 provider 内容。为使“每集仅请求少量候选”与模型输出规模一致，合同明确只输出被 `selections` 引用的事件，禁止为未入选窗口返回额外事件；保留每个已选事件必须原序完整回链同一 proposal 的上下文与全部服务端校验。新回归、typecheck 和复审通过后由 `v0.1.77` 重跑；不改变视觉门禁和其他场景卡状态。

**2026-08-13 Phase 18 事件/核心边界硬化：** 服务端明确拒绝未被 selection 引用的额外事件；每个事件的 source/core 必须分别与一个 proposal 的完整窗口/core 原序精确相等；selection 的证据及起止只能来自其引用事件 core，不能借用前后 context，即使该 ID 恰好也是另一窗口 core。定向 19/19、typecheck、差异检查及独立 Stage 1/2 通过；`v0.1.77` 才能开始实际 `dev-01` 复验。

**2026-08-13 Phase 18 冻结窗口派生合同：** `v0.1.77` 的 `dev-01` 仍受控停在 `provider-response-invalid-event-map`，显示模型手写完整事件 ID 序列不可靠。新合同只允许模型以 `proposalId=window-N` 选择一个冻结窗口，应用精确派生该事件的 `core` 与 `before + core + after` 来源，严格 schema 拒绝旧的 provider-owned 证据字段；候选锚点继续只允许该事件 core。已覆盖不存在/重复窗口、重复事件、未选事件、context 借用、旧字段脱敏及 E2E 多窗口 candidateLimit。22 个定向测试、typecheck、差异检查与独立 Stage 1/2 通过。`v0.1.78` verification EXE 必须重跑冻结 `dev-01`，结果无论成功或受控失败均不可覆盖旧摘要；Phase 17–20 的视觉和其他真实场景缺口保持不变。

**2026-08-13 Phase 18 直接窗口选择合同：** `v0.1.78` 的 `dev-01` 仍为 `provider-response-invalid-event-map`，因此移除模型维护 `narrativeEvents.id ↔ selections.narrativeEventId` 的双向关联。`v0.1.79` 只接收每条 selection 直接给出的冻结 `proposalId` 和核心锚点；事件键、完整来源、core/context 与持久化映射全部由应用生成。保留 strict JSON、strict schema、候选数量、窗口/core、时间、连续性和资格门禁；顶层/内嵌旧事件字段、重复窗口和 context 借用均有负向测试。19 个定向测试、typecheck、差异检查与独立 Stage 1/2 通过。下一步仅能通过新 verification EXE 的隔离真实 `dev-01` 复跑验证，仍不可改写视觉或其他 Phase 缺口。

**2026-08-13 Phase 18 直接窗口选择真实复验：** `v0.1.80-p1-internal-trial-visual-unverified` 已对冻结 `dev-01` 完成隔离实跑并通过：OCR 25、ASR 23、证据包 `ready`、候选 1、`qualified_with_limit` 1、`blocked` 0、生产库写入 0；结果摘要为 `80_测试候选/phase17-20-real-semantic-20260813-v080-dev01/dev-01-v080-result.json`。EXE SHA-256 为 `1f2ee9f3f27fa4ac0aa6bd52e40da0ab17d9becd4edaa94c9204aa7fe75adfa4`，验收进程已退出。此项仅收口 `dev-01` 的真实文本语义候选资格链路；`dev-02` 未证明 OCR/ASR 冲突、真实 `qualified`/视频复核、hidden-01 跨窗和 Version 48 `audit:fidelity=completed=0, incomplete=94` 仍是未完成门禁，Phase 17–20 不能标记完成或发布。

**2026-08-14 Phase 18 视频复核 provider 打包身份预检：** `v0.1.81-p1-internal-trial-visual-unverified` 的显式最小探针在只读生产配置、临时 SQLite 下通过：仅复制 `multimodal-review` profile 与加密密钥记录，并向 Model Studio 请求模型列表；不读取媒体、字幕、候选或帧。摘要为 `80_测试候选/phase17-20-modelstudio-probe-20260814-v081/modelstudio-v081-result.json`，记录 `providerConfigured=true`、242 ms 和生产库写入 0；EXE SHA-256 为 `76fe2992fa57cf90b9d4b2722861d63d55054759040a70e5246d5adcaa9b5b68`。该项只解除“视频复核 provider 未连通”的前置风险；`visual-only-supported` 的受限帧级事实、真实 `qualified`、冲突/跨窗场景和 Version 48 视觉门禁仍未完成，不能标记 Phase 17–20 完成或发布。

**2026-08-14 Phase 18 视频复核 provider 修复后复验：** 独立 Stage 1 审查发现 v0.1.81 的失败摘要遗漏耗时和生产库写入数；修复为所有结果均输出固定状态、脱敏枚举、耗时和 `sourceDatabaseWrites=0`，并获 Stage 1/2 复审通过。`v0.1.82-p1-internal-trial-visual-unverified` 使用新 EXE 重跑不读取媒体的最小探针并通过：`providerConfigured=true`、251 ms、生产库写入 0，摘要为 `80_测试候选/phase17-20-modelstudio-probe-20260814-v082/modelstudio-v082-result.json`，验收进程和 OCR/FFmpeg 子进程均已退出；EXE SHA-256 `d418d5c9a7167815585da423924fdb89a00854af84d967a1cd52c674626b87dd`。此项只验证修复后的 provider 连通性合同；帧级视觉事实、真实 `qualified`、冲突/跨窗和 Version 48 视觉门禁仍未完成。

**2026-08-14 Phase 18 帧级 provider 能力验收：** 新入口严格只接受冻结 `dev-04`、绝对 manifest、登记 SHA-256 和中点附近最多 12 张 JPEG 帧；生产配置只读复制到临时 SQLite，外发仅含临时 UUID evidence ID 与 JPEG data URL，不能成为场景卡或候选资格。独立审查的 manifest 路径、外发内容和限定兼容重试问题均已收口：只有明确 `response_format` 拒绝的 HTTP 400 才允许一次不带该字段的重试，其他 400 不得重复发送帧。定向 4 文件 / 16 测试、typecheck、差异检查及独立复审通过。`v0.1.85` 的真实 `dev-04` 运行仍是脱敏 `provider-failed`（73,701 ms，生产库写入 0）；profile/endpoint/密钥引用存在，但当前模型不具视觉标识。下一步依赖用户在已授权 Model Studio 配置中选择并保存实际可用的视觉模型，然后用全新 verification EXE 和不可覆盖结果重跑；不得将当前失败解释为密钥丢失或写作 Phase 18/17–20 完成。

**2026-08-14 Phase 18 验收运行隔离整改计划：** 发现直接启动 verification EXE 时，当前已运行的历史 EXE 与其共享应用用户目录，导致命令行验收进程未生成结果摘要即退出。将仅为显式真实验收增加环境变量指定的**只读配置来源目录**：验收 EXE 自身仍以新建隔离用户目录启动，profile/密钥引用只读复制到临时 SQLite；不迁移或写入来源目录。完成后用公开 `dev-04` 的不可覆盖结果路径重跑。该项不授权 hidden-01 外发、不放宽视觉或候选资格门禁。

**2026-08-14 Phase 18 验收运行隔离整改实现：** 当前树版本递增为 `v0.1.86`；仅显式帧级视频验收必须同时使用 `SHORTDRAMA_REAL_EVIDENCE_USER_DATA` 作为本次隔离运行目录，并以 `SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA` 指向不同的绝对只读 profile/密钥引用来源，缺失、相对、相同、嵌套及 junction/symlink 别名目录均拒绝；实际调用仍先复制到临时 SQLite。此规则不扩展到尚未接入只读来源复制的其它真实验收 CLI。`packaged-real-multimodal-evidence` 和 OpenAI-compatible 适配器定向 2 文件 / 13 测试、typecheck、`git diff --check` 已通过。独立 Stage 1/2 与新包公开 `dev-04` 运行待完成；不可将此兼容性修复当作视觉事实或 hidden-01 授权。

**2026-08-14 Phase 18 安全存储上下文修正计划：** 受控隔离运行实际返回 `missing-key`，但不代表密钥不存在：Windows 加密记录仅能在既有 Electron 用户数据上下文解密，而更换 `userData` 会改变该上下文。整改收窄隔离边界为生产 SQLite 只读复制到临时 SQLite、临时目录清理和不可覆盖结果；帧级 CLI 显式绑定既有配置来源以维持安全存储身份，不再创建替代 Electron 用户数据目录。保留所有公开样本/最小外发限制，且不扩展到 hidden-01。

**2026-08-14 Phase 18 安全存储上下文修正实现：** 当前树递增为 `v0.1.87`，移除 `v0.1.86` 的 Electron `userData` 替换；帧级 CLI 在原打包身份内只读现有配置库（或仅接受绝对来源覆盖），随后仍复制到临时 SQLite 后调用。`v0.1.86` 的 `missing-key` 仅记录为隔离方式不兼容 Windows 安全存储的诊断，不代表配置不存在。新的定向测试、独立复审和 verification-only 重跑待执行。

**2026-08-14 verification-only OCR runtime 复用计划：** 当前 D 盘空间不足以完整重建 OCR runtime；因 v0.1.87 只修改了帧级验收的主进程安全存储路径，不涉及 OCR runner，允许在打包前对当前 runtime 与最近成功的 v0.1.86 verification 包中 runtime 做逐文件 SHA-256 清单比对，并执行当前 runner 自检。只有清单和自检均通过时才跳过本次 PyInstaller 重建；任一差异/缺失即硬失败。新 EXE 仍由当前源码生成，不能借此复用旧 EXE、`out` 或把视觉审计视为通过。

**2026-08-14 verification-only 输出介质修正：** v0.1.87 首次在 E: exFAT 输出根完成打包并通过包内隐私审计、manifest 哈希核对；但该介质上的 EXE 随后触发 Windows SideBySide `Invalid Xml syntax` 启动错误，不能作为有效实际 EXE 验收。`mt.exe` 提取并比较 v0.1.87 与既有可运行包的内嵌 manifest 后二者完全相同且 XML 有效，故不得把该故障归因为密钥、provider 或应用行为。保留该不可覆盖失败包和脱敏本地失败摘要，只将下一次新版本 verification-only 包输出到现有 C: NTFS 目录；正式候选目录、生产 SQLite、原媒体及隐藏集均不触及。

**2026-08-14 verification-only 外部根隔离：** 打包脚本允许 `SHORTDRAMA_VERIFICATION_OUTPUT_ROOT` 仅用于 `--verification`，且必须是已存在的绝对目录；打包前会以真实路径拒绝任何等于或位于 `release/candidates` 的根，避免 Windows junction/symlink 将 visual-unverified 包污染正式候选命名空间。目标叶目录继续不可覆盖，隐私审计和 manifest 标记不变。脚本级 4 项负向回归覆盖“非 verification 使用外部根”“相对根”“formal candidates 根”和“临时 junction 指向 candidates”；独立 Stage 1/2 审查已通过且无 HIGH/MEDIUM。该审查只覆盖当前打包与隔离合同，不改变 `audit:fidelity` 或任一真实场景验收状态。

**2026-08-14 v0.1.88 公开帧级复验：** `C:\shortdrama-verification-outputs\v0.1.88-p1-internal-trial-visual-unverified` 在 C: NTFS 中以当前源码新建；manifest 的 EXE SHA-256 `6b6c03f8202f3b490d32f81dcbf9b51b00f0ed61c0649a302269c9903ce4fd94` 与实算一致，内嵌 manifest 可提取并解析，包内隐私审计通过，仍为 `verification-only`、`visualFidelity=incomplete`。该 EXE 对冻结公开 `dev-04` 只读生产配置、临时 SQLite、受控 JPEG 帧的真实调用在 `provider-failed` 受控结束（73,492 ms，`sourceDatabaseWrites=0`）；结果位于不可覆盖 `80_测试候选/phase17-20-modelstudio-frame-evidence-20260814-v088/dev-04-v088-frame-evidence-result.json`，运行后 v0.1.88 进程退出且生产库大小/最后写入时间未变化。该失败不表明密钥丢失，也不能创建视觉场景卡、候选、导出或完成结论；在用户已保存的 `multimodal-review` profile 中选择并验证可用视觉模型前，帧级能力仍未验收。

**2026-08-14 Phase 19 真实导出与治理复验：** 使用冻结 Baseline v1 和临时 SQLite 实跑三项独立证据：`dev-06` 实际 FFmpeg/ffprobe 精确导出边界、`dev-05/dev-06/hidden-02` 的恢复/部分成功/指纹漂移治理，以及完整 6+2 PTS 证据包预检，结果为 3 文件 / 3 测试通过。为避免 Electron 打包后的原生 ABI 干扰，验收前显式运行 `pnpm run rebuild:node`；首次 ABI 137/148 不匹配不记录为产品失败。该项继续不覆盖 hidden-01 跨窗真实输入、视觉复核、真实 `qualified` 或 Version 48 视觉验收。

**2026-08-14 Phase 20 当前构建 Electron 复验：** `pnpm run build` 与 `pnpm run rebuild:electron` 后，隔离 Electron 回归 `phase8-original-clip-workflow`、`phase14-original-clip-pool-report` 共 2 文件 / 2 测试通过：验证 V49 监视器唯一播放源、审阅范围/双时间线、0.1 秒微调与确认、候选池真实导出和完成报告，并在 1440×900、1280×720 检查无横向溢出。该局部通过不改变 `audit:fidelity=completed=0, incomplete=94` 的视觉门禁，Phase 20 继续标记 `visual-unverified`。

**2026-08-14 Phase 17–20 全量回归基线：** 当前源码的 `pnpm test` 为 102 文件 / 550 通过 / 5 显式跳过；typecheck、设计合同、差异检查通过；Electron E2E 为 15 通过 / 8 显式跳过。跳过的真实媒体/打包 DPI 条件不计入完成证据。`audit:fidelity` 仍为 `completed=0, incomplete=94`，因此即使代码和当前受控验收通过，也不得标记正式候选、发布或整个 Phase 17–20 完成。

**2026-08-14 Version 48 状态基线来源复核：** 已通过健康的 Open Design v0.19.0 daemon（显式 personal workspace 上下文）只读取得本项目文件清单：冻结 V48 主 HTML、字幕状态资产和 V49 原剧切片附件存在，但合同的 47 个 `screen/state × 1440×900/1280×720` 项目库预览并不存在。当前审计为 91 项缺完整三件套、3 项已有配对但像素超阈值；其中 15 个非字幕/非原剧切片状态在 V48 中没有状态专属视觉源，12 个原剧切片相关状态只存在 `unmerged-pending-confirmation` 的 V49 附件，均不能填充最终审计。尝试由 Open Design 创建独立、待确认的状态基线附件时，设计运行在生成前受控失败为 `AMR_INSUFFICIENT_BALANCE`，产物数 0；不改写 V48 主 HTML、不用本地/历史 PNG 替代项目库预览。待 Open Design 设计额度恢复后，才可生成并由用户确认附件，再逐状态采集项目库与 Electron 双视口证据；此前 `audit:fidelity` 保持 `completed=0, incomplete=94`。

**2026-08-14 V48 已有三项预览差异迁移复核：** 已建立 `docs/prototype-migration/original-clip-v48-project-preview-delta-20260814.md`。三张项目库预览和对应 Electron 图均为 1440×900、96 DPI，但项目库中的 220px 侧栏和 56px 顶栏约为 184px、47px（约 `5/6`），Electron 仍为冻结 V48 HTML 的 220px、56px。三个全屏零阈值对照分别为 `27.2648% / 14.2642`、`17.0876% / 12.2022`、`26.1177% / 12.2559`（changed-pixel ratio / mean RGB delta）。根因首先是项目库预览的渲染/缩放坐标系未证实等于合同固定视口，不是可由运行时 bridge 或局部 CSS 修补的生产布局偏离；禁止缩放 iframe、改应用壳尺寸、替换图片或放宽阈值来伪造通过。待 Open Design 以真实无缩放 1440×900 项目库预览重新采集后，才可按“外壳→隔离→bridge→数据”顺序继续收敛；视觉门禁和正式完成状态不变。

**2026-08-14 Phase 18 帧级探测失败码整改计划：** 新 `v0.1.89` 的只读 Model Studio probe 已生成不可覆盖摘要，但将“`secret_records` 不存在”与“记录存在却不能在当前 Windows 安全存储上下文解密”同记为 `missing-key`。本轮先将两者拆为稳定、无敏感信息的枚举码，结果仍只包含状态、耗时和生产库写入数；不读取、输出、迁移或改写密钥。实现对应构建身份递增为 `v0.1.90`，随后仅以新 verification-only 包复验。

**2026-08-14 Phase 18 帧级探测失败码整改结果：** `v0.1.90-p1-internal-trial-visual-unverified` 已通过包内隐私审计（3,744 文件）且运行新建的只读 probe。不可覆盖摘要 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-probe-20260814-v090/modelstudio-v090-result.json` 为 `failed / key-unreadable / 232ms / sourceDatabaseWrites=0`。该码证明 profile 引用的密钥记录存在，但当前运行无法在 Windows 安全存储中解密；它不表示密钥丢失、余额、模型或网络失败。应用能力总览同步改为 `unreadable-secret` 受控态，不能再将这种配置显示为“已配置”；当前源码构建身份递增为 `v0.1.91`，仍需以新包验证该界面变更，且本项不构成帧级视频复核、`qualified`、视觉门禁或 Phase 完成。

**2026-08-14 Phase 18 帧级可读性 UI 包级复验：** `v0.1.91-p1-internal-trial-visual-unverified` 已生成，EXE SHA-256 与不可覆盖 manifest 一致，包内隐私审计为 3,744 文件通过。真实 EXE 对新结果路径的 probe 为 `failed / key-unreadable / 206ms / sourceDatabaseWrites=0`，摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-probe-20260814-v091/modelstudio-v091-result.json`。当前源码全量单测为 106 文件 / 614 通过 / 5 显式跳过；定向真实 Electron provider 回归为 7/7（含不可解密密钥经 IPC 进入 `unreadable-secret`）；typecheck、build、设计合同、差异检查均通过。`audit:fidelity` 仍为 `completed=0, incomplete=94`，因此该包只可标记 `verification-only / visual-unverified`。

**2026-08-14 Phase 18 帧级可读性审查回补计划：** 独立 Stage 1 在本轮发现两项 HIGH：其一，历史“模型引导值 + 不可解密密钥”会因模型校验优先被报为 `model-required`，未给出密钥重存的可执行路径；其二，帧级成功摘要仍含可关联媒体的 SHA-256。整改将 `unreadable-secret` 提升为密钥记录存在时的优先受控态，并从帧级成功摘要删除媒体指纹；所有结果继续不含密钥、端点、字幕、媒体路径或媒体标识。修复后补单元/真实 Electron 回归并从 Stage 1 重审。

**2026-08-14 Phase 18 帧级可读性审查回补实现：** 已将不可解密状态放在模型引导值之前；设置总览、Model Studio 独立页、草稿状态和密钥输入提示均读取同一 `ai:capabilities:list` 结果，显示“需要重新保存密钥”。帧级成功摘要已只保留公开样本 ID、帧数、`supported` 与生产库写入数，删除媒体 SHA-256。定向单测 4 文件 / 48 项及真实 Electron provider 回归 7/7 已通过；当前源码构建身份递增为 `v0.1.92`，待全量回归与独立 Stage 1/2 后再打不可覆盖验证包。

**2026-08-14 Phase 18 帧级摘要标识审查回补计划：** Stage 1 进一步指出公开样本 ID 仍可关联冻结媒体，不能出现在帧级成功或失败 JSON。`dev-04` 仅保留为命令行白名单和进程内范围检查；摘要只允许状态、固定原因/结论、帧数、耗时和生产库写入数。移除后从 Stage 1 重审。

**2026-08-14 Phase 18 帧级摘要复审 Stage 2 回补计划：** 最新 Stage 1 已通过，但 Stage 2 仍有两项 MEDIUM：失败摘要只作部分字段匹配，不能阻止样本/媒体/端点字段重新泄露；Provider Bridge 为 316 行，超出单文件职责上限。将失败摘要断言收紧为完整对象与显式敏感字段缺失，并把腾讯 ASR 连通性渲染抽到既有辅助模块；随后从 Stage 1 重新审查。文档也会同步“摘要已移除样本 ID”的最终状态。

**2026-08-14 Phase 18 provider 模型引导值防护：** 生产配置只读复核发现 Model Studio 的“请按开通模型填写”目录引导文案可被错误持久化为 `multimodal-review.model`，密钥引用仍存在却必然使帧级调用失败。按 `SUP-006a` 增加 Renderer 保存前与主进程 profile 保存时的双重拒绝，且失败不改写 profile、密钥引用或任何业务数据；回归覆盖引导值拒绝与既有密钥保留。此整改只消除配置假阳性，不构成视觉模型已选、provider 已通过、视觉场景卡、`qualified`、Open Design 视觉门禁或 Phase 17–20 完成。

**2026-08-14 Phase 18 provider 模型引导值审查补漏：** Stage 1 发现历史引导值 profile 虽已无法再次保存，却仍可在主进程能力注册表和 Model Studio 默认卡显示为“已配置”。整改将其一律收束为 `model-required` / “需填写模型”受控状态，不读取或改写现有密钥；覆盖有效密钥历史记录、IPC 能力状态和默认卡三个路径。修复后必须从 Stage 1 重新独立审查。

**2026-08-14 Phase 18 provider 历史配置真实 IPC 回归：** 当前源码经 `pnpm run build`、`pnpm run rebuild:electron` 后，`tests/e2e/provider-connectivity.spec.ts` 的隔离 Electron 用例以临时 SQLite 写入一条仅含假的加密字节、有效密钥引用和“请按开通模型填写”的历史 `multimodal-review` profile。真实 `window.desktopApi.listAiCapabilityStatus()` 返回 `controlled / model-required`；设置总览和 Model Studio 默认卡均显示“需填写模型”，并采集 1440×900、1280×720 两张截图。定向回归 `1 passed`，不出网、不读取或改写生产 SQLite/密钥/媒体。该证据只证明历史假阳性被阻断；用户仍须保存实际已开通的视觉模型 ID，之后才能以新 verification-only 包重跑帧级验收；`visual-unverified`、`audit:fidelity=completed=0, incomplete=94` 与 Phase 17–20 未完成结论保持不变。

**2026-08-14 Phase 18 provider 防护结构收口：** 独立 Stage 2 指出原 `ProviderSettingsPrototypeBridge.ts` 为 434 行、同时承担保存、原型 DOM 辅助和绑定协调。现拆为 291 行协调器、62 行保存事务和 108 行原型 DOM 辅助模块；不改变页面节点、样式、IPC 或保存合同。拆分中曾发现“腾讯云 ASR 首次缺双凭据”同步拒绝会短暂占用保存锁，已将锁移动至全部同步校验之后；Node ABI 下的 5 文件 / 35 项定向回归和 typecheck 均通过。此结构整改不改变 provider 真实外部验收与 Phase 完成状态。

**2026-08-14 Phase 18 Model Studio 双能力自动选型整改：** Stage 1 复审发现自动选型仅覆盖 `multimodal-review`，而同一目录的 `text-analysis` 仍允许手填模型。现将共享官方 allowlist/优先级扩展到两条能力：文本页和视频页的模型字段均只读；检测和保存均携带当前能力；主进程拒绝任一手填的 Model Studio 目录模型。目录使用当前官方中文视觉文档列出的 `qwen3.7-flash`、`qwen3.6-flash`、`qwen3.7-plus`、`qwen3.6-plus`，历史空/引导值在总览和独立页收束为“等待自动选择”。定向 4 文件 / 29 测试、全量 `pnpm test` 109 文件 / 570 通过 / 5 跳过、typecheck、build 和隔离 Electron E2E 16 通过 / 8 跳过均已通过；仍需重新独立 Stage 1/2 审查。`audit:fidelity` 为 `completed=0, incomplete=94`，本项不得写作帧级 provider 验收、正式候选或 Phase 完成。

**2026-08-14 Phase 18 Model Studio IPC 选型证明补漏：** Stage 1 发现仅校验 allowlist 仍允许 Renderer 直接提交一个已知模型名、绕过当前账号的 `/models` 发现。保存边界改为消费主进程发现服务签发的短时一次性凭证；凭证须同时匹配当前能力、官方 endpoint、自动选择的模型和安全存储中密钥的摘要。任何不匹配、失效或已消费凭证都不保存 profile，旧 profile/密钥引用保持原样。修复后重新跑 Stage 1/2 和全量回归；此前配置页绿色不作为本项完成证据。

**2026-08-14 Phase 18 Model Studio 证明最终收口：** 后续独立审查指出“相同明文、不同 `secretRef`”仍可复用证明，以及持久化层的布尔验证入口可被误用。实现改为精确绑定 `secretRef`，并将保存能力收束为发现服务消费后生成的内部 proof；Renderer 只看稳定显示名，不能取得或提交原始模型 ID。验证顺序为定向安全回归 → 全量测试/编译/Electron E2E → 独立 Stage 1/2；任何未通过项仍阻止实际帧级验收与 Phase 完成声明。
