# Phase 17–20 证据台账（2026-08-17）

## 用途与复用规则

本台账锁定当前未提交工作树，防止单项修复触发 Phase 17–20 全量重跑。只有同一条证据的代码输入、验证包、冻结媒体清单和设计合同均未变化时，才可复用其通过结果；变更仅重验受影响链路。

> 归档提示（2026-08-18）：本文件记录 2026-08-17 当时的输入指纹，表中的 `DEV-PLAN.md` 路径和 SHA 不代表现在的根计划。Phase 1–20 后续完整计划快照见 `docs/history/dev-plan/DEV-PLAN-phases-1-20-through-2026-08-17.md`；本表原始指纹保持不改，不能用于恢复当前待办。

| 影响范围 | 必须重验 | 不应重跑 |
| --- | --- | --- |
| Provider、OCR、ASR、候选资格 | Phase 17/18 定向服务与隔离样本 | 视觉截图、精确导出（无契约变更时） |
| 数据库、候选快照、导出契约 | Phase 18/19 迁移、治理、导出边界 | OCR/ASR 与不受影响视觉状态 |
| 页面结构、CSS、文案、交互 | 受影响 Electron 状态和视觉对照 | 真实媒体与 Provider 验收 |
| 构建或原生依赖 | Node 测试后串行 build → rebuild:electron → Electron E2E | 不受影响的历史媒体场景卡 |

任何最终功能冻结后的缺陷，只重跑其影响组，再执行一次最终总验。`build`、`rebuild:electron` 与 Electron E2E 严禁并发，避免 `better-sqlite3` Node/Electron ABI 互相污染。

## 当前输入指纹

- Git 基线提交：`44add77e84c2de1280223d884331d5bb8370bd2d`
- 当前状态：193 条未提交/未跟踪条目；不自动提交、推送或发布。
- 已跟踪差异 SHA-256：`877EF0EDBBF9B32EE3FA26552B498843BCE1DF445B37B1334D2B444D1097622F`

| 输入 | SHA-256 |
| --- | --- |
| `Product-Spec.md` | `445FEAD68AD6D7C753E03C90A4123AB907B3AED77B1C4BCB1792E3AC1BA2D524` |
| `DEV-PLAN.md` | `74A2E1EFFC69AD9CDAD6E0C8A87D2022F73A2E22274BC65B9E8FDCFAE05F6B27` |
| Phase 17–20 完成审计 | `3AB59FF503C76F3A23BC4449677E27AC2BA1FD38315E5B72D3093105FFDD2405` |
| Version 48 设计合同 | `B3BDE062FC6BF41667D73367736B69F89F622F33C06B83FBF8ADCC8B85CA20D3` |
| 冻结媒体 Baseline manifest v1 | `6CF8D83D12837C3BCFEB8EAC341B8CE814005607359BCD3A3FDAF76302845339` |
| `package.json` | `38D5D75D07E38E1796146045220534C1890E1CC38A34361307D130FEF497494D` |
| `pnpm-lock.yaml` | `C4126CE4EF7824A042892BAE879661834F73DE42DCB01C326E1DB3E7B706D593` |

## 证据状态

| 条目 | 状态 | 复用条件 / 下一步 |
| --- | --- | --- |
| 6+2 冻结媒体路径与 SHA-256 | 已有通过证据 | 仅当 Baseline manifest 或媒体指纹变化时重跑 `verify:clip-evidence-baseline`。 |
| Phase 17 OCR/ASR、三轨和时间质量 | 部分复用 | 只对变更的识别/Provider/资格链路补场景卡；尚缺实际未闭合冲突场景。 |
| Phase 18 证据包、候选资格与任务治理 | 部分复用 | 真实公开样本的资格、应生成/应阻断尚需按当前输入补齐。 |
| Phase 19 精确导出与治理 | 已有局部真实证据 | 数据库/导出契约未改可复用；改动后仅重跑导出和治理基线。 |
| Phase 20 V49 监视器 | 已有局部 Electron 证据 | 仅在媒体会话或页面结构变更后重跑相关 E2E。 |
| Version 48 视觉基线 | 未完成 | 当前 `audit:fidelity`：`completed=0, incomplete=94`；视觉采集必须等功能冻结后进行。 |
| 真实付费 Provider 验收 | 未完成 | 不新增凭据、不索取密钥、不执行需额外付费授权的调用；先完成本地预检。 |

