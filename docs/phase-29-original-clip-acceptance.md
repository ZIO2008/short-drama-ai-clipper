# Phase 29 原剧切片真实样本验收记录

## 当前结论

Phase 29 已授权功能主线完成：文本语义 P0 的 `dev-01`、`dev-02` 通过，`dev-02` 人工审片确认、真实导出和报告回链通过，`hidden-01` 唯一盲验通过。视频复核 P1 已使用新冻结 package/candidate/snapshot/evidenceId/PTS 合同复验：`dev-04 supported`，`dev-03 unclear → blocked`。v2 证据治理经独立 Stage 1/2 审查通过，0 HIGH / 0 MEDIUM；旧未绑定结果继续只作历史能力探测。安装包打包和发布仍未授权。

## 已通过的分层证据

- 冻结基线清单 `docs/clip-evidence-baseline/manifest.v1.json` 中公开 6 集（dev-01～dev-06）和隐藏 2 集（hidden-01、hidden-02）全部完成证据包构建。
- 证据包测试使用临时 SQLite，确认 PTS 可读、来源指纹一致、证据包为 `ready`，且没有创建候选、字幕轨或导出批次。
- `dev-06` 真实 FFmpeg 导出在临时数据库和临时输出目录完成；输出时长、成果登记、导出批次和源片 SHA-256 均通过。
- 治理基线在真实公开/隐藏媒体上验证了冻结任务配置、证据包身份、候选发布、媒体指纹漂移阻断和零导出副作用。
- packaged-only 三能力无媒体预检通过：腾讯云 ASR、DeepSeek 文本语义和阿里云百炼视频复核均连接成功；正式配置数据库前后 SHA-256 均为 `09AE861290603E4CDB4161E808E774C894F115CA94F4F57E3915B1713D5390A0`。

## 2026-08-24 真实供应商执行结果

| 项目 | 结果 | 事实边界 |
| --- | --- | --- |
| 三能力无媒体预检 | 通过 | ASR、文本语义、视频复核均成功；正式库零变化 |
| `dev-01` 文本语义 | 未通过 | 一次在连续性硬门禁受控拒绝；闭合合同复验生成 1 条 `qualified`，但冻结预期为 1 条 `qualified_with_limit`，资格漂移被汇总门禁拒绝 |
| `dev-01` 文本语义（保护上下文修复后） | 通过 | OCR 25、ASR 23、1 条 `qualified_with_limit`、0 blocked、生产库写入 0 |
| `dev-02` 文本语义（保护上下文修复后） | 通过 | OCR 23、ASR 51、1 条 `qualified_with_limit`、0 blocked、生产库写入 0 |
| `dev-04` 最小视频复核 | 未通过 | 无媒体预检成功；真实帧级请求在非思考模式下仍被供应商 4xx 拒绝，脱敏分类为 `provider-request-rejected` |
| `dev-04` 临时 `qwen3.7-plus` 复测 | 未通过 | 不覆盖正式配置；供应商返回无法满足受限 JSON 结果合同，分类为 `invalid-result` |
| `dev-04` 旧严格 Schema 探测 | 已降级为能力探测 | 供应商曾返回 `supported`，但当时 package/evidenceId 为临时身份且取帧范围未绑定冻结候选；不得作为 P1 通过证据 |
| `dev-03` 旧严格 Schema 探测 | 已降级为能力探测 | 供应商曾返回 `unclear`，但同样未绑定冻结候选；不得作为 P1 正确阻断证据 |
| `dev-02` 单样本完整闭环 | 通过 | 文本候选经人工确认后真实 FFmpeg 导出完成；`materialId` 回链、报告 1 项、源片 SHA 不变、生产库写入 0 |
| `hidden-01` 文本语义唯一盲验 | 通过 | OCR 67、ASR 52、1 条 `qualified_with_limit`、0 blocked、生产库写入 0；未用于二次调参 |
| `dev-04` 冻结范围视频复核（2026-08-29） | 通过 | 稳定 package/candidate/snapshot/evidenceId，65.64–65.72 秒，5 帧，`supported`，正式库写入 0 |
| `dev-03` 冻结范围视频复核（2026-08-29） | 正确阻断 | 稳定 package/candidate/snapshot/evidenceId，32.16–32.24 秒，5 帧，`unclear → blocked`，正式库写入 0 |
| 公开 6 + 隐藏 2 矩阵 | 已封存 | 8 项身份、场景卡、运行次数、源片核验、正式库零写入和清理状态写入 v2 账本；全部按职责通过或正确阻断 |

所有真实调用均使用临时 SQLite/临时目录；每次调用后正式数据库 SHA-256 保持不变。文本 P0、人工审片闭环和视频 P1 冻结范围复验均使用独立成功证据封存。视频 P1 执行器只接受 `multimodal-scopes.v1.json` 中冻结的 package、candidate、snapshot、scene evidenceId 与实际 PTS；旧视频结果继续标记为 superseded。

完整 6+2 当前裁决见 `docs/phase-29-evidence/acceptance-ledger.v2.json`；新视频复验见 `run-manifest-20260829-video-bound.json`；旧视频能力探测见 `run-manifest-20260825-video.json`，其状态为 superseded。`run-manifest-20260824.json` 仅保留此前阶段性失败事实。

## 验证命令与结果

```text
SHORTDRAMA_REAL_EVIDENCE_BASELINE=1
src/main/services/real-clip-evidence-baseline.test.ts
1 test passed

SHORTDRAMA_REAL_EXPORT_EVIDENCE=1
src/main/services/real-clip-export-evidence-baseline.test.ts
1 test passed

SHORTDRAMA_REAL_EVIDENCE_GOVERNANCE=1
src/main/services/real-clip-governance-evidence-baseline.test.ts
1 test passed
```

## 延期与限制

- 视频复核 P1 已完成冻结候选范围的正负场景验收；后续扩大样本仍属可选，不改变人工审片兜底。
- 不是 8 个样本都需要逐集调用全部云服务：每个冻结场景按其职责验收；隐藏样本已经各执行一次并由封存账本阻止重复运行。
- 没有写入用户生产数据库，不修改源媒体；所有测试数据库、输出目录和诊断材料均为临时隔离目录。
- V49 候选池/报告页面迁移仍延期；本阶段没有页面结构、布局或静态 HTML 改动。
- 打包、发布需要用户另行授权，不在本阶段自动执行。
