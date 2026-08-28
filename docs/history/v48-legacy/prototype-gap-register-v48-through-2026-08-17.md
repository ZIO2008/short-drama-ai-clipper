# Open Design 最终原型差异清单

> **Version 48 历史差异台账。** 本文只追溯 2026-07-31 至 2026-08-01 的旧对齐过程，不是当前待办、设计源或视觉门禁。当前唯一设计源为 V49 HTML，当前执行范围见根 `DEV-PLAN.md`；下文“唯一设计源”“当前”“必须”均按当时历史语境理解。

## 设计源与审计方法

- 当时的设计源：Open Design 项目库 `01b5725c-2688-4cbc-bc29-7432712449b3`，`short-drama-material-studio.html` Version 48。
- 原型 SHA-256：`D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`。
- 设计源读取时间：2026-07-31；已恢复 Open Design 本机 MCP stdio→命名管道读取，可读取项目、文件清单与 HTML；当前项目未暴露可直接用于最终态验收的 1280×720 候选选中预览。原型源保持只读。
- 历史比对基线：生产 `v0.1.32` 源码与 `docs/open-design-v2026-07-30-reuse-matrix.md`。本清单以实际 HTML Version 48 覆盖早期 r5 handoff 的冲突说明；这些结果不得覆盖当前 V49。
- 状态定义：**匹配**=真实路径与原型一致；**真实差异**=安全/本地数据原因，已列边界；**缺失**=要在 Phase 9 完成；**P2 冻结**=只允许不可操作未来态。

## Version 48 视觉证据进度（2026-07-31，未验收）

- 已从 Open Design 项目库全屏预览、只读采集 1440×900 基线：剧目库、剧目资产、素材生产、原剧切片工作区、逐集候选池、导出预检、完成报告、任务中心、设置，以及字幕资产的“已完成校验”和“待校验”详情弹窗。文件位于 `docs/design-evidence/v48/`。
- 2026-07-31：Computer Use 已可定位并只读激活唯一 `Open Design` 窗口；本轮核对到 Version 48 原剧切片第二阶段“全部候选”项目库态（暖沙橙活动阶段、120 集源分集状态列、候选窗口与右侧待导出队列）。未点击、编辑、上传、删除或写入项目库。该只读画面尚未形成合同所需的持久化双视口逐态基线，审计缺口继续保留。
- `screen-clip` 的 `default`、`candidate-selected` 与 `missing-media` 已各自具有真实 Electron fixture、双视口截图与交互断言；其中仅 `candidate-selected:1440×900` 已有项目库预览，最新真实比较为 `changedPixelRatio=0.3582577160493827`、`meanRgbDelta=15.433595679012345`，仍因结构与数据差异超阈值失败。其余屏幕/状态仍缺项目库预览或真实 Electron 证据，`pnpm run audit:fidelity` 必须继续失败；任何一项都不能作为“匹配”或候选包 closure 的依据。
- 字幕资产的 Version 48 原型首屏同时展示“已完成校验、识别中、未导入、待校验、媒体缺失、压力样本”等多集状态，详情由所选剧集决定。现有设计合同未声明这个“混合状态概览”基线，不能拿同一张概览截图复制充当多个独立状态；后续须以项目库可达的详情/设置/压力状态修正合同及对应 fixture，再采集每一项真实基线。

## 进度日志

- 2026-08-01：用户否决继续以差异台账驱动局部补丁，并明确替换范围仅为原剧切片与字幕资产。`screen-clip`、`screen-clip-pool`、`screen-clip-report`、`screen-subtitles` 的旧 renderer 实现被删除，改为直接加载 Version 48 HTML 原文；剧目库、素材生产入口、成果库、任务中心与应用壳不在本轮删除范围。此前所有“结构已同步”记录均不得作为本轮完成证明。

- 2026-08-01：用户在 Open Design 保存了剧目模块首屏基线更新。最新 HTML 统一剧目资产、素材生产、字幕资产、成果库的 76px 页头与返回剧目库语义；字幕资产说明改为剧目级 ASR/OCR 复核，真实生成、导入和设置操作移入 72px“按剧集归档”工具栏。生产实现只调整布局与文案，不扩展字幕后端、P2 或多集拼接；该源更新不补足项目库逐态基线，`audit:fidelity` 仍须保持未完成。

