# 默认桌面保真审计

> **历史审计记录。** 本文使用的 `Web-Prototype/` 和 Version 48 合同都只可用于追溯旧审计，不得作为当前页面开发或视觉验收基线。当前唯一设计源、哈希与执行边界见根 `Product-Spec.md`、根 `DEV-PLAN.md` 和 V49 HTML；旧 `docs/design-contract-v48.json` 与 V48 复用矩阵不再具有当前裁决权。

> 当前候选范围为 P0/P1 内部试点。P2 解说、TTS 与旁白的旧截图、测试和受控实现仅作历史参考，不属于当前候选的生产功能或视觉验收范围。

基准：`D:\个人工作\Web-Prototype\short-drama-material-studio.html`，1440 x 900，默认 CSS 分支（宽度大于 1300px）。

## 可重复对照

- Playwright 现在以 `preserveOutput: 'always'` 保留每次 1440×900 的原型和隔离 Electron 截图。当前报告覆盖剧目库、资产、生产、拼接、原剧切片、成果、任务、标签、设置、通知抽屉、创建/编辑/导出/包装弹窗、P1 二创与审核时间线；P1 关键页同时保留 1280×720 控件可操作性截图。
- 执行 `pnpm run test:e2e && pnpm run audit:fidelity` 会写入 `test-results/fidelity/`：每个配对页面的并排图、50% 叠加图、热力图与 `fidelity-report.json`。
- 剧目库以 `p0-library-populated-1440x900.png` 对照原型三卡状态；空库属于真实数据空态，单独由 P0 流程验证，不混入同一像素基线。
- 通知抽屉以任务完成后、返回剧目库时的 `p0-notification-library-1440x900.png` 对照原型通知列表；任务开始前的 0 通知空态同样单独验证，不混入列表基线。
- 原型 P1 审核页与 P1 草稿时间线配对；P2 旁白时间线不参与当前候选的像素或流程判定。
- 真实数据内容、媒体画面、任务 ID、日期和隔离数据库数量属于允许差异；壳层尺寸、网格、弹窗、控件、图标、文字位置、滚动区和层级不属于允许差异。

自动生成的只读原型基准位于 `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/`，覆盖剧目库、任务、标签、设置、资产、生产、拼接、切片、P1 二创、审核时间线及创建/编辑/导出/包装弹窗的默认桌面状态。

