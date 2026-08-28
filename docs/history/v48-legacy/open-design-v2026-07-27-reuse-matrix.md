# Open Design v2026-07-27 复用矩阵

## 设计源与边界

- 设计源：`design/open-design/v2026-07-27/short-drama-material-studio.html`。
- 交接契约：同目录 `DESIGN-HANDOFF.md`、`DESIGN-MANIFEST.json`；设计源目录只读。
- 功能、安全、Windows 桌面范围和 P2 冻结以 `Product-Spec.md` 为准。原型中的演示数据必须替换为真实数据；原型中的 P2 未来能力不得进入生产路由、preload、IPC 或供应商目录。
- 对照视口：1440×900、1280×720。原型 manifest 中的移动/平板视口是设计导出信息，不扩展当前 Windows 桌面产品范围。

## 原型到生产映射

| Open Design 区块 | 生产路由 / 组件 | 必须保留 | 允许的真实差异 | 当前审计 |
|---|---|---|---|---|
| `screen-drama-library` | `DramaLibraryPage` | 顶部工具区、筛选/排序、卡片或列表视图、分页与空态、剧目卡状态层级 | 演示剧目、标签、统计和封面改为 SQLite/真实媒体数据 | 已核验：空库与已导入态双视口截图；见证据目录。 |
| `screen-drama-assets` | `DramaWorkspacePage`、`DramaAssetsPage` | 剧目上下文、资产/生产/成果三标签、资产表、异常优先级、导入与删除确认 | 资产与健康状态来自主进程；删除只删引用 | 已核验：资产表与真实 4 集导入态双视口截图。 |
| `screen-material-production` | `DramaWorkspacePage`、`ProductionPage` | P0 原剧切片/多集拼接优先级、P1 二创为人工审核草稿、P2 解说明确不可用 | P1/P2 可达性按 Product Spec 收窄；真实生产数据替代示例 | 已核验：生产入口和真实任务上下文双视口截图。 |
| `screen-stitch-workspace` | `MultiEpisodeWorkspacePage`、`ExportSettingsDialog`、`PackagingSettingsDialog` | 配置→预检→运行→报告顺序、导出与包装字段顺序、安全区预览、确认语义 | 预检/任务/文件状态来自真实服务；系统文件选择器允许差异 | 已核验：配置工作区双视口截图；导出/包装对话框另有 E2E 覆盖。 |
| `screen-original-clip-workspace` | `OriginalClipWorkspacePage` | 历史映射保留以追溯 | 已由最终 v2026-07-30 Phase 8 源替代：生成候选优先、双时间线、独立导出与共享字幕资产 | 已替代；旧图不得再作为像素基线，见 v2026-07-30 矩阵与 Phase 8 E2E。 |
| `screen-results-library` | `DramaWorkspacePage` 的成果面板 | 成果筛选、来源追溯、三列成果层级、打开本地位置 | 真实输出缩略图与元数据替代演示卡 | 已核验：真实导出成果与打开位置操作双视口截图。 |
| `screen-global-tasks` | `TaskCenterPage`、任务详情抽屉 | 紧凑表格、状态/进度/阶段/更新时间、可回看任务详情 | 真实任务队列替代演示行 | 已核验：真实队列双视口截图；详情抽屉和报告另有 E2E 覆盖。 |
| `screen-tag-management` | `TagManagementPage` | 标签表、创建、重命名、危险删除语义 | 使用真实标签与使用数 | 已核验：标签表与创建入口双视口截图。 |
| `screen-settings` | `SettingsPage` | 设置分区、当前设置上下文、状态与操作分离、密钥掩码 | 数据/日志和导出/性能接入真实服务 | 已核验：能力总览及受控入口双视口截图。 |
| 动态 `screen-asr` | `ProviderCapabilityPage(capability=asr)` | 独立页、常见方案、费用快捷筛选、候选与当前能力草稿并列、显式保存 | 候选和密钥状态来自真实目录/安全存储；外链经受限 IPC | 已修复并核验：双视口截图、三个详细筛选、草稿和保存按钮可操作性。 |
| 动态 `screen-textAnalysis` | `ProviderCapabilityPage(capability=text-analysis)` | 同上，且仅文本能力候选可见 | 同上 | 已核验：双视口截图；免费/试用仅显示文本能力候选。 |
| 动态 `screen-multimodalReview` | `ProviderCapabilityPage(capability=multimodal-review)` | 同上，且仅视频理解候选可见 | 同上 | 已核验：双视口截图；按量付费仅显示视频理解候选。 |
| `screen-ai-remix`、`screen-review-timeline` | `AiRemixWorkspacePage`、`AiReviewTimelinePage` | 仅在 P1 范围内可用；人工审核、成本/证据/确认导出语义 | 用户已明确合并重复的“审阅/确认”环节，故审核页以真实媒体优先画布、编辑状态与唯一确认出口替代旧静态多轨演示；未配置密钥时零网络 | 已核验：P1 二创与审核时间线双视口截图和 Electron 流程；这是有记录的结构差异，P2 不得借用该路由或导出入口。 |
| 原型的 `AI 短剧解说` 卡、旁白/TTS 相关未来稿 | N/A | 只能显示为未来/禁用态 | 不得新增任何生产可达性 | 强制冻结 |