- 2026-08-01：落实 ALIGN-021：以已激活的 Open Design Version 48 `screen-clip-pool` 只读画布及 HTML 原型为准，候选池右侧检查器现在只保留“配置并导出”和最近真实完成批次的“查看完成报告”；移除会跳过第三阶段的“打开成果库”与失败时额外出现的任务中心出口。失败原因继续在候选行如实可见，成果库仍只在第三阶段完成报告作为显式后续动作。组件回归 13 项覆盖失败态无额外出口、无完成批次报告禁用、完成批次报告回调精确传入持久化 candidate ID；`pnpm run typecheck`、`pnpm run build`、带 `SHORTDRAMA_CAPTURE_EVIDENCE=1` 的 Phase 8 Electron 回归均通过。执行 `pnpm test` 后需先 `pnpm run rebuild:electron` 恢复 `better-sqlite3` 的 Electron ABI，再运行桌面回归；这是本地原生模块构建环境要求，不是界面数据或行为降级。当前 `pnpm run audit:fidelity` 仍为 `completed=0 incomplete=92`，最新候选池 1440×900 比较为 `0.13737962962962963 / 10.398304269547324`，继续不得写为视觉验收通过。

- 2026-08-01：新增并落实 ALIGN-020：批量生成跨分集候选时，首个真实候选现在同步切换当前源分集，监视器、源分集时间线、候选时间线、左侧活动行和检查器不再可能分别停在旧集/新候选；源时间线候选计数改由当前本地候选计算，状态汇总暂缺时不再错误显示 0。`OriginalClipWorkspacePage` 组件回归 13 项覆盖多集返回时严格取返回数组首项、空返回保持原选择，类型检查、构建和设计合同均通过；Phase 10、Phase 8 与 P2 冻结 Electron 回归 3/3 通过。独立审查 Stage 1/2 无 HIGH/MEDIUM。视觉审计刷新后仍如实为 `completed=0 incomplete=92`；候选已选/候选池/完成报告 1440×900 的当前比较分别为 `0.3582577160493827 / 15.433595679012345`、`0.137820987654321 / 10.463266975308642`、`0.2464135802469136 / 11.258182098765433`，均未通过阈值。
- 2026-08-01：以正在运行的 Open Design Version 48 `screen-clip-pool` 只读画布复核候选行，确认默认行只有编号、源时码、时长、状态和“打开”，无常驻复选框。生产候选池据此移除行内选择框；批量选择迁入“配置并导出”的按需抽屉，默认预选全部已确认候选，可逐项取消，且 2,500 个已确认候选只渲染 28 项选择窗口。预检、导出和完成报告继续只使用本次真实选择；组件回归 13 项（含跨窗口取消后预检 ID 精确传递）、全量 `pnpm test`（70 files / 290 tests）、类型检查、构建、设计合同，以及原剧切片/P1/P2 Electron 回归均通过。视觉审计仍为 `completed=0 incomplete=92`，候选池 1440×900 比较仍为 `0.13478395061728396 / 10.274581275720164`，不写为匹配。
- 2026-07-31：再次以 Computer Use 对运行中的 Open Design 项目库进行只读核对；当前停留在 Version 48 原剧切片第二阶段“全部候选”，可见 120 集源分集列、当前第 01 集候选窗口、四项筛选、右侧待导出队列及三阶段栏。未点击、编辑、上传、删除或写入。当前桌面截图不是合同规定的 1440×900 / 1280×720 可持久化逐态证据，不能替代审计基线或改变“部分匹配”结论。
- 2026-07-31：落实 ALIGN-018：候选池导出抽屉为预检、启动、轮询、取消和重试引入请求代际与 `exportId` 双重归属守卫。每个 `exportId` 同时只允许一个在途进度读取，终态写入前同步作废该轮询，避免同一批次的旧 `running` 或读取失败在完成/失败后回写。取消会立即作废旧轮询；新批次启动、抽屉关闭或旧轮询的迟到成功/失败都不能改写当前进度或状态文案。关闭现在先卸载抽屉、再异步刷新候选，避免慢刷新留下旧批次可写的界面。`ClipCandidatePoolPage` 组件回归覆盖旧批次迟到成功、迟到失败、关闭后的迟到响应、同批次不重叠轮询和当前批次读取失败仍保持运行，10 项通过；独立代码审查 Stage 1/2 无 HIGH/MEDIUM。`pnpm test` 为 70 files / 286 tests 通过，类型检查、构建、设计合同及 `phase8-original-clip-workflow`、`p1-remix-workflow`、`p2-freeze` Electron 回归均通过。`pnpm run audit:fidelity` 仍如实为 `completed=0 incomplete=92`，不能据此声称视觉通过。
- 2026-07-31：落实 ALIGN-019：候选池的候选行对齐 Version 48 的紧凑字段与石墨面板，顶部“返回素材生产”与阶段栏“1 候选工作区”分别回到素材生产/同模块第一阶段。独立审查发现候选显示编号曾按倒序返回的数组临时分配，新一轮生成会重排旧 `C-xx`，而搜索也不能命中显示编号；现已改为服务端按持久化创建顺序（`created_at ASC, id ASC`）返回并携带 `createdAt`，页面据此稳定编号，`C-xx` 和源时码均可搜索。服务与组件定点 30 项、独立复审 Stage 1/2 均通过；全量 `pnpm test` 为 70 files / 289 tests，类型检查、构建、设计合同、Phase 8、P1 二创与 P2 冻结 Electron 回归通过。最新候选池 1440×900 真实比较降至 `changedPixelRatio=0.13425617283950617`、`meanRgbDelta=10.277194444444444`，但合同阈值仍为 0/0，且 1280×720 缺项目库预览；`pnpm run audit:fidelity` 仍为 `completed=0 incomplete=92`，必须保持未验收。
- 2026-07-31：在 Open Design Version 48 的实际候选池基线与 Electron 证据并排核对后，移除了已限定当前源分集却再次渲染的“第 N 集 / N 个候选”分组头，避免首条候选被无原型对应的冗余结构整体下推。窗口化、筛选、稳定 `C-xx`、键盘选择与真实导出均保留；`ClipCandidatePoolPage` 组件回归 12 项、类型检查、构建与 Phase 8 Electron 回归通过。重采集后的候选池 1440×900 比较为 `changedPixelRatio=0.13478395061728396`、`meanRgbDelta=10.274581275720164`，依旧超过 0 阈值且 1280×720 缺项目库预览；审计仍为 `completed=0 incomplete=92`，不写为视觉通过。
- 2026-07-31：新增 ALIGN-017：P1 爆点前置二创不再把 `listAiCapabilityStatus` 的失败或运行时能力缺失降级为“已配置全部能力”。能力状态现在有独立 `loading → loaded | error`、请求代际隔离和“重新读取能力状态”；错误明确说明配置无法确认，但不阻塞既有受控本地分析，也没有新增云端、解说/TTS/旁白、provider 或任务入口。组件回归覆盖读取失败、缺 API、重试恢复、加载态、迟到响应隔离及受控分析可用性（6 项通过）；`pnpm test`（70 files / 281 tests）、类型检查、构建、设计合同以及 P1/P2 Electron 回归均通过，独立代码审查 Stage 1/2 通过且无 HIGH/MEDIUM。视觉审计继续沿用当前真实未验收状态，不把本项功能回归伪装成 Version 48 视觉通过。
- 2026-07-31：落实 ALIGN-016：原剧切片工作区将分集生产状态、当前候选的 ASR/OCR/导入证据与展示字幕变体拆为各自独立的 `loading → loaded | error` 状态；缺失运行时能力也明确进入错误态。生产状态服务失败时源分集明确显示“状态读取失败”，不再伪装为未生成；证据轨与展示变体的失败分别在展示字幕弹窗如实显示，并可独立重试恢复，不重读另一条已加载数据，也不显示“先建立证据”的空结论。请求序号隔离候选快速切换的轨道和变体迟到响应，展示字幕保存的成功/失败也只影响仍处于当前候选的结果，避免旧候选数据或错误消息污染当前检查器；定点组件回归覆盖能力缺失、状态失败、双向字幕失败/独立恢复、跨分集双读取乱序和保存期间切换的成功/失败（11 项通过）。`pnpm test`（70 files / 278 tests）、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract`、原剧切片与 P2 冻结 Electron 回归均通过；独立代码审查 Stage 1/2 通过，无 HIGH/MEDIUM。该项不改变候选监视器、双时间线、确认或 P2 冻结边界；`pnpm run audit:fidelity` 仍为 `completed=0 incomplete=92`，继续未验收。
- 2026-07-31：候选池按 Version 48 收回多余的“异常”筛选，只保留全部、待确认、已确认、已导出四项；异常仍在全部列表中显示真实失败原因，源分集状态明确计数，右侧可进入任务中心处理，未丢失可操作性。阶段、源分集与筛选补足 `aria-current` / `aria-pressed`，保持具名内层滚动区与键盘隔离。5,000 候选窗口组件回归 5 项、全量 `pnpm test` 70 files / 264 tests、构建、设计合同、原剧切片与 P2 冻结 Electron 回归均通过；独立代码审查 Stage 1/2 通过。真实重采集的 1440×900 候选池比较为 `changedPixelRatio=0.305032`、`meanRgbDelta=17.406275`，仍超阈值；1280×720 缺项目库预览，故继续未验收。
- 2026-07-31：完成报告补齐 Version 48 的“本集输出明细”及候选、源片区间/输出文件、时长、状态、操作列头。已导出候选才显示 `MaterialSummary` 的真实文件名；失败候选无条件显示真实失败原因或“未生成输出”，即使存在迁移残留成果也不伪造输出，其他未导出状态也不冒充文件。活动阶段、剧集和筛选均补足辅助技术状态；760px 以下列头与结果行同步缩为三列。组件回归 4 项覆盖真实文件、失败原因、残留成果、空原因与批次隔离；全量 `pnpm test` 70 files / 264 tests、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract`、`phase8-original-clip-workflow` 与 `p2-freeze` Electron 回归均通过；独立代码审查 Stage 1/2 通过。真实截图重采集后的报告比较为 `changedPixelRatio=0.246452`、`meanRgbDelta=11.262698`，仍超阈值；1280×720 继续缺项目库预览，故保持未验收。
- 2026-07-31：修正 CLIP-003 仍将“全部候选”描述为跨分集同窗的语义漂移；Version 48 下候选区只渲染当前源分集的窗口，“全部”仅为当前集状态筛选。导出服务启动时会将应用重启遗留的 `running` 批次真实标记为 `cancelled`，以批次所有权只释放仍为 `exporting` 的候选，已导出候选与成果不回退。迁移与原剧切片服务定点回归共 27 项通过。
- 2026-07-31：候选池在导出完成后的真实数据刷新中丢弃已不再是 `confirmed` 的手动选择，避免旧勾选继续进入下一次导出预检；关闭导出抽屉也刷新数据。候选池的 5,000 候选窗口、报告入口与失效选择组件回归共 4 项通过。
- 2026-07-31：Phase 10 媒体缺失截图回归改为从切片工作台返回素材生产后，经剧目级“字幕资产”标签进入；缺媒体且未选中候选时不伪造常驻字幕入口。`phase8-original-clip-workflow`、`phase10-v48-fixture-mapping`、`p2-freeze` Electron 回归共 3 项通过。
- 2026-07-31：补齐后台导出取消回归：取消中的批次会写为 `cancelled`，仍归属该批次的 `exporting` 候选回到 `confirmed`、清空所有权和失败原因，不遗留“导出中”假状态。原剧切片服务定点回归 17 项通过。
- 2026-07-31：从正在运行的 Open Design 项目库实际进入 Version 48 原剧切片候选选中态，复核到阶段栏仅有“1 候选工作区 / 2 全部候选 / 3 完成报告”，导出属于候选池内抽屉。已同步 Product Spec、变更记录、DEV-PLAN、工作台/候选池/报告阶段栏和 Electron 断言；切片监视器移除原型中不存在的常驻播放控制，但字幕资产仍可从候选检查器进入。报告第一阶段现回到候选工作区。`pnpm run build`、目标单测、`phase8-original-clip-workflow` 与 `p2-freeze` 已通过。
- 2026-07-31：字幕资产冲突操作由“以 ASR / OCR 为准”改为单一“标记已互证”。该操作持久化 `reviewed`，保留两条原始证据、时码与差异，不创建或覆盖资产级展示字幕；迁移 23 兼容既有 `subtitle_conflicts` 状态约束。迁移、字幕服务、字幕详情和监视器单测通过；真实 OCR/ASR 引擎仍按现有未就绪状态如实反馈。
- 2026-07-31：在 `episodes` 增加媒体尺寸、`task_items` 增加导出批次归属后，将 P2/AI 测试 fixture 改为显式字段插入，避免位置式 SQL 因 schema 演进而在冻结断言之前失败；此前默认排除的 `ai-safety-and-cost` 已纳入全量测试，并改为验证 P2 成果表不存在且不生成真实素材。`pnpm test` 实测为 70 files / 256 tests 通过；该改动没有新增或恢复 P2 可执行面。
- 2026-07-31：独立审查发现候选池内层键盘滚动只阻止默认浏览器行为，未阻止事件继续冒泡到 `#main-content` 的 Home/End/PageUp/PageDown 处理器；旧 Electron 断言也没有先让主画布具备可滚动空间，无法证明主页面不滚动。该项在修复与真实桌面复验前保持部分匹配，不能以旧 End 截图作为通过证据。
- 2026-07-31：候选池修复了内层滚动区缺少 `min-height: 0` 与主候选列未建立 grid 的实际布局错误；源分集和候选区现在均为受限内层滚动容器。受控按键同时 `preventDefault()` 与 `stopPropagation()`，避免冒泡至应用壳。组件回归覆盖源分集/候选区的 Home、End、PageUp、PageDown、上下键；Electron 回归以 22 集、50 候选和人工可滚主画布验证两区 End 到内层末尾、`#main-content.scrollTop` 始终为 36。`pnpm test`（70 files / 260 tests）、`pnpm run typecheck`、`pnpm run build` 与 `phase8-original-clip-workflow` 均通过。
- 2026-07-31：再次尝试只读采集 Open Design 项目库时，进程窗口仍存在但 Windows 桌面已锁屏，画布不可安全访问；未执行解锁、点击、编辑、上传或任何项目库写入。`pnpm run validate:design-contract` 已通过；`pnpm run audit:fidelity` 仍如实为 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`，其主因是逐态项目库预览/Electron 证据缺失，现有可比较的切片工作区、候选池和完成报告截图仍超视觉阈值。
- 2026-07-31：对比已取得的 `screen-clip:candidate-selected` 基线后，移除候选已选态仍常驻的“生成设置”面板；该面板仅在无候选的生成前首屏出现，保留最近配置、生成预检和顶栏再次生成动作。回归同时修正了证据采集顺序：键盘滚动断言后先恢复主画布、源分集、候选列表到顶端并移除测试填充物，才采集候选池默认态，避免把滚到底的第 11–22 集截图伪标为默认态。真实重采集后仍未过阈值：工作区候选已选 `0.364310/15.643810`、候选池 `0.304741/17.434132`、完成报告 `0.256130/11.752474`（依次为 changedPixelRatio/meanRgbDelta）；均保持未验收。
- 2026-07-31：完成报告改为应用壳内的受限全高画布：结果行由报告内层承接，`#main-content` 不再因底部内边距形成默认滚动条；报告左侧实际宽度由 196px 对齐为 Version 48 截图的 180px。Electron 在 1440×900、1280×720 断言报告可见、无横向溢出且 `#main-content.scrollHeight <= clientHeight + 1`。当前完成报告比较降至 `0.242089/11.019614`，仍超阈值并保持未验收。
- 2026-07-31：候选池新增按 `episodeId` 的候选索引，源分集状态和当前窗口不再在 100 集 / 5,000 候选压力下重复扫描全量数组；5,000 候选窗口组件测试仍通过，定点 Electron 回归通过。报告汇总列比同步 Version 48 的 `1.15fr + 4 × 1fr`；最新审计仍为 `completed=0 incomplete=92`，候选池 `0.305195/17.430211`、完成报告 `0.243290/11.040873`，均未达到视觉阈值。
- 2026-07-31：补齐候选已存在时的多轮生成入口：顶栏“生成候选切片”先打开按需配置模态，复用生成前的数量、时长、低重合/允许重复与批量分集表单；仅预检存在可生成候选时关闭模态并让顶栏变为确认生成，零结果预检保留配置以便立即调整，候选编辑画布不再常驻低频设置。`OriginalClipWorkspacePage` 组件回归 3 项、`pnpm run typecheck`、`pnpm run build` 与 `phase8-original-clip-workflow` Electron 回归均通过；独立代码审查 Stage 1/2 均通过。候选已选视觉审计仍未过阈值，保持未验收。
- 2026-07-31：按最终原型收紧候选确认检查器：默认只保留候选上下文、左右微调、独立候选提示、全部候选池和确认；“字幕与证据”折叠后才显示展示字幕编辑和字幕资产入口。真实 Electron 证据已重采集，候选已选 1440×900 当前比较为 `changedPixelRatio=0.358254`、`meanRgbDelta=15.427435`，仍超阈值，不能写为匹配；候选池与完成报告仍分别为 `0.304684/17.430590`、`0.243296/11.040778`。
- 2026-07-31：候选检查器的“重合提示”改由同集真实候选区间计算：排除当前候选、取最大交集，以当前候选时长计算百分比；有重合时展示关联候选和时长，无重合时如实为 `0%`。组件回归覆盖 50% 重合与零重合两条分支；独立代码审查 Stage 1/2 均通过。
- 2026-07-31（历史记录，Phase 11 已取代）：旧 `SubtitleAssetsPage` 曾将详情读取与全剧集状态汇总拆开，并以组件/迁移回归验证；该页面及回归不再作为当前字幕屏证据。当前静态原型保留可见的“仅作为展示字幕”选项，但由桥接明确阻止保存，绝不静默映射。

