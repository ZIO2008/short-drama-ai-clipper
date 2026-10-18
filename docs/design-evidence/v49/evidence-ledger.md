# V49 证据采集台账（计划，不是验收）

本台账把 `docs/design-contract-v49.json` 的候选屏幕和状态展开为可采集的证据位。唯一设计源仍为 `design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`，SHA-256 为 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。

2026-10-19新增用户排期授权的候选池10状态、完成报告9状态，两页38个证据位均为完整画面零像素差异，真实renderer/隔离模拟IPC与独立原型节点对照，实际命令、退出码、环境、源码及图片哈希进入metadata，真实后端另有FFmpeg闭环。原screen-clip三状态六证据位复用；其余继续planned，不外推为全产品通过或公开发布。

| 屏幕 | 候选状态数 | 当前状态 | 证据位 |
|---|---:|---|---:|
| `screen-library` | 4 | planned | 8 |
| `screen-assets` | 3 | planned | 6 |
| `screen-production` | 3 | planned | 6 |
| `screen-stitch` | 4 | planned | 8 |
| `screen-clip` | 3 | accepted；仅三种迁移卡状态，6/6 证据位完成 | 6 |
| `screen-clip-report` | 9 | accepted；Phase33完整报告，18/18 | 18 |
| `screen-results` | 4 | planned | 8 |
| `screen-tasks` | 4 | planned | 8 |
| `screen-tags` | 3 | planned | 6 |
| `screen-settings` | 4 | planned | 8 |
| `screen-ai` | 4 | planned | 8 |
| `screen-timeline` | 3 | planned | 6 |
| `screen-subtitles` | 9 | planned | 18 |
| `screen-clip-pool` | 10 | accepted；Phase32完整候选池，20/20 | 20 |
| `screen-clip-export` | 5 | planned | 10 |
| `screen-provider-${key}` | 4 | planned；每个实际供应商 key 在运行时展开 | 8 / 每个 key |
| **合计（合同计划）** | **76** | **22 accepted、54 planned** | **44/152 已完成** |

## 计数与边界

- 每个候选状态需在1440×900和1280×720各采集一次；本轮扩展后为76×2=152个证据位，仅已授权三个页面的44位激活门禁。
- 每个证据位必须同时具备项目库预览、Electron 截图和符合 `evidence.schema.json` 的 `evidence.json`；缺任一项即未完成。
- `screen-provider-${key}` 是供应商动态模板。上表的 4 个状态只表示模板合同；实际启用的每一个供应商 key 都必须额外展开 8 个证据位，不能把模板行误报为已覆盖全部供应商。
- 采集和比较只能在用户明确决定启动 V49 视觉验收后进行；在此之前不运行旧 `audit:fidelity`，也不读取或复用 V48 `screen-*` 证据。