## Token 与交互复用

| 原型来源 | 生产来源 | 必须保留 |
|---|---|---|
| `:root` | `src/renderer/src/styles/tokens.css` | 石墨深色表面、暖沙橙主操作、语义色、Windows 中文字体、4px 步进、6/9px 圆角、150/180ms 功能动效。 |
| `.app/.sidebar/.workspace/.topbar/.content` | `AppShell.tsx`、全局样式 | 220px 稳定侧栏、56px 顶栏、单一可滚动工作区、可见当前上下文。 |
| `.btn/.btn-primary/.btn-secondary/.btn-danger`、`.tabs` | 公共样式与各页面 | 主/次/危险层级、可见 focus、禁用/加载语义、标签下划线当前态。 |
| `.modal-backdrop`、抽屉、Escape 与焦点管理 | `ModalDialog.tsx`、`NotificationDrawer.tsx`、领域对话框 | 焦点捕获、关闭后焦点返回、错误关联、危险确认。 |
| 供应商动态屏幕的费用筛选、候选、草稿和保存反馈 | `ProviderCatalogPicker.tsx`、`ProviderCapabilityPage.tsx`、`SettingsPage.tsx` | 费用快捷筛选首屏可见；候选预填但不保存/不覆盖密钥；状态文字说明受控模式。 |

## 差异记录规则

每次实施前将本表“当前审计”改为“已核验 / 差异已记录 / 已修复”，并在同一提交（本项目不自动提交）或交付报告附：生产文件、1440×900 与 1280×720 截图、真实状态覆盖和未实施差异。任何结构性差异必须先写入本表并获得用户确认。

## v0.1.21 审计证据

- 版本化截图基线：`docs/design-evidence/v0.1.21/`。其中每个本轮审计页面都有 `*-1440x900.png` 和 `*-1280x720.png`；P1 的 `p1-ai-remix-*` 与 `p1-review-timeline-*` 源自 `tests/e2e/p1-remix-workflow.spec.ts`，其余源自 `tests/e2e/p0-workflows.spec.ts`。两者均使用隔离 SQLite/真实本地媒体流程，不使用 Open Design 演示数据。
- 供应商页：三个能力各有双视口截图。ASR 的 1280×720 回归同时断言无横向溢出、当前能力草稿、三个详细筛选及保存按钮；保存按钮会滚入可视区后验证可操作。
- 已记录的安全差异：原型中的外部资料链接不在应用内打开；生产实现经受限 IPC 交给系统默认浏览器。系统文件选择器保留原生行为。两者均由 Product Spec 安全边界决定，不改变原型的信息层级和字段顺序。
- P2：原型中的 AI 短剧解说保留为未来态；当前 `ProviderCapabilityPage` 的能力白名单仅为 ASR、文本语义分析和视频理解复核，P0 E2E 不出现 P2 配置入口。
