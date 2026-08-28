# Phase 26 边界记录：候选池、批量导出与成果登记

## 结论

核心业务完成；页面配置分支延期。Phase 27 只消费已冻结的候选、批次和成果合同，不回流重做 Phase 26。

## 已完成范围

- 候选池按真实状态筛选、搜索、跨集隔离和 20 行窗口化；压力夹具覆盖 100 集 × 50 候选（5,000 条）与 500 条待导出。
- 删除仅作用于安全候选状态；导出中/已导出候选受保护，不删除源片或既有成果。
- 导出预检、输出目录、质量/码率/目标大小/FPS/包装、批次进度、取消、失败、重试和 FFmpeg 最终校验。
- 成果通过 `candidateId/taskItemId` 回链；失败输出清理、成果不登记；导出前后源片 SHA-256 不变。

## 证据

- `tests/current/original-clip-pool-export-report.spec.ts`
- `src/main/services/clip-export-batch-outcome.test.ts`
- `src/main/services/clip-export-recovery.test.ts`
- `src/main/services/clip-export-integrity.test.ts`
- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.pressure.test.ts`
- Phase 26 独立审查 Stage 1/2：PASS（核心业务范围）。

## 明确延期

用户明确跳过 V49 页面修改分支：

- 不增加候选池显式加入/移出待导出、全选/清空控件；
- 不增加导出模态的命名规则、字幕策略、同名策略控件；
- 不修改 V49 静态 HTML、页面结构、布局或视觉合同。

因此当前导出入口仍自动收集全部 `confirmed` 候选；页面不暴露后端完整导出配置。

## 允许依赖方

Phase 27 可读取最新真实导出批次、候选和成果，补齐报告异常与回链边界；不得借此重新打开候选池/导出视觉迁移。
