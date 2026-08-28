# Phase 23：切片证据基础与真实样本基线执行记录

> 执行日期：2026-08-21。范围只覆盖证据包、跨源语义关联、媒体指纹/PTS、资格门禁和分层样本基线；不修改 V49 页面，也不启动候选池/报告视觉迁移。

## 当前结论

Phase 23 已完成。本地短夹具、公开完整集和隐藏完整集形成了分层证据：真实 `dev-01`、`dev-02` 均完成 OCR、腾讯云 ASR、跨源语义事件、证据包和候选资格链；6+2 冻结样本完成媒体指纹/PTS 与隔离治理；短夹具证明未闭合冲突不能进入自动候选。

## 已核验部分

| 目标 | 结果 | 证据 |
| --- | --- | --- |
| 6 个公开 + 2 个隐藏样本路径和 SHA-256 | 通过 | `pnpm run verify:clip-evidence-baseline` → `CLIP_EVIDENCE_BASELINE_OK version=1 public=6 hidden=2` |
| 版本化证据包、同源媒体指纹、可读 PTS、无候选副作用 | 通过 | `$env:SHORTDRAMA_REAL_EVIDENCE_BASELINE='1'; pnpm exec vitest run src/main/services/real-clip-evidence-baseline.test.ts` → 1 passed；临时 SQLite/目录退出后清理 |
| 任务恢复、部分成功、媒体指纹漂移阻断 | 通过 | `$env:SHORTDRAMA_REAL_EVIDENCE_GOVERNANCE='1'; pnpm exec vitest run src/main/services/real-clip-governance-evidence-baseline.test.ts` → 1 passed |
| 真实 FFmpeg/ffprobe 导出边界和成果回链 | 通过 | `$env:SHORTDRAMA_REAL_EXPORT_EVIDENCE='1'; pnpm exec vitest run src/main/services/real-clip-export-evidence-baseline.test.ts` → 1 passed |
| 无云端授权时 ASR 安全阻断 | 通过 | `$env:SHORTDRAMA_REAL_ASR_PREFLIGHT='1'; $env:SHORTDRAMA_REAL_ASR_PREFLIGHT_SAMPLE_ID='dev-01'; pnpm exec vitest run src/main/services/real-asr-evidence-preflight.test.ts` → 1 passed |
| 证据包、语义关联、字幕质量定点回归 | 通过 | `pnpm exec vitest run src/main/services/clip-evidence-package-service.test.ts src/main/services/semantic-event-alignment-service.test.ts src/main/services/subtitle-evidence-service.test.ts` → 3 files / 29 tests passed |
| 类型检查与构建 | 通过 | `pnpm run typecheck`；`pnpm run build`；`VERSION_CHECK_OK version=0.1.92`；`RENDERER_MODEL_STUDIO_BOUNDARY_OK scripts=1` |
| 基线注册表和 current 引用门禁 | 通过 | `pnpm run validate:baseline-registry` → `baseline registry valid: 6 entries, 5 domain pointers`；`pnpm run validate:current-references` → `current reference boundary valid: 3 active docs use the current design pointer` |
| `dev-01` 真实 ASR/跨源证据 | 通过 | OCR 25、ASR 23、`ResultFormat=3`、14 个语义事件/可用锚、14 个候选范围、证据包 `ready`、生产库写入 0 |
| `dev-02` 真实 ASR/跨源证据 | 通过 | OCR 23、ASR 51、`ResultFormat=3`、51 个语义事件/可用锚、44 个候选范围、证据包 `ready`、生产库写入 0 |
| `dev-01` 真实候选资格 | 通过 | 1 条候选、`qualified_with_limit=1`、`blocked=0`、任务进入 `reviewing`、生产库写入 0 |
| `dev-02` 真实候选资格 | 通过 | 1 条候选、`qualified_with_limit=1`、`blocked=0`、任务进入 `reviewing`、生产库写入 0 |
| 最终定点回归 | 通过 | 10 files / 72 tests passed；类型检查与构建均通过；四套 CLI 非法结果路径均在 10 秒内以退出码 1 脱敏收口；当前 dispatcher 的 `dev-01` 真实冒烟通过；当前构建与真实运行的命令、退出状态、摘要和 SHA-256 见 `docs/phase-23-evidence/run-manifest-20260821.json` |

## 分层结论与限制

