# 原型迁移卡：DeepSeek 文本语义分析连通性验证

> 存储状态（2026-08-18）：本文提及的中间快照 `v2026-08-05-asr-tencent-connectivity/` 已按版本治理记录送入 Windows 回收站；其路径只保留为历史实施事实，不再是可执行设计入口。

## 来源与范围

- 原型来源：`design/open-design/v2026-08-05-provider-connectivity-deepseek-candidate/short-drama-material-studio.html`。
- SHA-256：`9B70AF6A528A8E4B72B823E8FD7A10F3BDC8BB85918FFF09C8C4909777E0BFE7`。
- 归档状态：`screens-v48-text-analysis/` 中的 `default`、`testing`、`success`、`failure`，固定在 `1440x900` 与 `1280x720`，Windows 100% 缩放。
- 目标入口：设置 -> 能力供应商 -> 文本语义分析；左侧常见方案补齐原型原生 `DeepSeek API` 候选卡，右侧保留“当前默认、测试当前配置、测试结果、保存并设为默认”。
- 迁移分类：屏内迁移。应用壳、设置总览、ASR、视频理解复核沿用已验收的 Version 48 隔离承载，证据见 `docs/prototype-migration-card-providers-v48.md`。

## DOM 与数据边界

- 运行时直接隔离承载新静态 HTML 原文；不将其 HTML、CSS、节点顺序或文案改写为 JSX/CSS。
- `DeepSeek API` 是 `textAnalysis.candidates` 的原型原生候选，沿用既有候选卡、费用筛选与 `data-use-provider` 预填节点；Bridge 不生成或重排该卡片。
- 允许 Bridge 写入的原型数据槽仅为：`text-analysis-current-default`、`test-current-text-analysis-configuration`、`text-analysis-connection-status`、`save-text-analysis-as-default`，以及原型既有草稿输入值。
- `endpoint`、`model`、`timeout` 显示当前已保存值或用户当前草稿；原型示例 `/v1`、`deepseek-chat` 只用于归档状态截图，不得覆盖运行时数据。
- 新原型内演示脚本的定时成功/失败、演示默认方案和演示保存行为必须在 document capture 阶段被 Bridge 阻断；生产状态仅由受限 IPC 返回值与当前草稿决定。
- 原型演示脚本把测试节点插在字段网格后，但同一版本的四态归档截图将其放在字段网格前。Bridge 只移动这两个脚本已创建的原节点到归档截图顺序；不新增 DOM、JSX 或样式规则。

## 固定空间规则

- iframe 外层、`html`、`body`、`#content` 和当前供应商屏幕不出现页面级纵向滚动；原型既有候选列表与右侧草稿内部滚动保持原样。
- DeepSeek 卡片位于左侧候选列表内部，查看该卡片只能滚动该列表，不得造成页面级滚动或挤压右侧草稿。
- 不为本轮新增 React 容器、局部样式覆盖、独立提示层或自定义状态布局。
- 新原型源只用于 `provider-text-analysis`；`settings`、`provider-asr`、`provider-multimodal-review` 必须继续使用 `v2026-07-30-open-design-final` 源。

## 真实行为接口

- “测试当前配置”只在文本语义分析草稿供应商为 `DeepSeek API` 时可操作，调用唯一的受限 preload IPC。
- 点击左侧 DeepSeek 卡片只复用既有预填路径，将供应商、区域、endpoint、model、超时与价格备注写入当前草稿；不保存 profile 或密钥、不测试 API、不上传业务素材。
- IPC 在主进程验证 `https://api.deepseek.com`（仅默认/443 端口、无内嵌凭据）和 1--600 秒超时；以当前草稿和临时密钥或受保护的既有密钥引用发出固定短非流式探测。非官方主机在读取保存密钥前即拒绝。
- 测试不保存 profile，不创建/替换 secret，不修改任一能力的默认方案；编辑 endpoint、model、timeout、密钥会使本次测试结果失效。
- “保存并设为默认”复用既有 profile 保存路径，只更新 `text-analysis` 默认 profile。保存状态与测试状态独立。

## 禁止项

