# Open Design 设计保真证据 — v0.1.21

来源：`tests/e2e/p0-workflows.spec.ts` 与 `tests/e2e/p1-remix-workflow.spec.ts` 的隔离桌面端到端流程。每张截图均在真实 SQLite 状态、真实本地媒体或真实任务服务状态下生成；不使用 Open Design 中的演示业务数据。

## 覆盖范围

- 应用框架与剧目库：`p0-library-*`、`p0-library-populated-*`。
- 工作区：`p0-assets-*`、`p0-production-*`、`p0-stitch-config-*`、`p0-clip-*`、`p0-results-*`。
- 全局页面：`p0-tasks-*`、`p0-tags-*`、`p0-settings-*`。
- 供应商独立页：`p0-asr-provider-page-*`、`p0-text-analysis-provider-page-*`、`p0-multimodal-review-provider-page-*`。
- P1 二创闭环：`p1-ai-remix-*`、`p1-review-timeline-*`；在 1280×720 下断言“开始分析剧情”和“导出设置”仍可操作，并验证公开 preload 能力列表不含 `tts`、不存在 `createNarrationTask`。

每个 `*` 都包含 `1440x900` 和 `1280x720` 两个 PNG。P0 流程还断言 1280×720 无横向溢出；ASR 页额外断言当前能力草稿、费用/质量/难度三个详细筛选和保存操作可用。其余交互、异常和安全行为由同一流程及单元测试验证。

## 已记录的受控差异

- 外部资料使用经验证的 IPC 交给系统默认浏览器，不使用应用内页面。
- 文件选择使用系统原生选择器。
- P2 解说/TTS/旁白仍是原型未来态；本证据目录没有对应生产页面，因为它没有生产导航、preload、IPC、供应商目录或执行入口。
