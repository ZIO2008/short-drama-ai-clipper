# 设计交接与视觉验收门禁

本文件替代“有 HTML、有截图、测试通过即可称为匹配”的做法。任何涉及 UI 的开发、候选包或 closure 都必须满足本门禁。

## 1. 输入门禁

唯一设计源必须在 Open Design 项目库中可追溯，并且同一版本目录内同时具有：HTML 入口、`artifact.json`、`design-brief.md`、`Product-Spec.md`。设计合同记录项目 ID、版本、SHA-256、页面和状态清单。

`docs/design-contract-v48.json` 仅在 HTML、artifact、`Design-Brief.md`、`Product-Spec.md` 都从同一 Open Design 项目库镜像且 SHA-256 可复核时才可标为 `ready`。项目级 Brief/Spec 与 Version 48 HTML 冲突时，HTML 是页面视觉和交互的最终裁决源；合同就绪不放宽下文的项目库预览和逐状态视觉证据要求。

## 2. 实现顺序

1. 校验设计合同；读取项目库预览、两份设计文档和状态清单。
2. 先将原型的页面结构、层级、token、滚动容器、按钮顺序和模态关系嵌入既有应用壳；此时不接业务数据。
3. 以确定性 SQLite fixture 替换演示数据，再接入 IPC。
4. 为每个状态实现 `loading → loaded | error`，请求须有 ID 或取消机制；空数组和旧请求结果不得被解释成业务状态。
5. 逐屏生成 Open Design 项目库预览基线与 Electron 截图，再做像素/区域差异和交互核验。

## 3. 验收门禁

每个 `screen × state × viewport` 必须有：原型项目库预览、Electron 截图、生产代码位置、可重复数据 fixture、自动化交互断言和允许差异说明。

以下结果一律失败，不得写入“匹配”或 release closure：缺少原型基线、仅有当前应用截图、`data-variant` 未逐区域说明、`historical-reference-unavailable`、只验证标题/按钮存在、只验证无横向溢出。

允许差异仅限真实本地数据、系统原生对话框、安全提示和明确的 P2 冻结态；差异须由用户确认并写入合同，不能由开发者自行豁免。

## 4. 交付前检查

运行 `pnpm run validate:design-contract`。该检查失败时，禁止执行 UI 相关 release closure。通过后依次运行状态 E2E、视觉差异检查、独立设计审查和代码审查。
