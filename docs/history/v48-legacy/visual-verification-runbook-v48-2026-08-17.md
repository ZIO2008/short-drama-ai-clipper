# V48 单向视觉验收运行卡（2026-08-17）

## 用途与边界

本文件把 Phase 17–20 的 Version 48 视觉验收拆成不可倒退的串行关卡。它不改变产品需求、设计源、生产代码或 Open Design 文件；只规定证据如何产生、命名、冻结和复用。

- 设计源：运行中 Open Design 项目库的 `short-drama-material-studio-v48-capture-source.html`。
- 源版本：历史 `v52`，`sourceVersionId=0052-50235135-47be-46cc-9c8b-8f27d047bb21`。
- 源 SHA-256：`D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。
- 合同：`docs/design-contract-v48.json`，13 屏 / 47 状态 / 2 视口，共 94 项。
- 视口：仅 `1440×900`、`1280×720`；缩放、裁切或重采样图不可作为设计基线。
- 禁止：改写 V48/V49/当前主文件、用本地 HTML 直渲染或 Electron 图冒充项目库设计基线、为截图造状态或补 UI。

## 单向规则

1. 每次只执行一个关卡；未通过只停留在该关卡，绝不顺手启动后续任务。
2. 通过后写入本文件和 `docs/phase17-20-evidence-ledger-2026-08-17.md`，并标记冻结输入。
3. 已冻结的关卡默认复用，不因其他屏幕、业务测试或后续视觉差异而重跑。
4. 只在以下输入变更时重验对应关卡：V48 镜像 SHA / 设计合同、该屏幕的运行时结构或 fixture、该屏幕 Electron 对照代码。其他输入变化不触发回退。
5. 任一新增文件必须位于既定证据路径，并具备可读 metadata，写明用途、来源、屏幕、状态、视口、生成时间和 SHA；不创建无用途的临时交付物。

## 串行关卡

| 关卡 | 仅做这一件事 | 通过条件 | 失败时的唯一动作 | 状态 |
| --- | --- | --- | --- | --- |
| G0 | 冻结范围和来源 | 本卡、合同、镜像 SHA 和禁止项一致 | 修正文档或镜像标识，不采集、不改代码 | 已通过 |
| G1 | 验证项目库原生精确视口采集通道 | 从内置 Open Design 得到一张可复核的 `1440×900` 原始 PNG；不计入 94 项 | 只排查采集通道 | 未通过 |
| G2 | 编制 47 状态映射 | 每状态有项目库交互前置条件和 Electron fixture/test 名称 | 只补映射，不截图、不改 UI | 待执行 |
| G3 | `screen-library` 证据包 | 3 状态 × 2 视口的项目库图、Electron 图和 metadata 完整；差异闭环 | 只修复/重采本屏 | 待执行 |
| G4–G14 | 其余 12 个屏幕证据包 | 一个屏幕包完成后立即冻结，再进入下一个 | 只修复/重采当前屏 | 待执行 |
| G15 | 总审计 | `audit:fidelity` 为 `completed=94, incomplete=0` | 只列出未完成的屏幕包并回到该包 | 待执行 |

## 固定证据命名

每个正式状态只能写入：

`docs/design-evidence/v48/<screen>/<state>/<width>x<height>/`

其中只允许下列三个交付文件：

- `project-library-preview.png`：内置 Open Design 项目库原生预览。
- `electron.png`：同状态、同视口的 Electron 实际图。
- `evidence.json`：上述两图的来源、SHA、fixture、test、comparisonRegions、允许差异与采集时间。

采集能力探针不进入上述路径；它们必须存放在临时目录，成功后删除，失败只记录到证据台账。

## G0 验收记录

- 完成时间：2026-08-17。
- 已核验：只读镜像的 SHA-256 与合同一致；镜像、artifact metadata、说明文件均为 `ReadOnly`。
- 当前明确阻塞：内置 Open Design 的可见预览宽度约 1065 CSS px，浏览器通道禁止临时改宿主尺寸；内置“导出为图片”尚未产生可落盘、可校验的图像。
- 下一步只做 G1：找到或否定“内置 Open Design → 原生 1440×900 PNG”的可复核通道。通过前不采集状态、不改产品代码、不运行 `audit:fidelity`。

## G1 验收记录（未通过）

- 已核验：Codex 内置浏览器可读取项目库镜像 iframe，但其可截图 API 不支持元素级截图；报错为 `playwright_element_screenshot` 不支持。
- 已核验：内置 Open Design 的项目库导出端点为 `/api/projects/<id>/export/image`，可接收 `width` 与 `height`。以 `1440×900`、镜像文件名、`deck=false` 调用时返回 `502 Bad Gateway`，即 Codex 承载未提供可用的离屏渲染器。此前一次 JSON 格式诊断响应已保留为临时、明确标记的 `C:/Users/ZIO/AppData/Local/Temp/od-v48-g1-failed-http-400-invalid-json-response.html`；它不是图像、不是证据、也不在项目或证据目录内。
- 结论：现有 Codex 内置通道不能取得项目库原生 `1440×900` PNG。G1 不通过；不得继续 G2–G15，也不得以缩放截图、HTML 直渲染、历史附件或 Electron 图替代。
- 未做：没有回退到独立 Open Design 客户端、没有改变镜像、没有启动 G2 及之后任何关卡。