## 本轮定向复验

- `pnpm run verify:clip-evidence-baseline`：通过，输出 `CLIP_EVIDENCE_BASELINE_OK version=1 public=6 hidden=2`。
- `pnpm run typecheck`：通过，Node 与 Web TypeScript 均为零错误。
- Provider 纯本地边界：`model-studio-model-policy`、`model-studio-configuration-test-service`、`provider-profile-service`、`app-ipc.provider-profile` 共 4 文件 / 37 测试通过；未发起网络请求。
- 该组初次运行遇到 `better-sqlite3` Electron ABI 148 与 Node ABI 137 不匹配；执行 `pnpm run rebuild:node` 后重跑通过。此为原生模块构建顺序问题，不是 Provider 业务失败。
- Version 48 合同已复核：13 个屏幕、47 个状态、2 个视口，共 94 项；合同主文件 SHA-256 为 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。当前项目库同名文件不匹配，真正匹配的历史版本为 UI 中的 `v52`（其历史版本文件的 SHA-256 与合同一致）。
- 真实且无付费外发的隔离场景：6+2 证据包、治理、`dev-06` 精确 FFmpeg 导出、ASR 无授权预检共 4 文件 / 4 测试通过；各场景使用临时 SQLite，测试自身断言原媒体 SHA-256 不变且临时目录清理。
- 本地 OCR：冻结 `dev-01` 的固定 runner 验收通过（1 文件 / 1 测试，96.38 秒）；测试使用临时 SQLite 与临时 Paddle 缓存，并在结束时清理。
- 全量 Node 基线：`pnpm test` 通过，106 文件 / 616 测试通过 / 5 显式真实证据开关跳过。此前唯一失败是 `tools/current-workspace-status.test.ts` 在全量并发下 18.1 秒超过其 15 秒测试上限；仅将该集成测试上限调为 30 秒，断言和运行时代码未变，复跑后通过。

## 当前视觉门禁

`test-results/fidelity/fidelity-report.json` 表明 47 个状态 × 2 个视口均未形成有效闭环。大多数条目缺项目库预览、Electron 截图或 metadata；已有的 3 个 1440×900 对照仍超阈：

1. `screen-clip:candidate-selected:1440x900`
2. `screen-clip-pool:default:1440x900`
3. `screen-clip-report:default:1440x900`

设计源仅限本地已迁移的 Open Design 项目库预览，不得用静态 HTML、历史附件或运行时 Electron 截图替代。

## 本轮收口记录（2026-08-17）

