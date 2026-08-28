# Phase 23 边界：切片证据基础与真实样本基线

> 状态：已完成。后续 Phase 可消费本边界，不得修改其原始媒体、字幕 cue、PTS、证据资格或真实结果。

## 已冻结输入

- Product Spec：CLIP-009–CLIP-032、SUB-ASR-001–SUB-ASR-006。
- Baseline v1：6 个公开开发样本、2 个隐藏验收样本及其不可变 SHA-256。
- 规则：证据包 `evidence-v5`、语义关系 `semantic-event-v1`、字幕时间质量 `subtitle-time-quality-v1`。

## 实际完成

- 6+2 媒体基线的路径、SHA-256、同源指纹、PTS 和临时 SQLite 隔离通过。
- `dev-01`：OCR 25、ASR 23、14 个语义事件/可用锚、14 个候选范围；1 条 `qualified_with_limit` 候选。
- `dev-02`：OCR 23、ASR 51、51 个语义事件/可用锚、44 个候选范围；1 条 `qualified_with_limit` 候选。
- 两集均为 `ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready`、任务 `reviewing`、生产数据库写入 0。
- 当前构建身份、四次真实运行结果和最终 10 files / 72 tests 回归已冻结在 `docs/phase-23-evidence/run-manifest-20260821.json`；类型检查与构建均通过。
- 短夹具覆盖多源 `n:m`、时间冲突、C 级排除和 blocked 资格；缺失/冲突不能进入发布候选。
- 开发验收入口与工具运行时统一使用固定 OCR runner；DeepSeek 空 content 只受控重试一次，所有严格校验保持不变。
- 四套隔离证据 CLI 的非法结果路径统一脱敏收口并以退出码 1 结束；Baseline v1 资格门禁固定为 1 条 `qualified_with_limit`，不接受 `qualified` 漂移。

## 明确限制

- `dev-02` 本次真实 `blockedConflictCount=0`，所以 Baseline v1 的 `ocr-asr-conflict` 预设场景卡不成立；不得把 0 写成冲突通过。
- `qualified_with_limit` 不能改写成 `qualified`。
- 隐藏集只完成指纹/PTS/治理冻结，不用隐藏语义结果调参；最终盲验在 Phase 29。
- 本 Phase 未修改 V49 HTML、页面、路由、IPC 或用户生产数据。

## 后续允许依赖

- Phase 24 可读取已发布的证据包、真实候选资格、锚和任务快照合同。
- 后续若发现违反本边界的缺陷，只能建立定点修复卡；新场景样本必须创建 Baseline v2，不能覆盖 v1。