| 原型区域 / 状态 | 原型证据 | 生产入口 / 当前证据 | 状态 | Phase 9 行动与验收证据 |
|---|---|---|---|---|
| 应用壳、左导航、顶栏 | `short-drama-material-studio.html` Version 48，`.app/.sidebar/.topbar` | `AppShell.tsx`、`prototype-interactions.css`、`p0-workflows.spec.ts`、`phase10-v48-fixture-mapping.spec.ts` | 结构匹配，视觉证据未闭合 | 最终 HTML 的基础规则已落实：≥1301px 为 220px 桌面侧栏、56px 顶栏；1280×720 按同一原型断点收缩为 72px 图标导航。路由、通知与真实数据未改。缺正式项目库逐态截图，故不把结构对齐写成视觉验收通过。 |
| 剧目库、创建/导入/空错态 | `screen-library` | `DramaLibraryPage.tsx`、既有 P0 E2E | 真实差异 | 演示封面改真实本地资产；保留既有 E2E |
| 任务中心、任务列表/失败重试 | `screen-tasks` | `TaskCenterPage.tsx`、任务服务 | 匹配 | 导出完成报告新回链后回归 |
| 标签管理 | `screen-tags` | `TagManagementPage.tsx` | 匹配 | 现有组件回归 |
| 设置与 P1 供应商页 | `screen-settings`、供应商屏 | `SettingsPage.tsx`、provider pages | 真实差异 | 真实 profile/密钥状态替代演示数据；P2 provider 负向 E2E |
| 素材生产入口 | `screen-production` 的“原剧切片” | `ProductionPage.tsx`、`DramaWorkspacePage.tsx` | 匹配 | 继续从此入口进入，不新建全局入口 |
| 多集拼接 | `screen-stitch` | `MultiEpisodeWorkspacePage.tsx` | 匹配 | 不在本轮重做；全量 E2E 回归 |
| P1 爆点前置二创 | `screen-ai` | `AiRemixWorkspacePage.tsx` | 匹配 | P1 回归；不混入字幕资产页 |
| P2 解说/TTS/旁白 | 原型 future/disabled state | 无生产 route/provider/task/result | P2 冻结 | `p2-freeze.spec.ts` 必须继续通过 |
| 原剧切片生成前、预检、双时间线、监视器 | `screen-clip` Version 48 | `OriginalClipWorkspacePage.tsx`、`MediaMonitor.tsx`、`phase10-v48-fixture-mapping.spec.ts` | 部分匹配 | 默认、候选已选、缺媒体均有真实双视口 Electron 截图与无横溢出断言；缺项目库逐状态基线，且候选已选 1440×900 仍超阈值。 |
| 源分集状态、左右微调、唯一确认 | `screen-clip` Version 48 | `OriginalClipWorkspacePage.tsx` | 匹配 | 回归：不得出现上下数字步进主路径 |
| 候选内展示字幕优化与来源 | `screen-clip` 的候选编辑状态 | `ClipSubtitleVariantStore`、`OriginalClipWorkspacePage.tsx` | 真实差异 | 保留真实证据链接与理由；不在资产页编辑 |
| 全部候选池 | Version 48 `screen-clip-pool`：工作区第二阶段、当前集、固定源分集、窗口化 | `ClipCandidatePoolPage.tsx`：按当前集过滤、20+8 窗口、真实筛选/搜索/导出；候选行无常驻选择框，批量选择在导出抽屉按 28 项窗口化；源分集与待导出队列由真实媒体/候选状态驱动 | 部分匹配 | 已按 ALIGN-011 恢复“原剧切片工作区”模块标题，四项筛选严格对齐 Version 48；未生成/待确认/已确认/导出中/已导出/异常/媒体缺失及队列计数均来自真实状态。1440×900/1280×720 Electron 截图和首屏边界断言通过。当前 1440×900 真实比较为 `changedPixelRatio=0.137820987654321`、`meanRgbDelta=10.463266975308642`，仍超合同阈值 0/0；1280×720 缺项目库预览，故不得写“匹配”。 |
| 候选池滚动与窗口 | Version 48：候选区内部滚动、剧集切换不滚主页面 | `ClipCandidatePoolPage.tsx`：源分集与候选列表均为受限、可聚焦命名滚动区；受控按键停止冒泡，分集切换重置候选窗口而不滚主页面 | 匹配 | 5,000 候选组件窗口测试；组件覆盖 Home/End/PageUp/PageDown/上下键；`phase8-original-clip-workflow` 以 22 集、50 候选与可滚主画布验证两区 End 到内层末尾而主页面维持 scrollTop=36。 |
| 导出配置、预检、进度、取消/重试 | Version 48 导出状态 | `ExportDrawer`、真实 FFmpeg 服务 | 部分匹配 | ALIGN-018 已隔离当前 `exportId` 的轮询、取消、重试和关闭后的迟到响应；组件回归覆盖旧批次成功/失败不污染新批次。真实服务回链仍保持完成报告边界。缺本批次的 Electron 双视口与项目库逐态证据，不能写为视觉匹配。 |
| 原剧切片完成报告 | Version 48 `screen-clip-report` | `OriginalClipReportPage.tsx`，导出完成后显式进入报告；`clip_export_batches` 持久化最近批次，候选池回链只传该批次 candidate ID；成果库为单独动作 | 部分匹配 | Phase 8 真实 FFmpeg Electron E2E 已覆盖导出后报告、重启后从候选池再次打开、历史候选不混入及 1440×900/1280×720 截图。结果区已具备 Version 48 的本集输出明细、五列头、真实已导出文件名和异常原因，不会把失败或未导出候选伪造成输出。最新 1440×900 真实截图为 `changedPixelRatio=0.2464135802469136`、`meanRgbDelta=11.258182098765433`，仍需视觉对齐；1280×720 仅有 Electron 证据，缺项目库预览。 |
| 成果库 | `screen-results` | `DramaAssetsPage.tsx` 的成果标签 | 匹配 | 保持为报告后的可选入口，非自动替代 |
| 字幕资产入口 | Version 48 剧目标签“字幕资产” | 工作区路径存在 | 真实差异 | 保持标签路径；候选页只提供打开动作 |
| 字幕资产首屏 | Version 48 分集列表 | 历史 `SubtitleAssetsPage.tsx` 已删除；当前仅以 `StaticPrototypeSurface` 复制 `screen-subtitles` 原文 | 待实机验收 | Phase 11 禁止复用旧列表/详情实现；项目库混合状态基线与 Electron 逐态证据仍未齐。 |
| 字幕详情 | Version 48 详情模态、完整画幅、证据独立滚动 | 历史 `SubtitleAssetsPage.tsx` 已删除；当前 DOM 必须来自静态原型原文 | 待实机验收 | 不再以旧组件回归作为当前页面证据；仍缺项目库逐态基线和 Electron 视觉验收。 |
| 字幕识别入口与设置 | Version 48 原始设置模态 | `StaticPrototypeSurface` + `SubtitleRecognitionSettingsBridge`；既有 SQLite/IPC 只负责设置持久化 | 部分匹配 | 已覆盖六项回显及保存、读取失败保护、展示策略阻止、迟到读写隔离和同会话单次保存；仍须完成当前 Electron 实机验证。 |
| ASR/OCR 互证、导出 SRT/VTT/审计 | Version 48 证据语义 | 历史 `SubtitleEvidenceService`/`SubtitleAssetsPage.tsx` 记录不再作为当前字幕屏实现证据 | 不在本次范围 | 本轮只回接识别设置，不新增或宣称字幕识别、互证或导出能力。 |
| 加载、空、错误、媒体缺失 | 原型各屏状态与文本/图标语义 | `MediaMonitor.tsx`、各页面状态反馈 | 匹配 | `MediaMonitor` 组件与 Phase 8 Electron 断言；无媒体不使用空黑框 |
| 深色 token、滚动条、模态关闭、hover/selected | Version 48 样式及交互 | `tokens.css`、`clip-module.css` | 匹配 | `pnpm run audit:fidelity`、双视口截图、模态关闭 E2E |