- 短夹具已经证明 `n:m` 对齐、画面来源时间冲突、C 级证据排除和 blocked 资格门禁；它不冒充真实完整集结果。
- `dev-01`、`dev-02` 是公开完整集真实结果；两者当前都得到 `qualified_with_limit`，没有得到 `qualified`，因此保留受限资格语义。
- `dev-02` 的冻结场景卡原标为 `ocr-asr-conflict`，但本次真实运行 `blockedConflictCount=0`。该样本没有触发未闭合冲突，场景卡结论标为不成立；不能为了满足预设而制造冲突。
- 隐藏样本只用于冻结指纹、PTS、治理和后续盲验；本阶段不读取隐藏集字幕/语义结果进行调参。`cross-window-event`、`visual-review-unclear` 等最终隐藏场景质量结论留给 Phase 29。

## 影响范围

本轮实际修改了 Phase 23 隔离验收入口及其直接适配器：`src/main/services/packaged-real-asr-evidence.ts`、`packaged-real-semantic-evidence.ts`、`openai-compatible-clip-semantic-adapter.ts` 及测试；将四套证据 CLI 抽到 `src/main/packaged-evidence-dispatcher.ts`，将 P0 任务恢复/通知逻辑抽到 `src/main/p0-task-runtime.ts`，并由 `src/main/index.ts` 接线。未修改 V49 HTML、UI/CSS、路由、IPC 合同、数据库 schema 或用户数据；工作树中其它既有 dirty 源码均不属于本轮。

`DEV-PLAN.md` 在进入本轮前已包含工作空间治理和路线图重排等大范围 dirty 文档变更；本轮只在“当前队列”更新 Phase 23 状态，并在 Phase 23 章节追加完成状态。其余 DEV-PLAN diff 不计入本轮 Phase 23 实现范围。

## 可复跑命令

以下命令在项目目录执行。Windows PowerShell 运行前需保持 UTF-8 环境；真实样本测试只写隔离临时 SQLite/目录，并在退出时清理。

```text
pnpm run verify:clip-evidence-baseline
$env:SHORTDRAMA_REAL_EVIDENCE_BASELINE='1'; pnpm exec vitest run src/main/services/real-clip-evidence-baseline.test.ts
$env:SHORTDRAMA_REAL_EVIDENCE_GOVERNANCE='1'; pnpm exec vitest run src/main/services/real-clip-governance-evidence-baseline.test.ts
$env:SHORTDRAMA_REAL_EXPORT_EVIDENCE='1'; pnpm exec vitest run src/main/services/real-clip-export-evidence-baseline.test.ts
$env:SHORTDRAMA_REAL_ASR_PREFLIGHT='1'; $env:SHORTDRAMA_REAL_ASR_PREFLIGHT_SAMPLE_ID='dev-01'; pnpm exec vitest run src/main/services/real-asr-evidence-preflight.test.ts
pnpm exec vitest run src/main/services/clip-evidence-package-service.test.ts src/main/services/semantic-event-alignment-service.test.ts src/main/services/subtitle-evidence-service.test.ts
pnpm run typecheck
pnpm run build
pnpm run validate:baseline-registry
pnpm run validate:current-references
```

## 实际修复

- 修复 `packaged-real-asr-evidence.ts` 和 `packaged-real-semantic-evidence.ts` 在开发环境把 OCR runner 显式置空的问题，改为复用固定的项目内 Python/runner 解析；打包环境仍使用原有资源解析。
- 为 ASR 隔离入口增加不泄密的失败阶段码，只暴露 `setup/media/ocr/asr/evidence`，不输出密钥、字幕正文、媒体路径或供应商原始响应。
- DeepSeek 兼容端在接受 `response_format` 却返回空 `content` 时，只允许一次不带该提示的重试；后续仍经过相同 JSON、schema、窗口、本地 ID、时间顺序、连续性和资格门禁。
- 四套隔离证据 CLI 的结果路径解析统一进入脱敏异常收口；非法相对路径不再产生未处理 Promise、源码堆栈或挂起，并以退出码 1 结束。
- Baseline v1 的真实候选资格被固定为 1 条 `qualified_with_limit`、0 条 `qualified`、0 条 `blocked`；资格漂移会让验收失败，不能把 `qualified` 当作本基线通过。

## 下一步

Phase 24 可以消费本阶段冻结的证据包、真实候选资格和失败门禁；不得回改 Phase 23 的原始 cue、PTS、媒体指纹或资格结果。`dev-02` 冲突场景卡需要在未来新基线版本中重新选取真实能触发该场景的样本，不能覆盖 Baseline v1。