- 不修改 `design/open-design/v2026-07-30-open-design-final/`，不接入真实剧情分析或任何业务素材上传。
- 不增加其它供应商、ASR、视频理解复核、P2 解说/TTS/旁白的测试入口，不增通用网络执行器、批量检查、自动重试或密钥管理页面。

## 验收证据

1. 静态夹具与 Electron 均提供两种视口的四态截图；视觉差异必须在接入真实网络前处理。
2. 自动化使用 mock，覆盖成功、网络/地址、鉴权、模型、429、5xx、超时、无泄密、不保存、默认隔离、编辑失效和非目标入口。
3. 最终执行目标回归、完整测试、typecheck、build、`git diff --check` 与独立审查；真实云端请求只允许由用户在工具内主动点击。

---

# 原型迁移卡：腾讯云 ASR 双凭据连通性验证

## 来源与范围

- 原型来源：`design/open-design/v2026-08-05-asr-tencent-connectivity/short-drama-material-studio.html`，由已验收的腾讯云双凭据原型完整复制后，仅在 ASR 草稿区加入 DeepSeek 同模板的测试按钮与四态状态区。
- 目标入口：设置 -> 能力供应商 -> ASR 字幕识别；只在供应商为 `腾讯云 ASR` 时显示。
- 迁移分类：屏内迁移。ASR 原型自身的输入、候选列表、滚动归属和保存按钮均保持原样。

## DOM 与数据边界

- 原型初始化脚本创建并拥有 `test-current-tencent-asr-configuration` 和 `tencent-asr-connection-status`；Bridge 仅写入已有节点的状态、文案和禁用态。
- 允许 Bridge 读取的草稿槽只有 endpoint、timeout、SecretId、SecretKey；不得新增 React 节点、样式或默认方案面板。
- 隔离承载必须同时保留 `tencent-asr-credentials-runtime` 与 `tencent-asr-connectivity-runtime`，使原型的字段切换与测试可见性在 iframe 重写后仍成立。

## 真实行为接口

- 按钮调用唯一受限 IPC `providers:test-tencent-asr`；主进程只接受固定的 `https://asr.tencentcloudapi.com`，以 TC3-HMAC-SHA256 发送 `DescribeTaskStatus` 与固定 `{"TaskId":0}`。
- 临时双凭据优先；两项都空才读取当前已保存的 ASR 腾讯凭据。只填一项时不发请求。
- 测试不保存草稿、不创建/替换安全凭据、不修改默认方案、不上传业务素材或创建 ASR 任务。编辑 endpoint、timeout、SecretId、SecretKey 后测试状态失效。

## 禁止项

- 不修改 DeepSeek、百炼、其他 ASR 候选或任何云端字幕执行路径。
- SecretId、SecretKey、签名、Authorization、请求正文、响应正文和 RequestId 不得进入 Renderer、toast、日志、诊断或测试断言。

---

# 原型迁移卡：ASR 默认方案可见与可设置

## 来源与范围

- 原型来源：`design/open-design/v2026-08-05-asr-default-configuration/short-drama-material-studio.html`，从腾讯云 ASR 连通性原型完整复制；默认方案面板和保存按钮严格复用 DeepSeek 的结构与视觉规则。
- 目标入口：设置 -> 能力供应商 -> ASR 字幕识别。它覆盖所有 ASR 草稿，不限于腾讯云。
- 迁移分类：屏内迁移。ASR 候选、腾讯双凭据、腾讯测试区和内部滚动归属都保持原样。

## DOM 与数据边界

- 原型运行时创建 `asr-current-default` 和 `save-asr-as-default`；Bridge 仅写入当前 ASR profile 的供应商、已保存/尚未设置状态与说明文案。
- 保存仍使用既有 ASR profile 保存接口；每能力唯一 profile 是默认方案的唯一事实来源，不增加新的默认数据结构。
- 隔离承载必须保留 `asr-default-configuration-runtime`，并保持它位于腾讯双凭据和连通性运行时之后。

## 禁止项

- 不改文本语义分析、视频理解复核、腾讯测试协议、ASR 云端执行或任何跨能力默认方案。