## 未实现项归零规则

本清单仅能在所有“缺失”与“部分匹配”行获得代码位置、真实交互、1440×900/1280×720 证据或有效 P2 冻结理由后关闭。测试通过不能替代上述逐项对照。

## 2026-08-01 当前结构差异清单

| 区块 | 最终原型要求 | 当前实现与证据 | 仍存缺口 |
|---|---|---|---|
| 剧目库 | 全局根页只承载剧目检索、筛选、分页与打开工作区 | `DramaLibraryPage.tsx`；Phase 10 Electron 回归验证库→工作区→库根返回 | 缺项目库双视口逐态视觉对照，不能标视觉匹配。 |
| 任务中心 | 从全局导航承接真实生产任务，不在剧目库重复任务摘要 | `TaskCenterPage.tsx`、真实 `TaskSummary`；路由由 `AppShell.tsx`/`RouteContent.tsx` 承接 | 仍缺最终原型任务中心的逐态项目库基线。 |
| 剧目工作区 | 资产、素材生产、字幕资产、成果库共享剧目上下文 | `DramaWorkspacePage.tsx`；Phase 10 验证从全局库进入并保留工作区标签 | 资产/成果的最终原型逐态视觉基线尚未齐。 |
| 原剧切片 | 素材生产→候选工作区→全部候选→完成报告；真实候选/导出/报告归属 | `ProductionPage.tsx`、`OriginalClipWorkspacePage.tsx`、`ClipCandidatePoolPage.tsx`、`OriginalClipReportPage.tsx`；Phase 8 双视口 Electron 流程 | `audit:fidelity` 尚未取得有效项目库逐态视觉对照。 |
| 字幕资产 | 在正确剧目上下文中作为标签/按需入口，列表→详情关系可达 | `StaticPrototypeSurface.tsx` 复制 `screen-subtitles` 原文；`SubtitleRecognitionSettingsBridge.ts` 回接既有设置读写 | 本轮不新增字幕内部后端能力；设置仍须当前 Electron 实机验证，逐态视觉对照仍缺。 |
| P2 冻结 | 不得有解说/TTS/旁白的导航、路由、preload、IPC、provider、任务或成果可执行面 | `p2-freeze.spec.ts` 当前 Electron 负向回归 | 无结构缺口；视觉验收不以 P2 未来稿为目标。 |

