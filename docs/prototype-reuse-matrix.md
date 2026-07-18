# Web Prototype Reuse Matrix

`Web-Prototype/` is read-only. This matrix records how `short-drama-material-studio.html` is ported into the production Electron renderer. A difference is allowed only when it replaces demo data with a real state, satisfies Product Spec security/functionality, or excludes a P1/P2 feature from P0.

| 原型区块 | P0 生产路由/组件 | 必须保留 | 允许差异 |
|---|---|---|---|
| `#screen-library` | `DramaLibraryPage` | 顶部工具区、剧目卡/列表、筛选与空态层级 | 演示剧目替换为 SQLite 数据。 |
| `#screen-assets` 与剧目工作区标签 | `DramaAssetsPage`、`DramaWorkspaceTabs` | 资产表、异常优先级、剧目上下文与三工作区标签 | 资产探测状态替换为真实媒体状态。 |
| `#screen-production` | `ProductionPage` | 生产方式卡片、P0/P1/P2 的可用/未来能力表达 | P1/P2 按钮在 P0 保持不可用。 |
| `#screen-stitch`、`#stage-config`、`#stage-preflight`、运行/报告面板 | `MultiEpisodeWorkspacePage` | 配置到预检到运行的单工作区流程、表单分组、状态层级 | 动态窗口/预检/任务数据替换演示数据。 |
| `#screen-clip` | `OriginalClipWorkspacePage` | 候选列表、监视器、审片参数、确认导出结构与键盘操作 | 候选、字幕和媒体时间码绑定真实数据。 |
| `#screen-results` | `ResultsLibraryPage` | 成果卡、筛选、成果元数据与来源追溯 | 预览图和元数据替换真实成果。 |
| `#screen-tasks` | `TaskCenterPage` | 紧凑任务表、筛选、状态和进度列 | P0 隐藏 AI 二创演示任务。 |
| `#screen-tags` | `TagManagementPage` | 标签表、创建、重命名与危险删除语义 | 标签及使用数替换真实数据。 |
| `#screen-settings` | `SettingsPage` | 设置分区、密钥掩码与导出/性能/日志结构 | P0 不触发 AI 云端执行。 |
| `#noticeDrawer` | `NotificationDrawer` | 抽屉结构、未读数、语义状态、跳转与键盘焦点 | 通知记录替换 SQLite 数据；P1 待决策演示项不进入 P0 数据。 |
| `#dramaModal`、`#exportModal`、`#packagingModal` | 领域对话框组件 | 原型中的字段顺序、确认语义、焦点管理和危险操作分离 | 绑定真实校验、文件系统与任务配置。 |

## Token extraction

| 原型 token | 生产 token | 原型值 |
|---|---|---|
| `--bg` | `--bg` | `oklch(17% 0.012 65)` |
| `--surface`、`--surface-2`、`--surface-3` | 同名 token | 原型 `:root` 的石墨深色表面层级与 `color-mix` 公式。 |
| `--fg`、`--muted`、`--border`、`--fg-soft` | 同名 token | 原型 `:root` 的文字、边框与弱化前景值。 |
| `--accent`、`--accent-soft` | 同名 token | 原型 `:root` 的暖沙橙主操作及低强调变体。 |
| `--success`、`--warning`、`--danger`、`--ai` | 同名 token | 原型 `:root` 的语义状态色；状态不得只依赖颜色。 |
| `--font-display`、`--font-body`、`--font-mono` | 同名 token | 原型的 Windows 中文字体、等宽数字和回退栈。 |
| `--radius`、`--radius-lg` | 同名 token | 原型的 6px / 9px 圆角。 |
| `--gap-xs` 至 `--gap-xl` | 同名 token | 原型的 4px 基础步进。 |

## Interaction and semantic mapping

| 原型选择器/行为 | 生产实现 | 必须保留的状态和键盘语义 |
|---|---|---|
| `.nav-btn[data-screen]`、`data-open` | 路由与导航组件 | 当前项、hover、focus-visible、Enter/Space 激活及 1280px 收起布局。 |
| `.tabs [data-drama-screen]` | `DramaWorkspaceTabs` | 三工作区上下文、当前项、禁用原因和不丢失配置的返回。 |
| `.btn`、`.btn-primary`、`.btn-secondary`、`.btn-danger` | Button 变体 | 主/次/危险层级、focus-visible、禁用、加载和危险确认分离。 |
| `#notifBtn`、`#noticeDrawer`、`#closeDrawer` | `NotificationDrawer` | 未读数、抽屉焦点移入/返回、Escape/关闭、已读与待决策保护。 |
| `#dramaModal`、`#exportModal`、`#packagingModal` | 领域对话框 | 焦点捕获、Escape、取消后焦点返回、字段验证和确认动作。 |
| `[data-next-stage]`、`#stage-config`、`#stage-preflight` | `MultiEpisodeWorkspacePage` | 配置→预检→运行的顺序、返回修改保留数据、阻塞原因可见。 |
| `[data-candidate]`、`#clipInPoint`、`#clipOutPoint`、`#clipReviewStatus` | 原剧切片候选/审片组件 | 鼠标、Enter、Space 选中候选；入/出点与状态同步。 |

## Phase 1 bootstrap exception

`src/renderer/src/App.tsx` 是数据库和预加载 API 的开发启动页，不是产品路由、演示页面或最终空态。它只使用已提取的原型 token，并在 Phase 2 被 `AppShell` 与原型 `#screen-library` 路由替换；不得把它扩展成独立设计体系。

## Token and interaction sources

- CSS token source: the `:root` block in `short-drama-material-studio.html`.
- Layout, responsive, focus, drawer, modal, form, tab, filter, media-control and packaging interaction sources: the inline CSS and JavaScript in the same file.
- Media assets: `Web-Prototype/assets/`; preserve their role and attribution rules from `assets/media-sources.md`.
- Phase 1 only extracts this contract, token baseline and开发启动页。Phase 2 freezes the extracted values in `src/renderer/src/styles/tokens.css` and ports the app shell; full domain route/component porting begins in the corresponding later DEV-PLAN phases.
