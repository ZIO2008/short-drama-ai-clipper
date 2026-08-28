# Phase 24：ASR 供应商双凭据运行时挂载卡

## 原型来源

- 全局 current 设计仍是 V49 `design-v49-clip-monitor-review`；但当前生产路由 `provider-asr` 并未使用该文件的 provider 屏。
- `StaticPrototypeSurface.prototypeSourceForScreen('provider-asr')` 实际加载完整页面源：`design/open-design/v2026-08-05-asr-default-configuration/short-drama-material-studio.html`，SHA-256 `FD62561FEBC1516FB6AFD1D1BB444121D45E018418E698093FE0D59E4A50B33F`。
- 版本/组合判定：生产应用壳和路由由当前 React/Electron 宿主管理；ASR 供应商屏的 HTML、CSS、脚本和 `[data-tencent-asr-credentials]` 来自上述 2026-08-05 完整源。V49 provider 屏未参与本路由，本 Task 不擅自启动其页面级迁移。
- 当前实体：2026-08-05 `screen-asr` / `.supplier-draft` / `.form-grid` / `[data-tencent-asr-credentials]` / `[data-save-provider="asr"]`。
- 目标入口：设置 → ASR 字幕识别 → 腾讯云 ASR → 预填此方案。
- 固定视口：1440×900、1280×720，系统缩放由 current Playwright 基线保持。

## 迁移分类

- 分类：现有 ASR 原型屏内运行时绑定修复。
- 外壳归属：继承当前生产应用壳；屏内双栏、草稿列和滚动容器继承 2026-08-05 ASR 页面源。
- 已有偏离：Product Spec 的腾讯云双凭据合同要求 SecretId/SecretKey；运行时早已按认证 schema 动态生成，但错误挂入随后隐藏的 V49 通用密钥 `.field`，导致隔离空配置状态不可见。
- 本次只纠正 DOM 所有权：优先复用运行时原型已有 `[data-tencent-asr-credentials]`；不存在该节点时，动态凭据 section 才挂到既有保存按钮之前。保持 V49 草稿列、字段顺序、控件样式和滚动归属；不加入 CSS、不改页面宽高、不改 V49 原型源文件。

## 目标状态

| 状态 | 原型/合同依据 | 运行时证据 | 数据前置 | 结果 |
|---|---|---|---|---|
| 腾讯云未保存 | 2026-08-05 ASR 页面 + `tencent-cloud-secret-pair` schema | `test-results/e2e/.../provider-connectivity-tencent-asr-unverified-1440x900.png` | 隔离空 userData，预填腾讯云 ASR | 通过 |
| 腾讯云窄视口 | 2026-08-05 ASR 页面 1280×720 布局 | `test-results/e2e/.../provider-connectivity-tencent-asr-unverified-1280x720.png` | 同上 | 通过 |
| 缺双凭据测试 | Product Spec 腾讯云最小签名检测 | current Electron provider-connectivity 用例 | SecretId/SecretKey 留空 | 通过：不出网、不保存、不创建任务 |

## 原型边界

- 不改变供应商候选列表、草稿列宽、表单控件样式、保存按钮顺序、页面滚动或应用壳。
- 当前路由优先复用 2026-08-05 原型双凭据节点；API 地址、模型、超时和价格字段保持原位。
- 保存与测试继续调用既有受限 IPC；密钥不回显、不写日志、不进入候选任务快照。
- 无原型 pair 的动态 fallback 仅是防御性兼容路径，不是当前 provider-asr Electron 目标状态；它复用 `.form-grid/.field/.input` 结构并有 DOM 单测，但本卡不声称该不可达分支已完成截图验收。

## 验收记录

- 静态结构核对：通过；当前 2026-08-05 原型双凭据节点优先，保存按钮前动态节点仅为防御性回退。
- 真实数据验证：通过；隔离空 userData 预填腾讯云 ASR 后仅显示一组 SecretId/SecretKey。
- 异步与失败路径：通过；缺双凭据返回原位失败事实，provider profile 保持不变。
- 视觉验收：通过；1440×900 与 1280×720 截图确认字段位于既有右侧草稿滚动容器，无横向溢出、重复字段或旧通用密钥残留。
