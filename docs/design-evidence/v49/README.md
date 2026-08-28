# V49 视觉证据目录

`screen-clip` 的默认候选已选、前后审阅加倍速浮层、媒体不可读已在两个固定视口完成视觉验收；其余 V49 屏幕仍未采集。V49 全产品合同仍为 `draft`，本目录不得被解释为其它屏幕已通过或项目可发布。

## 来源与边界

- 当前唯一设计源：`design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`
- 源 SHA-256：`C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`
- 合同：`docs/design-contract-v49.json`
- 元数据 schema：`docs/design-evidence/v49/evidence.schema.json`
- V48 的 `docs/design-evidence/v48/screen-*` 只能作为历史诊断输入，不得复制、混入或替代 V49 证据。

## 目录约定

每个屏幕、状态和视口使用一个独立目录：

```text
docs/design-evidence/v49/<screen>/<state>/<width>x<height>/
├── project-library-preview.png
├── electron.png
└── evidence.json
```

`evidence.json` 必须符合 `evidence.schema.json`，并绑定 V49 源哈希、合同修订、fixture、测试入口、两张截图的路径/哈希/尺寸、允许差异和比较区域。状态必须来自 V49 HTML 或对应迁移卡；不能用 V48 状态名、历史截图或“未采集”文字伪装成证据。

## 状态与验收边界

- `planned`、`captured-unverified`、`compared-unaccepted` 只能表示过程状态，不代表通过。
- 只有用户决定启动视觉验收、证据完整且 `acceptance.status` 明确为 `passed` 时，才可形成验收结论。
- 本目录不触发旧 `audit:fidelity`；门禁切换前禁止运行会读取 V48 `screen-*` 的旧脚本。
