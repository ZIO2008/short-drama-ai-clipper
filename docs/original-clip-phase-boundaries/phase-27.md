# Phase 27 边界记录：完成报告、成果回链与异常处置

## 结论

核心报告业务完成并通过验收；V49 完成报告页面迁移延期，不在本 Phase 修改页面结构。

## 已完成范围

- 报告读取最近一个已结束批次，覆盖成功、失败、取消和未输出逐候选事实。
- 导出配置快照、候选分集与源时间范围快照随批次保存并展示摘要。
- 成果通过批次记录的 `materialId` 回链；成果不存在时保留事实原因。
- 删除候选后，报告仍保留该批次的历史事实和原分集归属。
- 异常筛选覆盖失败、取消和未输出；报告读取失败显示未知态，不伪装成零值或无批次。
- 损坏 manifest 被隔离为读取错误；旧数组格式 manifest 继续兼容读取。
- 未修改候选池、导出模态、报告页面布局或 V49 静态 HTML。

## 验证证据

- 定点 Vitest：2 files，34 tests passed。
- 全量 Vitest：123 files passed，705 tests passed，5 skipped。
- TypeScript strict typecheck：通过。
- Electron/Vite build：通过，renderer boundary 校验通过。
- `rebuild:node` 与 `rebuild:electron`：通过。
- 当前 Electron E2E：`original-clip-pool-export-report.spec.ts` 1 passed。
- 独立 code review：Stage 1 PASS、Stage 2 PASS，HIGH=0；仅记录新 manifest 三个范围字段应成套校验的非阻断建议。

## 后续允许依赖

Phase 28 可基于本 Phase 的批次事实、成果回链和损坏数据隔离，继续做恢复、压力、隐私与数据安全收口。V49 候选池/报告页面迁移仍需另行确认，不自动启动。
