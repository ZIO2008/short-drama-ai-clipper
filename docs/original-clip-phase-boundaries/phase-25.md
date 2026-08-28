# Phase 25 边界：原剧切片工作台行为收口

> 状态：已完成。后续阶段可消费当前稳定候选、证据检查器 DTO 与确认授权；不得绕过 published snapshot 和 confirmed 状态。

## 冻结输入

- Phase 24：稳定 publish pointer、candidate snapshot、taskRound、provider chain 和任务 checkpoint。
- Product Spec：CLIP-001–005、CLIP-008、CLIP-024、CLIP-033–034、CLIP-045、CLIP-REAL-001–004。
- V49 `screen-clip` 已验收的默认候选、前后审阅/倍速、媒体不可读三状态；本 Phase 不重新设计或移动控件。

## 已完成行为

- 当前候选只从当前分集筛选；切集同步 episode、candidate、监视器、双时间线、检查器和分页，缺媒体不会沿用旧候选。
- inline 候选切换先暂停并定位新入点；跨集 external candidate 先释放旧媒体，再绑定新分集并定位入点。
- 当前 video load/error/seek setter 失败会暂停、移除媒体、清空时码并进入真实媒体不可读状态；旧 video 的迟到 error 不能污染当前媒体。
- source timeline 与 candidate timeline 点击/拖动只暂停定位；candidate 左右键每次 1 秒并限制在当前候选范围，均不调用候选更新。
- 工作台 Space 只在工作区非控件焦点播放/暂停；button、link、表单、非 false contenteditable、dialog/modal 和工作台外焦点不触发。
- 速度、音量、静音、循环和审阅范围只属于会话；只有右侧四个 0.1 秒 nudge 按钮可持久化边界。
- candidate queued write 固定原 candidateId；跨集切换后迟到写入、旧 refresh 和旧 media error 都不能写入或覆盖新上下文。
- TaskSummary 暴露冻结 taskRound；工作台按 taskRound、更新时间、ID 选择最新任务。取消、中断、失败重开后显示真实原因，旧 blocked 不覆盖新 reviewing/completed。
- 确认经 renderer → preload/IPC → `OriginalClipService.confirmCandidate()`；服务再次验证当前 published snapshot。未确认候选不能进入导出，确认仍是唯一授权。
- 候选检查器补齐冻结 snapshot 的节拍、用途、上下文、事件/锚回链、证据结论数量、时长偏离和局部视频复核状态；历史/手动候选没有完整快照时明确说明，不伪造分析事实。
- 时间线紫色标记继续表示当前播放预览位置，运行时将静态“差异”标签改为“预览”，避免把播放头伪装成字幕差异证据。

## 代码与页面边界

- `OriginalClipWorkspaceRuntimeBridge.ts` 已按 DOM 元素、公共事件、任务 notice、媒体会话和纯渲染职责拆分，生产桥保持 300 行以内。
- 本 Phase 未修改 V49 静态 HTML、DOM 顺序、布局或控件位置；证据绑定复用 `.r5-candidate-id/.r5-note`，仅增加屏内受控样式语义把播放头标签从“差异”改为“预览”。迁移卡见 `docs/prototype-migration/phase25-clip-inspector-evidence.md`。
- 新增 `taskRound` 只是既有 `tasks:list` 返回值的只读字段，没有新增 IPC channel、数据库列或 schema。

## 最终验收证据

- 全量 Vitest：119 files passed、5 skipped；692 tests passed、5 skipped。
- TypeScript strict typecheck、Electron/Vite build、renderer boundary、baseline registry、current references 和 Playwright suite boundary 均通过。
- current Electron：14 passed、6 个依赖真实打包 EXE/DPI 的条件用例 skipped、0 failed。
- P0 Electron 实际点击确认，并通过真实 `listClipCandidates` 读回 `confirmed`；测试使用隔离 userData。
- 工作台定点矩阵：4 files / 73 tests；异步专项：2 files / 35 tests；均通过。
- 检查器证据回链：5 files / 42 tests；snapshot → `listCandidates()` → `.r5-note` 事实摘要通过；1440×900/1280×720 current P0 截图通过。

## 后续允许依赖

- Phase 26 可基于 confirmed + current published snapshot 处理候选池、批量导出和完成报告缺口。
- Phase 26 不得改变本阶段的工作台键盘、播放、微调、切集或媒体会话语义；若确需改变 V49 页面，必须另立迁移卡并获得用户确认。
- 隐藏语义盲验仍属于 Phase 29，不回改本阶段工作台状态合同。
