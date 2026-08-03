# P0/P1 交付验收矩阵

> 版本治理更新：本文件中的历史目录包引用只用于追溯，不构成当前工作树验证。当前已交付 `v0.1.28-p1-internal-trial`；v0.1.26 有 P2 provider 配置面缺口，v0.1.27 有 P2 历史时间线结果面缺口，均不能作为最新入口。EXE、manifest、哈希和包级验证见 `docs/v0.1.28-p1-internal-trial-closure.md`；P2 仍不可达。`v0.1.23` 仅为缺少 closure 的历史候选；`v0.1.24` 是已确认漏打 SQLite 原生绑定的失败候选；`v0.1.25` 是本轮修复前的历史候选；三者均不得作为最新入口。

日期：2026-07-26
范围：P1 爆点前置二创闭环；P2 解说/TTS/旁白暂缓。

## P0 历史能力：本轮只复核可复现缺口

| 范围 | 本轮证据 | 结论 |
|---|---|---|
| Phase 1–10、18 | `docs/p0-internal-trial-report.md`、根目录 `DEV-PLAN.md` 与既有 `release-v1.11-p0-r3` 目录包 | 历史试点/目录包证据保留；未重写。 |
| 创建、资产、拼接、原切片、成果与设置流程 | `tests/e2e/p0-workflows.spec.ts` | 隔离 Electron 全流程通过。 |
| 85 集内部滚动 | `tests/e2e/long-asset-scroll.spec.ts` | 100% / 125% / 150% DPI 均可到达最后一行。 |
| Windows 包 DPI | `tests/e2e/packaged-real-dpi.spec.ts` | 100% / 125% / 150% 通过。 |

本轮修正了两个可复现的测试/布局缺口：编辑弹窗固定为 620×534，内容区内部滚动；封面断言同时覆盖占位封面和自动生成代表帧。

## P1 本轮交付

| Phase | 验收项 | 证据 |
|---|---|---|
| 11 | 多能力边界与无密钥受控本地模式 | `src/main/index.ts` 仅注册 `asr`、`text-analysis`、`multimodal-review`；未暴露 TTS。 |
| 12 | 本地证据、受控分析、任务时限与恢复 | `AiAnalysisService`、`AiTaskLifecycleService`、`tests/main/ai/*.test.ts`。 |
| 13 | 草稿、证据、评估与审核时间线 | `TimelineService`、`AiRemixWorkspacePage`、`AiReviewTimelinePage` 与对应单测。 |
| 14 | 仅人工确认后导出、可追溯成果 | `RemixExportService` 与 `tests/e2e/p1-remix-workflow.spec.ts`：字幕导入 → 受控分析 → 审核 → 设置目录 → 确认 → FFmpeg 导出非空文件。 |
| 17（P1） | 回归、DPI、可访问性与视觉证据 | `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm test:e2e`、`pnpm audit:fidelity`。 |

## P2 暂缓边界

- 生产页 P2 卡片保持禁用。
- 没有 P2 路由、preload IPC、任务触发或成果入口。
- 旁白/TTS 源码或旧测试即使仍存在，也不等于功能对用户开放；相关测试保持排除。
- `tests/e2e/p2-freeze.spec.ts` 是强制执行的负向 Electron E2E：验证禁用未来卡、无导航、无 preload 叙事 API 与无叙事路由；历史正向 P2 测试继续排除，避免把冻结能力误当发布功能。

## 视觉审计口径

`pnpm audit:fidelity` 对 Phase 8 最终 Open Design 源执行 SHA、屏幕标识和桌面截图门禁。旧 2026-07-27 参考原型未作为可变发布输入保留，因此当当前 Electron E2E 截图存在而该退休参考不存在时，报告会明确标记 `captured-current-flow-historical-reference-unavailable`：它证明当前流程和固定视口截图已捕获，但不宣称不存在的原型像素对比已经发生。原旧切片图会标记 `superseded-by-final-open-design`，由 Phase 8 最终源的硬门禁取代。P1 审核页会标记 `captured-approved-runtime-layout`：用户已明确将重复的“审阅/确认”合并，真实媒体优先审核布局取代旧静态多轨演示图；其行为由 P1 Electron E2E 覆盖。其余剧目、通知、资产、拼接/包装配置和 P1 页面仍由隔离 Electron E2E 的布局几何、无障碍与真实流程硬断言覆盖；动态真实数据不得被伪造成静态像素基线。