- `tools/current-workspace-status.test.ts` 的全量并发超时仅从 15 秒提高至 30 秒；测试输入、真实脚本与断言均未变。定向测试、`typecheck`、全量 `pnpm test`（106 文件 / 616 通过 / 5 显式跳过）均通过，独立两阶段审查通过。
- 功能冻结后串行完成：`validate:design-contract`、`build`、`rebuild:electron`；原剧切片核心隔离 E2E 3/3 通过；全量 Electron E2E 的 `test-results/e2e/.last-run.json` 为 `passed`，`failedTests` 为空。所有 E2E 都使用临时用户数据、媒体和输出目录。
- `git diff --check` 通过；未执行提交、推送、合并、打包发布或任何付费 Provider 调用。
- 用户在 Open Design 项目库中指出的 `short-drama-material-studio.html` 已直接打开；先前由“直接 URL 落到最新 Version 49 文件”得出的“V48 不可用”判断已撤回，但“当前同名文件可直接当作 V48”的判断也已撤回。当前同名文件 SHA-256 为 `8D5EAB7463A47ECFAC23EA0F4D6CB96B4BC1E1344D94E9B19963A41213F1A0BA`，不符合合同；项目库历史列表中 `v52`（8 月 02 日 17:34）才对应合同哈希。后续视觉采集必须从项目库的 `v52` 只读预览取得，不能按最新文件 URL 或同名卡片推断。
- Open Design 当前历史版本面板对 `v52` 提供恢复、下载与只读预览：恢复按钮 DOM 类名为 `artifact-version-panel__restore`，属于恢复/改写操作，按约束不得执行；下载只会取得文件，不能替代项目库预览；面板头部“打开预览”才是候选的只读采集通道。初始嵌入画布为 605×742 CSS 像素；收起项目对话栏后可扩至 1065×742，但尚无可验证的 `v52` 独立只读预览、1440×900/1280×720 项目库截图及每状态 metadata。因此 `audit:fidelity` 仍如实为 `completed=0, incomplete=94`。

## 项目库视觉源分级（本轮只读核对）

