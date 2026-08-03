## 历史受控样本记录（不构成本轮验收）

日期：2026-07-21
范围：历史 Product-Spec v1.4 的 P1 AI 二创与 P2 AI 短剧解说受控本地样本；P2 当前暂缓。

## 结论

本报告只记录本地受控实现、契约与隔离媒体测试。没有配置或调用真实供应商，不能将以下结果解读为云端质量、成本或跨区域传输的验证。

| 指标 | 受控结果 | 证据 |
|---|---:|---|
| P1 时间码可定位 | 通过 | `timeline-service.test.ts` 与 `remix-export-service.test.ts`：草稿证据映射至原片时间段，并由 FFmpeg 导出。 |
| P1 低置信度不凑草稿 | 通过 | `controlled-remix-executor.test.ts`：低置信度只返回“暂无推荐”。 |
| P2 旁白事实一致与来源可追溯 | 通过受控样本 | `narration-service.test.ts`：文案由 `ai_evidence.summary` 生成，每段写入 evidence ID、草稿 ID、旁白资产、目标时长与时间码。 |
| P2 无证据/低置信度不输出旁白 | 通过 | `narration-service.test.ts`、`ai-safety-and-cost.spec.ts`。 |
| P2 成本与音色边界 | 通过受控样本 | `narration-service.test.ts`、`ai-safety-and-cost.spec.ts`：任务前检查 `perRequest` 上限；仅接受 `general-mandarin`；不发送网络请求。 |
| P2 审核交接与导出报告 | 通过受控样本与隔离 Electron | `narration-service.test.ts` 断言普通和冲突插入时间线；`AiReviewTimelinePage.test.tsx` 覆盖旁白轨检查/编辑；`p2-narration-workflow.spec.ts` 覆盖字幕证据→冲突插入→确认→FFmpeg 导出→任务报告。 |

## 受控故障矩阵

`timeout`、`cost-limit`、`failure` 都会把解说任务写为 `failed`，记录停止检查点与失败原因，且不写 `narration_segments` 或把结果显示成成功。`low-confidence` 与无证据返回 `no-recommendation`，不生成旁白资产。

受控旁白资产长度等于用户选择范围的下限，草稿画面计划同样填满该目标时长。冲突插入模式将固定轨道安排为“旁白前段 → 带来源时间码的原片冲突 → 旁白后段”；旁白复用固定音效轨，不新增轨道，仍可调整位置、音量和淡入淡出。该资产是明确标注的静音受控占位，不代表真实 TTS 音质。

## 外部前提

- 真实 TTS/文本分析供应商尚未启用；需要用户在设置中保存密钥、区域、价格、模型与端点后，再单独执行真实供应商验证。
- 大陆到境外的任何切换仍必须获得单次确认；当前受控实现不上传素材，因而没有发生跨区域传输。
- 真实质量门槛（P1 有效草稿率、P2 事实一致率）需在不含真实剧集的评估集和经授权的实际批次上另行统计。
# 2026-07-26 当前范围说明

本轮只验收 P1「爆点前置二创」的受控本地闭环。P2 解说、TTS 与旁白工作台已明确暂缓：不开放路由、preload IPC、可执行任务或成果入口，也不纳入本轮通过结论。下文关于 P2 的内容仅为历史受控样本记录，不构成当前可用或已验收的声明。

# P1 受控评估报告
