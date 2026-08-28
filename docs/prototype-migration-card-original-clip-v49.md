# 原型迁移卡：V49 `screen-clip` 静态夹具基线

## 状态与本轮边界

- 状态：**静态夹具基线已完成并冻结；未启动真实运行时迁移或视觉验收**。
- 本卡只覆盖 V49 的第一静态夹具：`screen-clip`（原剧切片候选工作区）。候选池、完成报告、字幕和其它屏幕均不在本卡范围。
- 已完成交付是“静态夹具基线”：在真实 Electron renderer 的隔离 iframe 内，以 V49 原型自身结构渲染第一屏，且不绑定真实剧目、分集、候选、媒体、IPC 或运行时桥接；该夹具保持冻结，不重建、不回跑历史视觉流程。
- 静态夹具完成不授权真实数据绑定、候选池、完成报告、其它屏幕、V49 视觉验收、门禁迁移、打包或发布。

## 唯一设计源与迁移分类

- 当前唯一全产品设计源：`design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`。
- SHA-256：`C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。
- 同目录 README、handoff、reuse matrix 和 artifact 仅作来源追溯；它们的“仅扩展 screen-clip”描述不能缩减 V49 HTML 作为全产品当前源的范围。
- Version 48 及其合同、截图、审计和差异台账均为历史追溯，不能作为本卡的视觉、DOM 或验收基线。
- 迁移分类：**全屏迁移的第一屏静态夹具**。V49 已取代旧版本作为应用壳和页面坐标系的唯一当前源，因此不得把旧壳写为“已验收的继承外壳”。

## 第一屏目标状态与固定条件

| 状态 | 原型触发条件 | 本轮用途 |
| --- | --- | --- |
| 默认候选已选 | V49 `screen-clip` 默认初始态 | 结构夹具必需状态。 |
| 前后审阅 + 倍速浮层 | `?v49preview=context-speed` | 原型已有控制层与浮层的夹具状态。 |
| 媒体不可读 | `?v49preview=missing` | 原型已有的媒体缺失状态。 |

- 目标视口：1440×900、1280×720，缩放 100%。
- 本轮不采集截图、不运行 `audit:fidelity`，因此以上状态均不得写为已完成视觉验收。
- 夹具阶段只检查原型节点可被完整隔离和呈现；DOM 断言、类型检查与单测仅证明结构入口，不替代视觉结论。

## 静态 DOM 所有权与必需节点

静态夹具必须直接来自 V49 HTML 的脚本生成结构，至少包括：

- `#screen-clip` 及其 V49 应用壳、页面容器和滚动边界；
- `[data-od-id="clip-monitor-media"]`；
- `[data-od-id="clip-monitor-transport"]`；
- `[data-od-id="clip-review-range"]`；
- `[data-od-id="clip-boundary-nudges"]`；
- 缺媒体态的 `.clip-media-missing` 与提示。

静态夹具仅允许原型隔离、原型自身脚本和原型自身展示交互。不得注入运行时监视器样式、替换原型节点、绑定真实数据或调用 `bindOriginalClipWorkspaceRuntime`。

## 明确禁止项

- 不新增波形、帧号、帧级步进、常驻音轨、多轨时间线、工程级剪辑面板、AI 日志或技术仪表盘。
- 不复制静态示例中的剧目、候选、媒体、计时逻辑作为真实数据模型。
- 不建立 V49 设计合同、证据目录、脚本门禁，不启动视觉验收，不修改或回跑已冻结的 SUP-011。

## 本轮验收与冻结条件

- 静态夹具可由明确模式加载，默认真实工作区不受影响：**通过**。
- 静态夹具不执行 `bindOriginalClipWorkspaceRuntime`，也不包含其 `original-clip-runtime-monitor-style` 覆盖：**通过**。
- 定点测试验证三种原型状态所需节点和缺媒体结构：**通过**（2 个文件、18 项）；`pnpm run typecheck` 与 `git diff --check`：**通过**。后者只有既有 LF→CRLF 警告，无空白错误。
- 静态夹具阶段的独立 Code Review Stage 1/2：**通过**，无 HIGH/MEDIUM。该阶段未启动视觉验收、V49 合同/证据/门禁、真实数据绑定或下一屏。