| 来源 | 分级 | 原因与使用边界 |
| --- | --- | --- |
| 项目库历史 `short-drama-material-studio.html` 的 `v52`（8 月 02 日 17:34） | Version 48 主源，待只读预览入口 | 历史版本文件 SHA-256 精确匹配 `docs/design-contract-v48.json`。仅其在项目库中的只读预览可作为 V48 主交互源；不得恢复覆盖当前文件。 |
| 项目库当前 `short-drama-material-studio.html`（历史 `v79`） | 排除 | SHA-256 为 `8D5EAB7463A47ECFAC23EA0F4D6CB96B4BC1E1344D94E9B19963A41213F1A0BA`，不匹配 V48 合同；不能因同名而作为主基线。 |
| 项目库 `screens-v48-original-clip-states/preview-1440x900.html`、`preview-1280x720.html` | Version 48 状态附件，待逐项映射 | 已直接打开 1440 附件；其内容画布为固定 1440×900。只能在状态、视口和主源哈希关系被 metadata 明确记录后进入对应状态证据。 |
| 项目库 `screens-v48-text-analysis/*` 等带 `v48` 的状态附件 | 候选 V48 附件，待核验 | 文件名不足以单独证明合同关系；须逐项核对 V48 状态、视口、来源与截图尺寸。 |
| 项目库 `short-drama-material-studio-v49-clip-review.html` 及 V49 文件夹 | 排除 | 后续受控修订；不能替代 V48 合同或填充其 94 项基线。 |
| `docs/design-evidence/v48/open-design-desktop-export-dpr150` 与 `open-design-source-rendered-reference` | 排除 | 两者 README 均明确为旧哈希或历史参考，不是当前项目库预览，不能计入审计。 |
| 任何不带 V48 身份、旧页面或 Electron 截图 | 仅诊断参考 | 可用于理解历史与定位差异，不能作为项目库设计基线。 |
| 运行中项目库 `short-drama-material-studio-v48-capture-source.html` | Version 48 合规采集镜像 | 2026-08-17 经用户明确授权在运行中项目根目录 `D:\od-workspace\open-design\.od\projects\01b5725c-2688-4cbc-bc29-7432712449b3` 创建的 `v52` 逐字节副本，SHA-256 仍为合同值 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`；文件名、`.artifact.json` 与 `V48-CAPTURE-SOURCE.md` 均明确标记为“只读、仅视觉验收”。HTML 本身未添加水印或任何像素改动，项目库 API 已登记该卡片。 |

### 导出通道观察

- 2026-08-17（已授权采集尝试）：在**运行中**项目库的只读镜像 `short-drama-material-studio-v48-capture-source.html` 中，逐项核验 HTML SHA-256 仍为合同值 `D86D...C92B`，其 HTML、`.artifact.json` 与 `V48-CAPTURE-SOURCE.md` 均保持 Windows `ReadOnly`。Open Design 宿主预览可用区域约为 `1065×742` CSS px；75% 缩放时 iframe 为约 `1421×989` CSS px。受控浏览器禁止对宿主 DOM 作临时尺寸写入，因此未改变镜像或宿主样式。已触发一次内置“导出为图片 → PNG → 保存”，但下载事件在 3 秒内未产生，项目目录、Downloads 与临时目录亦未发现新图像；这次操作不计入视觉证据，也未向 `docs/design-evidence/` 写入文件。曾为核验同源 CLI 导出而误启动一个独立 Open Design 客户端；其 daemon 在开始导出前自行关闭、未生成文件，随后该客户端进程已关闭。该路径已弃用，后续只使用 Codex 内置 Open Design。不得将当前缩放截图重采样为合同的 `1440×900` / `1280×720` 基线。
- 当前 Open Design 文件查看器提供“导出为图片（PNG/JPEG/WebP）”动作；对 `screens-v48-original-clip-states/preview-1440x900.html` 的预览测得内容滚动尺寸为 1440×900，说明该附件本身有固定画布。
- 本轮从受控的 in-app Browser 触发一次 PNG 导出后，未在项目目录、Downloads 或临时目录发现新导出文件；该动作不足以形成可校验的项目库证据，故未写入 `docs/design-evidence`，也未改变审计状态。后续只接受能复核原始像素尺寸、来源文件、状态和时间的导出结果。
- `v52` 历史版本面板已经证明存在只读预览：选中版本后由内嵌 iframe 加载对应 HTML，面板头部的“打开预览”会新开该版本的沙箱预览；该入口不同于恢复按钮。受控浏览器对该新窗口导航施加安全策略并拒绝自动点击，未发生任何设计数据写入。需要用户在 UI 中手动点击一次“打开预览”后，才能继续验证独立预览的尺寸与后续自动采集能力。
- 已直接测量版本面板内嵌 `v52` iframe：面板为避免 79 条历史记录溢出而将预览压缩到约 `579×24` CSS px（宿主预览容器约 `361×16` CSS px）。它证明了来源和版本，但无法作为合同所需的固定视口截图；不得放大、裁切或重标该缩略预览以伪造 1440×900 / 1280×720 基线。
- 用户已手动打开 `v52` 独立预览，真实标签元数据为 `short-drama-material-studio.html · v52` 与 `blob:http://127.0.0.1:19406/...`。受控浏览器桥仅绑定原项目库标签（id `1`），未将手动新开的 blob 标签（用户侧 id `2`）注册为可操作标签；复核后状态未变化。因此不能读取独立预览的真实画布、状态或截图，且不能通过导航、CDP 或其它浏览器表面绕过该控制边界。
- 用户随后明确授权创建标记清晰的采集镜像。首次误依据 `release-stable-win` 缓存目录创建了同名 3 个只读文件；核实后发现运行中项目实际根目录为 `D:\od-workspace\open-design\.od\projects\01b5725c-2688-4cbc-bc29-7432712449b3`，故该首次副本未被项目库读取、不得作为证据。删除该缓存副本的安全命令被执行环境在启动前拒绝，未发生删除；文件名与 `V48-CAPTURE-SOURCE.md` 已使其用途和状态可辨，后续不再使用。
- 已在运行中项目根目录创建且设置 Windows 只读属性：`short-drama-material-studio-v48-capture-source.html`（308,556 bytes）、同名 `.artifact.json`（1,005 bytes）及 `V48-CAPTURE-SOURCE.md`（1,167 bytes）。复制后 SHA-256 为 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`，artifact metadata 的 `captureSource=true`、`sourceVersion=52` 与 SHA 校验通过；运行中项目库 API 由 175 项更新为 177 项并已登记该 HTML 卡片。该写入仅限上述三个明确标记文件；未改写当前主文件、V49、历史文件、正式数据或项目代码。