**本轮已跑命令：** `pnpm test`（71 files / 306 tests）、`pnpm run typecheck`、`pnpm run build`、`pnpm run validate:design-contract`、`git diff --check`、`p0-workflows` / `phase10-v48-fixture-mapping` / `p2-freeze` Electron 3 项。`pnpm run audit:fidelity` 返回 `FIDELITY_AUDIT_INCOMPLETE completed=0 incomplete=92`；这是当前未闭合项，不得改写为通过。

**补充当前截图：** 在 `pnpm run rebuild:electron` 后，`p0-workflows.spec.ts` 已在隔离 Electron 中再次通过并保存剧目库/任务中心的 1440×900 与 1280×720 截图至 `docs/design-evidence/v48/current-electron-run-p0/`；Phase 8 已保存原剧切片与字幕资产截图至 `docs/design-evidence/v48/current-electron-run/`。这些均为当前工具截图，不是原型截图；它们不能替代尚缺的 Open Design 项目库预览基线。

**基线来源复核：** Open Design 项目目录中可见 `screens-v48-original-clip-states` PNG，但该附件自身标注 `unmerged-pending-confirmation` 且只覆盖原剧切片；它不是最终静态原型的合并态。故不将其复制或登记为 `open-design-project-library-preview`，避免把待确认附件误报成正式设计证据。

