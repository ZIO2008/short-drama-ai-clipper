# 原型迁移卡：V48 原剧切片已有项目库预览差异（2026-08-14）

## 原型来源与目标入口

- 权威源：`design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`，SHA-256 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。
- 项目：Open Design `01b5725c-2688-4cbc-bc29-7432712449b3`，Version 48。
- 目标入口：`StaticPrototypeSurface.tsx` 的 `clip`、`clip-pool`、`clip-report`，分别由 `OriginalClipWorkspaceRuntimeBridge.ts` 和 `OriginalClipPoolReportRuntimeBridge.ts` 绑定真实数据与行为。
- 固定证据视口：1440×900；本卡不修改 1280×720 证据要求。

## 迁移分类

- 分类：全屏迁移复核。
- 原因：三项证据均比较应用壳和整个工作区，运行时页面的外壳、iframe 隔离坐标系、原型页面结构和数据桥接均参与首屏构图；不能按候选列表或报告表格做局部 CSS 补丁。
- 不变边界：不得放宽 `evidence.json` 的零阈值；不得替换项目库预览、Electron 截图或以 HTML 渲染图充数；不得把真实数据量差异视为壳、分栏、阶段条或报告结构的豁免。

## 已有配对的实际差异

| 状态 | 项目库预览 | Electron 截图 | 审计结果 |
|---|---|---|---|
| `screen-clip:candidate-selected:1440x900` | `docs/design-evidence/v48/screen-clip/candidate-selected/1440x900/project-library-preview.png` | 同目录 `electron.png` | changed pixels `27.2648%`，mean RGB delta `14.2642` |
| `screen-clip-pool:default:1440x900` | `docs/design-evidence/v48/screen-clip-pool/default/1440x900/project-library-preview.png` | 同目录 `electron.png` | changed pixels `17.0876%`，mean RGB delta `12.2022` |
| `screen-clip-report:default:1440x900` | `docs/design-evidence/v48/screen-clip-report/default/1440x900/project-library-preview.png` | 同目录 `electron.png` | changed pixels `26.1177%`，mean RGB delta `12.2559` |

## 根因结论与可执行边界

1. 三张项目库 PNG 与 Electron PNG 均为 1440×900、96 DPI，但项目库画面中的 220px 侧栏约为 184px、56px 顶栏约为 47px；比例接近 `5/6`。Electron 的对应几何仍是 220px/56px，并与冻结 V48 HTML 的 `.app`、`.workspace` 规则一致。
2. 因此当前差异首先是 Open Design 项目库预览的渲染/缩放坐标系与合同固定视口不一致，不能证明 Electron 的运行时桥接偏离 V48，亦不能通过向运行时加入缩放或覆盖样式来“匹配”这三张图。
3. 真实数据也造成局部内容不同（2 集/少量候选对比演示数据），但不是本卡的主因；即使数据一致，应用壳的缩放差异仍会使全屏零阈值失败。
4. 当前运行时已从冻结 V48 HTML 完整隔离目标屏幕；`StaticPrototypeSurface.tsx` 仅在 iframe 隔离边界补回主应用 56px 顶栏的坐标，不改写原型的网格、节点顺序或页面外壳。两个 runtime bridge 只替换真实文本、状态、列表行和回调，不拥有应用壳或原型布局。

## 允许的数据绑定与禁止改动

- 允许：真实剧集、候选、状态、输出记录、加载/空/错误文案，以及既有原型操作的回调。
- 禁止：修改 `.app` / `.sidebar` / `.workspace` / `.topbar` 尺寸，缩放 iframe 或页面，新增局部 CSS override 以吸收该预览比例差异，替换证据或扩大像素阈值。

## 后续验收

1. 在 Open Design 中以无缩放、逻辑视口确为 1440×900 的项目库预览重新采集这三个状态；记录预览生成方式和显示缩放，避免把 1728×1080 CSS 画布缩入 1440×900 PNG。
2. 以同一状态、同一视口重新采集 Electron；只在新的项目库预览与 V48 结构一致时再运行 `pnpm run audit:fidelity`。
3. 若新配对仍失败，按“外壳 → 原型隔离 → bridge 替换节点 → 真实数据”顺序定位并修复，随后补齐本卡的屏幕截图与复测记录。

## 当前验收结论

- 静态夹具基线：未通过（项目库预览坐标系未证实符合合同固定视口）。
- 真实数据验证：局部 Electron 回归已通过，不替代视觉验收。
- 视觉验收：未通过；本卡不减少 `audit:fidelity` 的 94 项缺口，也不改变 `verification-only / visual-unverified` 状态。
