# V49 证据采集台账（计划，不是验收）

本台账把 `docs/design-contract-v49.json` 的候选屏幕和状态展开为可采集的证据位。唯一设计源仍为 `design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`，SHA-256 为 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。

除 `screen-clip` 的三种已授权状态外，所有条目仍是 `planned`。`screen-clip` 已有 V49 原型渲染、Electron 截图、`evidence.json` 与接受结论；该结论不外推为其它页面通过、全产品合同就绪或可发布。

| 屏幕 | 候选状态数 | 当前状态 | 证据位 |
|---|---:|---|---:|
| `screen-library` | 4 | planned | 8 |
| `screen-assets` | 3 | planned | 6 |
| `screen-production` | 3 | planned | 6 |
| `screen-stitch` | 4 | planned | 8 |
| `screen-clip` | 3 | accepted；仅三种迁移卡状态，6/6 证据位完成 | 6 |
| `screen-clip-report` | 3 | planned | 6 |
| `screen-results` | 4 | planned | 8 |
| `screen-tasks` | 4 | planned | 8 |
| `screen-tags` | 3 | planned | 6 |
| `screen-settings` | 4 | planned | 8 |
| `screen-ai` | 4 | planned | 8 |
| `screen-timeline` | 3 | planned | 6 |
| `screen-subtitles` | 9 | planned | 18 |
| `screen-clip-pool` | 4 | planned | 8 |
| `screen-clip-export` | 5 | planned | 10 |
| `screen-provider-${key}` | 4 | planned；每个实际供应商 key 在运行时展开 | 8 / 每个 key |
| **合计（合同计划）** | **64** | **3 accepted、61 planned** | **6/128 已完成** |

## 计数与边界

- 每个候选状态都需要在 `1440x900` 和 `1280x720` 各采集一次，所以固定计划为 `64 × 2 = 128` 个证据位。
- 每个证据位必须同时具备项目库预览、Electron 截图和符合 `evidence.schema.json` 的 `evidence.json`；缺任一项即未完成。
- `screen-provider-${key}` 是供应商动态模板。上表的 4 个状态只表示模板合同；实际启用的每一个供应商 key 都必须额外展开 8 个证据位，不能把模板行误报为已覆盖全部供应商。
- 采集和比较只能在用户明确决定启动 V49 视觉验收后进行；在此之前不运行旧 `audit:fidelity`，也不读取或复用 V48 `screen-*` 证据。