**2026-08-01 MCP/导出复核：** 已以显式项目 ID 经 Open Design 自带 stdio MCP 列出 Version 48 文件，确认除最终 HTML 外仅有上述待确认的原剧切片附件，没有全量屏幕/状态基线。官方 `od export` 对最终 HTML 的真实项目渲染在当前 150% DPI 下为 2160×1500 的完整滚动页，非合同所需固定视口；不缩放、裁切或重标为项目库预览，因此 `audit:fidelity` 仍保持未通过。

**2026-08-01 固定视口源参考：** 已在本机 Chromium 以 1× 比例直接渲染最终 HTML，并按源内现有导航采集剧目库、任务中心、原剧切片与字幕资产的 1440×900、1280×720 图片，清单和边界见 `docs/design-evidence/v48/open-design-source-rendered-reference/README.md`。这是权威静态源参考，不能当作 Open Design 项目库独立预览或当前 Electron 图。用户指出的“预览 → 新标签页”路径正确；但 Codex 重启后 Computer Use 对唯一 `short-drama-material-studio` 窗口刷新选择并重试仍返回 `window id 2099202 no longer belongs to D:\\Tool\\open design\\Open Design.exe; current owner is D:\\Tool\\open design\\Open Design.exe`，故未以源参考图关闭审计或修改 `completed=0 incomplete=92` 结论。