| 页面或状态 | 原型证据 | 应用证据 | 当前结论 | 待处理项 |
| --- | --- | --- | --- | --- |
| 剧目库 | `test-results/prototype-library-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-library-1440x900.png`、`p0-library-populated-1440x900.png` | 进行中 | 已补空库与含真实数据状态；卡片网格固定为原型三列/16px，回退封面使用原型 `16:7` 比例与同等遮罩参数。继续核对多卡与异常摘要。 |
| 剧目资产 | 原型同源页面 | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-assets-1440x900.png` | 结构已收敛 | 已恢复原型头部、健康条、工具栏右侧“全部状态”筛选和七列表格；筛选会真实过滤可用/需处理行，继续核对含异常与已关联剧本状态。 |
| 素材生产 | 原型同源页面 | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-production-1440x900.png` | 结构已收敛 | 已改为带剧目上下文的独立页面；P1 仅开放二创审核闭环，P2 保持禁用且无入口。 |
| 成果库 | `test-results/prototype-results-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-results-1440x900.png` | 进行中 | 已从表格恢复为原型三列成果卡；无真实缩略图时使用本地代表剧照回退，P0 断言预览区为原型 188px 高度，继续核对真实媒体缩略图和文字基线。 |
| 标签管理 | 原型同源页面 | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-tags-1440x900.png` | 结构已收敛 | 创建标签已从首屏内联表单移入弹窗，默认页恢复标题操作和四列表格；继续核对含标签行与删除确认。 |
| 多集拼接 | `test-results/prototype-stitch-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-stitch-config-1440x900.png` | 结构已收敛 | 默认桌面阶段栏已锁定为 `y=176 / h=52`，双卡配置区为 `y=246 / h=555`；恢复原型 44px 字段、12px 标签、16px 分组内边距与质量提示框，性能模式移入“完整导出设置”弹窗。 |
| 原剧切片 | `test-results/prototype-clip-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-clip-1440x900.png` | 三栏结构已收敛 | 默认桌面三栏工作区已固定为原型 590px，高内容保留可访问滚动但默认不显示多余滚动条；候选存在态、审片参数细节和字幕依据继续核对。 |
| P1 AI 二创 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-ai-remix-1440x900.png` | `docs/design-evidence/v0.1.21/p1-ai-remix-1440x900.png` / `p1-ai-remix-1280x720.png` | 已复验 | 主操作遵循原型位置；真实本地证据不足时保留空白而不伪造演示草稿；P2 卡片保持禁用。 |
| P2 AI 解说 | 原型未来态 | 无当前候选生产截图 | 强制冻结 | 卡片仅以禁用未来态存在；不得有路由、preload、IPC、任务、成果或供应商入口。 |
| P1 审核时间线 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-review-timeline-1440x900.png` | `docs/design-evidence/v0.1.21/p1-review-timeline-1440x900.png` / `p1-review-timeline-1280x720.png` | 已复验 | 固定轨、人工确认与导出设置均限于 P1 二创草稿；P2 不能借用导出路径。 |
| 任务中心默认态 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-tasks-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-tasks-1440x900.png`、`p0-task-detail-1440x900.png` | 数据变体已记录 | 原型的演示任务、更新时间和通知数量不能替代隔离数据库中的真实任务；仍严格断言七列顺序、筛选器 `y=156 / h=44`、表格 `y=214` 与详情抽屉 `x=1020 / 420×900`。运行控制转入详情抽屉。 |
| 设置默认态 | `test-results/prototype-settings-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-settings-1440x900.png` | 数据变体已记录 | 侧栏、标题、分区和“设置自动保存”状态保持原型结构；能力行改为 P1 真实供应商目录、区域/费用和受控本地状态，故按数据变体审计，不以放宽像素阈值掩盖差异。配置表单保留焦点与 Escape。 |
| 通知抽屉 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-notification-drawer-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-notification-drawer-1440x900.png`、`p0-notification-list-1440x900.png` | 进行中 | 静态基准会等待原型抽屉动画完成后截图；E2E 已断言实际 `420px` 宽度、终态位移和 Escape。继续核对待决策/错误通知行。 |
| 创建剧目弹窗 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-create-dialog-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-create-dialog-1440x900.png` | 严格对照已修复 | 原型采集等待弹窗终态；视觉报告仅对固定的 `x=410 / y=183 / 620×534` 弹窗本体严格比较，背景剧目库仍由隔离数据库驱动而不参与该对照。E2E 同时断言该几何、字段和“选择文件 → 保存并整理资产”的真实流程，并补齐 1280×720 可操作性截图。 |
| 导出设置弹窗 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-export-dialog-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-export-dialog-1440x900.png` | 进行中 | 外框为原型 620px，已取消容器外层内边距，分隔线改由头/体/脚区域贴边绘制；P0 已验证 Escape 关闭后可重新打开并继续包装与预检，继续核对分组和字段基线。 |
| 编辑剧目、包装设置弹窗 | `test-results/e2e/prototype-reference-captur-7f979-esktop-prototype-references/prototype-edit-dialog-1440x900.png`、`prototype-packaging-dialog-1440x900.png` | `test-results/e2e/p0-workflows-FLOW-001-to-F-f578e-gh-the-isolated-desktop-app/p0-editor-modal-1440x900.png`、`p0-packaging-dialog-1440x900.png` | 进行中 | 编辑默认态已恢复为原型的紧凑表单；P0 锁定 `x=410 / y=183 / 620×534`，页脚严格保留“取消 / 保存并整理资产”。逐集导入、剧本关联与重新定位可从剧目工作区的“剧目资产”标签页操作。原型采集会断言编辑触发后的真实 `.modal` 可见且不透明；包装弹窗已恢复原型 1160px 宽的三段式容器、真实剧照预览和安全区，并消除内部滚动条。继续核对编辑弹窗的字段基线、焦点、Escape 与错误状态。 |

## 允许差异

- 剧目库、标签、任务和通知的文字与数量来自隔离 Electron 数据库；静态原型中的三部演示剧目、三条通知和日期不是生产默认数据。
- 数据变体仍是可失败门禁：视觉报告对其保留页面原始差异数值，并执行全局错配包络（变化像素比例不得超过 `0.50`、平均 RGB 差不得超过 `25`）。该包络用于拒绝错误页面/状态配对，不替代各页面的结构、几何、交互和窄视口 E2E 断言；严格页面继续使用其原有像素阈值。
- P1 明确显示“受控本地验证模式”，且不会把本地证据上传到云端；这属于安全限制，不能替换为原型中的云端成功状态。静态原型的 P2 卡片保持低透明度“暂不可用”且按钮禁用，不提供解说任务配置入口。
- 标签契约不保存独立的最近更新时间，因此标签表的该列显示 `—`；其余表格列和操作位置仍按原型对齐。

## 独立审查

本轮独立审查发现并已修复以下 MEDIUM 问题：

- 资产表中“重新定位”原本错误地只打开文件位置，现触发真实的批量重连操作。
- 任务详情抽屉在暂停、继续、取消后会立即同步本地任务状态，避免继续显示旧按钮。
- 待启动任务不再虚构已用时间；终态任务的时长冻结于最近更新时间。
- 任务详情侧栏恢复为非模态抽屉语义，和原型的抽屉交互一致。
- 通知打开任务详情后，关闭抽屉不会再被同一焦点状态立即重新打开。
- 创建后自动导入期间禁用关闭、取消和 Escape；导入失败可在同一弹窗重试，不会重复创建剧目。
- 文件选择器现在支持文件夹，导入服务会递归收集受支持视频文件；创建弹窗文案不再承诺未实现的拖放能力。
- 文件夹导入服务已用真实临时目录覆盖：递归收集视频、忽略非视频文件，并按自然集号排序。
- 剧目回退封面现在固定使用原型 `16:7` 比例；供应商方案保存期间锁定 Escape、关闭和取消；目录遍历跳过符号链接、去重真实路径并限制深度和文件数。
- `SettingsPage` 单测覆盖供应商保存中的禁用 fieldset、取消/关闭禁用与 Escape 留在弹窗的行为。
- `DramaService` 单测覆盖超过 2000 个视频的目录导入即时失败，不会把超限误报为“未找到视频”。
- 审核时间线右上“导出设置”已从页面内滚动定位改为真实 620px 模态；目录选择异常保留在模态内并显示可恢复错误，保存目录后顶部“确认并导出”会执行确认和真实导出。
- P1 前两条候选草稿均可进入审核时间线，第三条起在后续审核区保持可达；每条草稿独立展开其 `evidenceId` 对应的分析依据。
- 受控本地实现尚未支持剪辑视角策略，控件现明确禁用为“智能推荐（受控模式固定）”，不再接受不会影响任务的选择。
- 编辑剧目默认弹窗已删除不可达的高级管理分支，页脚严格为原型的“取消（次级）/ 保存并整理资产”；资产管理统一从“剧目资产”标签页进入。
- P1 审核页标题和元信息恢复为原型的“候选草稿 01 / P1 审核草稿 · 自动保存”；检查器默认态只显示音量、淡入淡出、转场和橙色“吸附到切点与转场”开关，定位与排序操作不再挤占原型默认视区。最新实机证据：`test-results/e2e/p2-narration-workflow-P2-g-951a8-ict-insert-controlled-draft/p1-review-timeline-1440x900.png`。

仍未可判定 PASS：E2E 已对 220px 侧栏、56px 顶栏、20px 页面内边距、420px 通知抽屉、620px 创建/导出弹窗、1160px 包装弹窗，以及审核页 680px 监视器和 280px 检查器提供几何断言；但尚未具备覆盖全部页面的原型像素基线阈值比对。

## 已验证命令

- `pnpm run typecheck`
- `pnpm exec vitest run src/renderer/src/pages/OriginalClipWorkspacePage.test.tsx src/renderer/src/pages/DramaWorkspacePage.test.tsx`
- `pnpm run build`
- `pnpm run rebuild:electron`
- `pnpm exec playwright test tests/e2e/p0-workflows.spec.ts`
- `pnpm exec playwright test tests/e2e/p2-narration-workflow.spec.ts`
- `pnpm exec vitest run src/renderer/src/pages/DramaLibraryPage.test.tsx`（创建前选择文件并自动导入）
- `pnpm exec playwright test tests/e2e/prototype-reference.spec.ts`（只读原型默认桌面基准）
- `pnpm run test:e2e`（静态原型参考、P0、P2、打包 DPI 共 4 项通过）
- `pnpm test`（60 个文件，187 个测试通过）
- `pnpm run pack:dir`
- `pnpm exec playwright test tests/e2e/packaged-real-dpi.spec.ts`（打包应用在系统 DPI 1.5 下无裁切）

最终独立 Stage 1/Stage 2 已复审本轮修复并通过，确认默认编辑弹窗、P1 候选路由与逐条证据、时间线导出错误处理均无阻断问题。

以上仅证明当前已覆盖流程可运行，不替代全部页面、弹窗和 P1/P2 的逐像素最终验收。

## 本轮默认桌面复验

- 视觉报告脚本已改为严格输入与差异门禁：每个原型/实现截图必须各有且仅有一张，并且双方均为 `1440×900`；缺图、重复、尺寸不符，或超过该页面的受控像素差/平均 RGB 差阈值都会以非零状态退出，报告不再按较小尺寸裁剪后继续比较。阈值以本轮动画稳定后的实测基线加小幅余量建立；隔离数据、媒体和原型演示内容的差异仍遵循上方“允许差异”。
- 本轮先清除了 `test-results/` 根目录中已确认的历史截图副本，再由 `pnpm run test:e2e` 重新生成本轮证据。`pnpm run audit:fidelity` 已成功输出 16 组唯一配对；并排图、50% 叠加图、热力图和 JSON 报告位于 `test-results/fidelity/`。
- P0 会在首张库页截图前等待 `.screen.active` 的入场动画完成并再跨两帧绘制；拼接配置和包装设置截图已先切换到 `1280×720` 才写入对应文件名，随后恢复 `1440×900`，默认桌面配对不再混入错标或过渡帧截图。
- P2 卡片使用 `.p2-controlled`，保留原型所需的低权重背景/边框，同时保持文字对比度和可点击语义；`.future` 仅用于真正不可用的未来态。
- 测试稳定性复验：取消媒体进程会等待唯一启动标记后才发送 abort；运行时 FFmpeg 回退集成测试的超时预算为 30 秒。两项定向回归、全套并发单测、Electron E2E 和安装包目录构建均已通过。

本轮验证：`pnpm test`（60 文件 / 188 用例）、`pnpm run build`、`pnpm run test:e2e`（4 项）、`pnpm run audit:fidelity`（16 组严格配对）与 `pnpm run pack:dir`。
