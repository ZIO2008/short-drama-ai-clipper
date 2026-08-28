# Phase 24 边界：受控候选生成与任务快照

> 状态：已完成。后续阶段只能消费稳定发布 pointer、候选 snapshot 和任务 checkpoint；不得绕过资格、轮次、媒体指纹或冻结 provider 重放生成。

## 冻结输入

- Phase 23 `evidence-v5`、`semantic-event-v1`、媒体指纹与真实 PTS 边界。
- Product Spec：CLIP-019、CLIP-021、CLIP-025–031、CLIP-036、CLIP-038–040。
- 生成请求：原始分集请求、eligible 分集、证据包 ID/版本/媒体指纹/规则版本、文本语义与可选视频复核 provider chain（profile/secretRef/模型/端点/地区/超时/价格）和资源预算。

## 已完成合同

- 同输入活动任务只在完整请求、eligible 包身份和文本/视频 provider chain 全相同时去重；证据或任一 provider 变化创建新轮次或在 adapter 调用前阻断。任务创建时未冻结视频 provider 的旧任务也不能在排队后临时启用。
- 混合分集只冻结 preflight eligible 包；不可用媒体、证据不足、无文本语义能力和未就绪 package 在 provider 调用前阻断。
- 历史缺轮次队首明确失败后队列继续；pending 关机后可恢复，running provider 调用转 `interrupted` 且不自动重放；关机期间不会领取下一个 pending。
- 启动顺序先隔离不可重放的智能生成，再执行通用 TaskQueue checkpoint 归一化。
- 发布前强制验证 task/candidate/round/config/provider/package/episode/qualification、semantic-event A、scene-anchor B、summary 与 planned range，并按生产三位小数规则从冻结 evidence PTS 还原边界。
- 低轮次迟到结果终结为 obsolete/failed；取消、中断、媒体指纹漂移、伪造高轮次和事务中途失败均不改变稳定 pointer，也不留下部分 snapshot/member。
- packaged 进程启动时以 Windows 大小写不敏感规则清除全部 `SHORTDRAMA_MATERIAL_E2E*`；夹具仅在 unpackaged + `e2e` channel + 明确 opt-in 时可用。

## 页面与视觉边界

- Phase 24 没有修改 V49 `screen-clip` 页面布局、路由或 IPC 合同。
- current Electron 隔离流程继续通过既有 preload/IPC 生成并读取真实候选，不直接写 `task_items`、snapshot 或 pointer。
- 验证期间发现腾讯 ASR 双凭据节点被隐藏；本轮只修复当前 `v2026-08-05-asr-default-configuration` 页面运行时 DOM 所有权，没有启动 V49 provider 页面迁移。双视口证据与真实来源见 `docs/prototype-migration/provider-credentials-v49-phase24.md`。

## 最终验收证据

- 全量 Vitest：116 files passed、5 skipped；679 tests passed、5 skipped。
- TypeScript strict typecheck、Electron/Vite build、renderer Model Studio 边界、baseline registry、current reference 和 Playwright suite boundary 均通过。
- current Electron：14 passed、6 个依赖真实打包 EXE/DPI 的条件用例 skipped，0 failed；候选生成、候选池/导出/报告、provider、字幕、P1/P2 current 边界均保持隔离。
- 当前构建真实 `dev-01` 语义候选：OCR 25、ASR 23、证据包 `ready`、任务 `reviewing`、1 条 `qualified_with_limit`、0 条 `qualified`、0 条 blocked、生产数据库写入 0；脱敏结果 SHA-256 `49ADCCD67B380B54F1C7C2DE3E0DF6D06DB227A92F256CCFECA4DBF5F5B63999`。
- 最终真实语义结果与 Phase 23 冻结结果一致；没有把受限候选改写为完全 qualified。

## 后续允许依赖

- Phase 25 可读取当前稳定候选、资格、任务阶段和失败恢复方向，处理工作台审阅/确认缺口。
- Phase 26 可在稳定 snapshot 与确认授权之上处理候选池、导出与报告；不得直接发布旧轮次或未冻结候选。
- 隐藏样本最终语义盲验仍属于 Phase 29；不得用隐藏结果回调 Phase 24 的请求键、资格或发布规则。
