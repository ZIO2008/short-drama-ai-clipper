# Development Plan — 短剧投流素材生成平台

> 本文件记录当前可执行开发单元，以及原剧切片的完整候选路线图。只有“当前队列”中标为已排期的 Phase 获得执行授权；后续路线图用于说明依赖、交付和工期，不能自动启动。Phase 1–20 的完整原文已归档，不再作为当前队列、设计源或验收门禁。

## 当前状态（2026-10-13）

- 当前工作为 Phase 30 导出收口及内部候选登记，范围见本节之后的 Phase 30 授权记录。
- V49 当前门禁只覆盖 `screen-clip` 的 3 状态 × 2 视口；旧 V48 的 94 项缺口不再是当前发布许可依据。
- 当前源码、不可变候选和验证关系以 `pnpm run status:current` 为准；内部候选允许生成，正式版替换和公开发布未获授权。

## 历史状态（2026-08-29，仅供追溯）

- 当前全产品设计源只通过 `docs/current-design-baseline.json` 解析到注册表中的 current 不可变快照；本文不重复写具体版本、路径或哈希。
- superseded/legacy HTML、合同、截图、旧 `audit:fidelity` 与 Phase 1–20 只用于历史追溯；它们不能补充、覆盖或阻断 current 工作。
- current `screen-clip` 第一屏静态夹具已经建立并冻结；三种夹具状态、结构测试、类型检查和独立审查均已完成，不重复执行。
- `SUP-011` 通用供应商凭据 schema 仍保持冻结；Phase 24 只修复既有腾讯双凭据节点所有权和 packaged E2E 旁路，不修改认证 schema、密钥迁移或真实云端适配器。
- 用户已授权的 V49 `screen-clip` 第一屏运行时宿主迁移和同视口视觉验收已完成：默认候选已选、前后审阅加倍速浮层、媒体不可读均在 1440×900 和 1280×720 留存成对证据。候选池、完成报告、字幕和其它屏幕仍未获页面迁移授权；全产品设计合同/脚本门禁替换、全产品视觉验收、打包和发布也未获授权。
- V49 是静态视觉参考，不自动等同于当前运行时页面、数据或交互。任何可能改动页面结构、文案、交互或数据绑定的事项，必须先写明现状与 V49 的映射依据、影响文件、运行时影响和误改风险，并由用户逐项确认后才可实施。
- Phase 29 已完成的开发树已生成 `v0.1.92-p1-internal-trial-visual-unverified` 功能验证包：隐私审计 3,744 个文件通过，实际打包 EXE 的 100%/125%/150% DPI 冒烟为 3/3；该包只登记为 verification evidence，不是正式候选。夹具型打包 UI 用例受 Phase 24 的 packaged E2E 安全门禁阻断，不据此修改页面或放宽门禁。
- 当前开发树已形成本地 Git 收口锚点；全产品视觉审计仍为 `completed=0 / incomplete=94`，因此正式候选、正式版替换和发布继续禁止。页面迁移待决项保持独立，不因功能验收自动启动。
- 收口修复后的临时目录包已通过 packaged smoke 4/4：三档 DPI 3/3，以及不启用 E2E mock、使用系统临时隔离 userData 的 85 集导入、字幕映射和重启恢复 1/1。该临时包不登记为候选，不覆盖既有 verification 包。
- 本地锚点 `ba45738` 对应的收口独立审查 Stage 1/2 均 PASS，0 HIGH / 0 MEDIUM；该审查早于 2026-08-29 视频 P1 v2 证据变更，不能冒充当前变更已审。

## 当前队列

```text
current 基线治理与 `screen-clip` 静态夹具（已完成并冻结）
  → Phase 21：V49 `screen-clip` 第一屏运行时宿主迁移（已完成：功能、同视口视觉验收与独立审查）
  → Phase 22：原剧切片闭环核验与页面映射（只读；已完成）
  → Phase 23：切片证据基础与真实样本基线（已完成：真实 ASR/跨源证据、候选资格、冲突门禁与分层基线）
  → Phase 24：受控候选生成与任务快照（已完成：精确去重、冻结供应商/证据身份、重启隔离、发布授权与真实 PTS 回链）
  → Phase 25：原剧切片工作台行为收口（已完成：行为、异步隔离、检查器证据绑定与双视口复核通过）
  → Phase 26：候选池、批量导出与成果登记（核心业务已完成；V49 页面配置分支延期）
  → Phase 27：完成报告、成果回链与异常处置（已完成：核心报告逻辑，不改页面结构）
  → Phase 28：恢复、压力、隐私与数据安全收口（已完成：恢复、压力、隐私与备份边界通过）
  → Phase 29：真实样本验收与交付候选（已完成：文本语义 P0、人工审片闭环、隐藏盲验；视频 P1 的 dev-04 supported 与 dev-03 unclear→blocked 均通过冻结范围合同；v2 证据治理审查通过）
  → Phase 30：原剧切片导出配置（目录字段已恢复执行；命名规则、字幕策略仍暂缓）
  → Phase 31：发布准入核对（只读，已完成：确认 current V49 / 旧 V48 门禁不一致、verification-only 包身份和正式候选缺口）
  → Phase 22 的 P22-04 及 Phase 26/27 候选池/报告页面提案仍保持独立待决，不自动启动
```

## Phase 30：原剧切片导出配置（局部恢复）

**2026-10-13 内部候选收口（已授权，执行中）**：在现有 30.2–30.5 修复基础上，补齐真实 FFmpeg 重复导出、同名追加、失败/取消/进程中断后恢复的旧成果保护；重跑 current Electron 与包级隔离验证；完成独立两阶段审查后生成 `0.1.94` 新不可变内部候选。候选 manifest 与验证证据必须绑定源码提交、构建输入指纹和实际命令结果，状态入口拒绝无来源的 passed 标记，并明确候选与当前源码的关系。同步相关现行发布结论，保留历史记录。验收不扩大 V49 激活范围，不改算法、包装或页面结构，不覆盖旧包、正式版，不推送或发布。

**中间包记录**：0.1.93 包的重复导出用例漏掉重启后打开剧目的导航，包级结果为 4 通过 / 1 失败，未登记为已验证候选。补齐测试导航后已在该 EXE 上通过真实两次导出；原包不覆盖，最终候选改用 0.1.94。此调整不修改生产行为。

**复验缺陷（本轮修复）**：真实进程中断后，取消批次报告错误回链到候选的旧成功成果。须在成果登记事务内冻结本批次的成果归属；重启时保留本批已成功项，其余项标取消，不用候选全局最新成果推断本批成功。无需修改数据库 schema 或页面。

**Task 30.4 · 已导出候选再次导出（本轮执行）**：现有导出弹窗把 `confirmed` 与 `exported` 候选都列为可导出，但不得重复抢占 `exporting`；每次创建新批次/成果并沿用同名追加规则，失败、取消与重启恢复不能撤销已有成功成果。完成标准：同一候选使用不同质量或包装配置二次导出，两个文件和批次证据均保留；不修改弹窗结构。

**Task 30.5 · 本次导出显式选择（本轮执行）**：在候选行既有操作区加入可键盘操作的勾选控件；默认 0 项，切集、筛选和翻页保留选择。弹窗数量与预检配置只来自仍可导出的勾选候选；完成后清空本次选择。完成标准是勾选 1 项时只导出该项，未勾选、未确认、正在导出的候选不能误入批次，不改变应用壳和候选列表几何。

**目标**：先保证目录可编辑、已导出候选可再次导出，并且导出集合必须由用户显式选择；命名与字幕选择仍暂缓。当前同名安全合同仅支持自动追加编号，不新增覆盖模式。

**Task 30.1 · 现状和页面裁决卡（已完成）**：对照 `Product-Spec.md`、V49 完整 HTML、实际 `#exportModal`、`OriginalClipPoolReportRuntimeBridge.ts`、`ClipExportConfig` 与后端预检，形成 `docs/phase-30-export-config-decision.md`。完成标准是明确哪些合同已存在、哪些字段固定、页面增加哪些控件及其风险。

**Task 30.2 · 输出目录字段（本轮执行）**：输出目录改为可编辑；首次打开时默认取确认候选源文件夹下的 `切片` 子目录；保留主动选择目录入口。本轮不新增命名、字幕或冲突策略控件。

**Task 30.3 · 配置接入和验证（本轮执行）**：只修改导出运行时桥接和对应测试，确认默认路径、手动编辑、目录选择和导出预检都使用最终目录值；不修改 IPC、数据库或导出服务合同。

**后续交付准备**：在 Phase 30 收口后单独核对当前视觉准入标准、工作树与包身份，再决定是否生成正式候选。旧 V48 `audit:fidelity` 不作为当前 V49 页面缺陷清单；候选池、报告或全产品页面迁移不随 Phase 30 自动启动。

## Phase 31：发布准入核对（只读）

**目标**：把“功能已验收”“verification-only 包”“正式候选”“正式发布”四种身份分开，确认当前发布脚本是否仍读取旧 V48 视觉门禁，并列出形成正式候选前真正需要补的证据。此 Phase 不改页面、不改业务逻辑、不生成正式候选、不发布。

**Task 31.1 · 当前设计与视觉门禁核对**：读取 `docs/current-design-baseline.json`、`docs/design-contract-v49.json`、发布脚本和视觉审计脚本，确认 current V49 指针、旧 V48 依赖、脚本实际读取的合同和状态。输出一份差异表，区分“脚本错误”“证据缺失”“用户尚未授权的视觉范围”。

**Task 31.2 · 包身份与可重建性核对**：核对 `docs/release-evidence/`、verification manifest、baseline registry、当前提交和 `status:current`，确保验证证据可由 Git 重建；检查当前验证包是否对应最新本地提交。只读计算哈希，不覆盖旧包。

**Task 31.3 · 发布缺口清单**：把正式候选前置条件拆成三类：必须补的工程门禁、必须补的外部环境证据、需要用户决策的页面/视觉范围。旧 V48 的 `completed=0 / incomplete=94` 只作为脚本兼容性问题记录，不直接转成页面修改任务。

**Task 31.4 · 形成下一步决策包**：产出一页简明结论，明确当前能否生成新的 verification-only 包、能否生成正式候选、正式发布还缺什么，以及每项是否会改页面。完成后再由用户决定进入“发布验证”或“页面需求确认”。

**完成标准**：所有身份和门禁都有文件、哈希、命令或脚本行号证据；不修改 `src/renderer`、V49 HTML、正式数据库、正式配置或发布目录；独立审查确认结论没有把旧视觉门禁误写成当前页面缺口。

**Phase 31 结果（已完成）**：审计结论见 `docs/release-admission-audit-v0.1.92.md`。发布脚本和设计合同校验已改为读取 current V49，并按范围激活 `screen-clip` 的 6 项视觉证据；其它页面不纳入当前门禁。旧 V48 的 `completed=0 / incomplete=94` 不再作为当前运行时页面缺陷清单。本 Phase 未修改页面。

## Phase 22：原剧切片闭环核验与页面映射（只读）

**目标与范围**：核实“生成候选 → 审阅/确认 → 候选池 → 导出 → 完成报告”在当前 Electron 运行时中已经真实具备哪些能力、哪些只停留在历史记录或测试夹具；再将其中确有同一业务语义的入口与 V49 静态页面逐项比对。此 Phase 不修改 `src/`、静态 V49 HTML、现有页面、数据表、IPC、路由或设计合同，也不把 V49 当作自动替换目标。

**交付内容**：

- 建立真实闭环核验表，逐项记录当前入口、真实数据来源、IPC/服务链路、已有测试或 Electron 证据、结论和未验证前提；明确区分“已验证存在”“需要真实样本或供应商配置”“真实功能缺口”，不将历史 Phase 17–20 的叙述当作当前验收结论。
- 建立页面映射表，只在业务语义、状态和交互责任均能证明对应时记录“当前运行时入口 ↔ V49 静态区域”；无法一一对应的项明确标为“不映射”，不强行套用静态 DOM、文案或布局。
- 为每一项可能的后续改动形成独立变更提案：拟改位置、现状证据、V49 参考证据、允许替换的数据槽、影响的真实行为、风险、测试范围和回退边界。提案仅供用户确认，不实施代码或页面修改。
- 对当前 P0 原剧切片路径、候选池/导出/报告的定点测试及受影响的构建、类型检查执行只读核验；若发现缺陷，只记录可复现步骤和影响范围，不在本 Phase 修复。

**关键文件**：

- `docs/phase-22-original-clip-runtime-baseline.md` — 真实闭环核验表、页面映射表、缺口分类和证据索引。
- `docs/phase-22-change-proposals.md` — 每项待确认改动的影响、风险、验证和回退边界。
- `tests/current/p0-workflows.spec.ts` — 当前 Electron P0 链路的只读回归入口。
- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts` — 候选池、导出和完成报告的当前运行时绑定核对对象；本 Phase 不修改。
- `src/main/services/original-clip-service.ts` — 候选、确认和导出服务链路核对对象；本 Phase 不修改。

**验收标准**：

- 每一段闭环都有可定位的当前代码、测试或 Electron 证据，并明确其证据等级和外部前提；不能证明的项目不得写为“完成”。
- 所有 V49 对比项均标明“可映射”或“不映射”及理由；没有任何静态参考被直接改写进当前页面。
- 每项后续改动均能由用户单独批准或拒绝；未获批准的提案不改变实现范围。
- 本 Phase 的变更清单不含 `src/`、当前设计快照、V49 HTML、数据表或 IPC 合同；定点回归、类型检查和构建给出实际结果。既有工作树改动单独保留，不以其状态推断本 Phase 结果。

**预计完成窗口**：在现有本地测试和样本可用的前提下，约 1.5 个工作日，目标于 2026-08-22 结束。若需要真实供应商凭据、不可替代媒体或用户选择才能继续，只结束可独立核验部分，并将该外部前提逐条列为未验证项；不会因而擅自改页面或伪造通过。

**完成后的决策门**：用户逐项选择“修复真实功能缺口”“迁移某个已映射的视觉区域”或“保持现状”。只有选定的提案才会新建一个独立开发 Phase，并在实施前再次说明改动与风险。

## 原剧切片完整路线图（候选，不自动启动）

> 这条路线覆盖“可用字幕/结构证据 → 受控候选 → 人工审阅确认 → 候选池批量导出 → 完成报告 → 稳定验收”。它不等于把历史 Phase 17–20 重做：每一阶段先消费 Phase 22 的当前证据，只修复被证实的缺口。任何涉及 V49 静态页面的阶段，均须先形成独立迁移卡、说明映射和风险，并取得用户确认。

```text
Phase 22 当前事实核验与映射
  ├─ 证据或资格缺口 → Phase 23 证据基础闭环
  │                         ↓
  ├─ 候选生成或任务缺口 → Phase 24 受控候选与任务快照
  │                         ↓
  ├─ 审阅行为缺口 → Phase 25 工作台行为收口
  │                         ↓
  ├─ 候选池/导出缺口 → Phase 26 批量导出与成果追溯
  │                         ↓
  ├─ 报告或结果缺口 → Phase 27 完成报告与成果回链
  │                         ↓
  └─ 全链路稳定性 → Phase 28 恢复、压力与隐私
                            ↓
                         Phase 29 真实样本验收与交付候选

V49 候选池/报告视觉迁移是 Phase 26、27 的可选分支，不能跨过功能与用户确认门。
```

### 阶段冻结与最小回退规则

- **先冻结输入再开工**：每个 Phase 启动前记录它消费的需求 ID、数据/IPC 合同、真实样本前提、受影响文件和验收命令；后续 Phase 只能消费这个已冻结接口，不得顺手改变上游职责。
- **结束即留边界记录**：每个通过的 Phase 在 `docs/original-clip-phase-boundaries/` 新建以实际 Phase 编号命名的边界记录，写入实际改动、通过证据、未验证外部前提和允许依赖方；没有这份记录不得启动依赖 Phase。
- **后期发现问题只做定点修复**：只有明确违反已通过验收标准的缺陷，才能回流到上游。回流前必须建立一张定点修复卡，列出触发证据、违反的标准、最小影响文件、会重新验证的前后 Phase；禁止以“顺便整理”“想换实现”或新视觉想法重开已完成 Phase。
- **需求新增不回退**：新功能、V49 映射、页面结构/文案/交互调整一律创建新的并列 Phase 或可选分支；不修改已冻结的功能 Phase，除非用户明确批准其定点修复卡。
- **外部条件缺失不返工**：缺真实媒体、供应商凭据或隐藏样本时，记录为未验证前提并继续可独立工作；待条件具备后只补对应验收，不重做已经通过的实现。
- **验证只沿受影响链路传播**：定点修复重新运行该 Phase 的测试、它的直接依赖方和受影响的 Electron 场景；不因一个局部问题重跑整条历史路线或改动无关页面。
- **视觉与功能分离冻结**：功能通过不自动触发 V49 迁移；视觉迁移失败也只回到该迁移卡和对应页面，不回退候选、导出或证据服务。

## Phase 23：切片证据基础与真实样本基线

**启动门**：Phase 22 证明字幕质量、媒体 PTS、跨源关联、场景锚或版本化样本基线存在真实缺口，且用户确认处理该缺口。

**交付内容**：

- 修复已证实的证据包、`n:m` 语义关联、媒体指纹/PTS 和资格门禁缺口；原始字幕 cue、文本和时间码只读保留，缺失或冲突仍明确阻断。
- 用短夹具、公开完整集和隐藏完整集建立可复现的分层基线，区分“本地夹具可过”与“真实样本已通过”，不把一者冒充为另一者。
- 把字幕资产作为原剧切片的前置输入核验，不重做字幕页面或 OCR/ASR 功能；只有切片所需的质量、关联或读取事实出现缺口时才改后端链路。

**关键文件**：

- `src/main/services/clip-evidence-package-service.ts` — 版本化证据包、锚点和覆盖图。
- `src/main/services/semantic-event-alignment-service.ts` — 多源字幕语义关联与拒绝理由。
- `src/main/services/subtitle-evidence-service.ts` — 字幕质量和可用性事实。
- `src/main/db/subtitle-evidence-schema.ts`、`src/main/db/schema.ts` — 仅在确有持久化缺口时进行可回滚迁移。
- `docs/clip-evidence-baseline/manifest.v1.json`、`src/main/services/real-clip-evidence-baseline.test.ts` — 真实样本基线与验证。

**验收标准**：真实候选只能消费同源媒体、有效 PTS、可回链锚和合格字幕/结构证据；缺证据或未闭合冲突在预检中阻断。真实样本、临时数据库和媒体副本物理隔离，所有失败保留原有数据。

**预计工作量**：3–5 个工作日；需要用户提供或授权使用可复现的真实样本，若需云端字幕/语义能力还需要有效 profile 与凭据。

**2026-08-21 完成状态**：6 个公开样本 + 2 个隐藏样本的路径/指纹、同源媒体 PTS、版本化证据包、任务恢复/指纹漂移阻断和真实 FFmpeg/ffprobe 导出边界均有隔离证据。真实 `dev-01`、`dev-02` 完成腾讯 ASR 句级时间、OCR/ASR 跨源事件、证据包和 `qualified_with_limit` 候选资格；短夹具覆盖 `n:m` 与冲突 blocked。`dev-02` 实际未触发预设冲突，已如实标记场景卡不成立；隐藏语义场景留给 Phase 29 盲验。详见 `docs/phase-23-evidence-baseline-20260821.md` 和 `docs/original-clip-phase-boundaries/phase-23.md`。

## Phase 24：受控候选生成与任务快照

**启动门**：Phase 23 的证据前置通过，或 Phase 22 证明当前证据链已足以安全生成；用户确认修复候选生成的实际缺口。

**交付内容**：

- 将生成前的分集、资格、资源、供应商和预算检查收敛为真实门禁；文本语义能力不可用、返回不合格或证据不足时阻断，不用模板候选或人工补秒数伪装成功。
- 固化候选的媒体、证据、事件、锚、规则、供应商和配置快照；重算只创建新轮次，迟到、取消或重启不能覆盖发布指针。
- 让模型只选择既有事件/锚 ID，程序校验 PTS、归属、顺序和证据；视频复核仅处理必要最小片段，失败依合同阻断或受限。

**关键文件**：

- `src/main/services/clip-candidate-intelligence-service.ts` — 受控语义候选生成。
- `src/main/services/openai-compatible-clip-semantic-adapter.ts` — 结构化语义适配边界。
- `src/main/services/original-clip-service.ts` — 生成、发布和候选状态。
- `src/main/ipc/production-ipc.ts`、`src/preload/index.ts`、`src/shared/contracts.ts` — 最小受限 IPC 合同。
- `src/main/services/clip-candidate-intelligence-service.test.ts`、`src/main/services/original-clip-service.test.ts` — 候选和任务回归。

**验收标准**：同输入活动任务去重；取消/失败/迟到结果不改旧候选或配置；每个已发布候选能回链到冻结证据与真实 PTS。不得因本阶段改变任何 V49 页面布局。

**预计工作量**：4–6 个工作日；真实语义能力联调和真实样本结果属于外部前提，无法提供时只能完成本地门禁与适配器验证。

**2026-08-22 完成状态**：活动任务去重已绑定完整请求、eligible 证据包身份、媒体指纹、规则以及文本语义/可选视频复核 provider chain；两段 provider 任一配置变化都不会被旧任务静默使用。旧队首、关机和崩溃恢复不会重放 provider。发布边界验证 candidate/task/round/config/provider/episode/事件 kind/资格与三位小数 PTS，迟到、取消、中断、媒体漂移和事务中途失败均不能覆盖稳定 pointer。packaged 进程无条件清除大小写变体 E2E 覆盖；current Electron 生成与 provider 隔离链通过。没有修改 V49 页面布局；腾讯双凭据仅修复现有 2026-08-05 ASR 页面运行时节点归属，详见 `docs/prototype-migration/provider-credentials-v49-phase24.md` 和 `docs/original-clip-phase-boundaries/phase-24.md`。

## Phase 25：原剧切片工作台行为收口

**启动门**：Phase 22 或 Phase 24 发现真实审阅、确认、媒体会话或异步隔离缺口，且用户确认该功能修复；已验收的 V49 `screen-clip` 三状态不因本阶段重新设计。

**交付内容**：

- 修复被证实的切集原子同步、媒体解绑、真实 PTS 定位、审阅范围、确认授权和迟到请求隔离问题。
- 保持播放、定位、字幕高亮和边界编辑职责分离；四个微调按钮仍是唯一能持久化边界的入口。
- 补足真实缺媒体、加载失败、候选切换、取消和重启后的可见事实与回归，不能将失败伪装成空状态。

**关键文件**：

- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.ts` — 已验收工作台的受限运行时绑定。
- `src/renderer/src/pages/clip-workspace-media-session.ts`、`src/renderer/src/pages/clip-workspace-surface.ts` — 媒体会话和页面内状态。
- `src/main/services/original-clip-service.ts`、`tests/current/p0-workflows.spec.ts` — 真实候选、确认与 Electron 回归。

**验收标准**：工作台只显示当前分集和候选；媒体切换、缺媒体或定位失败立即停止并释放旧状态；确认仍是导出唯一授权。若涉及 V49 结构、文案或控件位置，必须先另立迁移卡并取得用户确认。

**预计工作量**：0–4 个工作日；如 Phase 22 证明现有行为完整，则本 Phase 以“无代码改动、保留证据”结束。

**2026-08-23 完成状态**：候选时间线左右键每次 1 秒且限制在候选入/出点，Space 不在按钮、表单、contenteditable、模态或非工作台焦点触发；播放/定位继续不写候选，四个 0.1 秒按钮仍是唯一边界写入口。最新 taskRound 保证取消/中断/失败在重开后可见且旧任务不覆盖新稳定轮次。并发 refresh、seek setter 异常、inline/跨集候选切换、旧媒体 error、queued write、真实 Electron 确认和 CLIP-024/034 检查器证据绑定均有回归。未修改 V49 静态 HTML、DOM 顺序、布局或控件位置；仅在既有 `.r5-note` 和 `.r5-anchor` 数据槽绑定真实证据语义。详见 `docs/original-clip-phase-boundaries/phase-25.md` 与 `docs/prototype-migration/phase25-clip-inspector-evidence.md`。

## Phase 26：候选池、批量导出与成果登记

**启动门**：Phase 24 的候选快照和 Phase 25 的确认授权可用，且用户确认处理候选池或导出缺口。

**交付内容**：

- 修复候选池的真实筛选、搜索、窗口化、跨分集隔离、删除保护和重复选择语义；压力目标为 100 集 × 50 候选、500 待导出，不以全量 DOM 堆砌处理。
- 修复导出预检、目录选择、命名/编码/尺寸/字幕/冲突配置、批次进度、取消、重试和 FFmpeg 边界验证；导出失败不登记成果，源片始终不改写。
- 建立可选的候选池 V49 迁移分支：只有 Phase 22 明确为可映射、用户批准迁移卡并确认页面影响后，才建立静态夹具、绑定真实数据并做同视口视觉验收；否则只修复业务服务和现有页面中的事实问题。

**关键文件**：

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`、`src/renderer/src/pages/OriginalClipPoolReportInteractionBridge.ts` — 候选池和导出入口。
- `src/main/services/clip-export-runtime.ts`、`src/main/services/clip-export-task-config.ts`、`src/main/services/clip-export-verifier.ts` — 导出执行、配置与边界核验。
- `src/main/services/original-clip-service.ts`、`src/main/ipc/production-ipc.ts`、`src/preload/index.ts` — 候选状态和受限任务接口。
- `docs/prototype-migration-card-original-clip-v49-candidate-pool.md` — 仅在获批视觉迁移时创建。

**验收标准**：只有已确认候选可进入真实导出；任务可取消、失败可追溯、成功成果有来源候选和输出校验；候选删除永不删除源片或已导出成果。视觉迁移分支另行通过静态夹具、双视口和真实失败状态验收。

**预计工作量**：核心业务 4–6 个工作日；若批准候选池 V49 全屏/屏内迁移，另加 3–5 个工作日，且先向用户提交具体改动说明。

**2026-08-23 状态**：核心业务已完成并通过独立两阶段审查：候选池真实筛选/搜索/窗口化/跨集隔离/删除保护，批量导出预检/进度/取消/失败/重试/FFmpeg 校验，成果登记与源片完整性均有隔离 Electron 或服务证据。用户明确跳过页面修改分支；当前导出入口继续自动收集全部 `confirmed` 候选，命名、字幕和同名策略由后端合同固定，页面不暴露完整配置。详见 `docs/original-clip-phase-boundaries/phase-26.md`。

## Phase 27：完成报告、成果回链与异常处置

**启动门**：Phase 26 至少存在一条真实或隔离的可验证导出批次，且用户确认报告/成果范围的缺口处理。当前启动授权仅覆盖核心报告逻辑；V49 完成报告页面迁移仍延期。

**交付内容**：

- 让完成报告只读取最近真实完成批次，按分集显示成功、失败、取消和未输出原因，并回链候选、范围、配置快照和实际成果。
- 补齐打开成果位置、返回候选、失败重试和异常筛选的边界；报告读取失败不能改变导出任务或伪装为无数据。
- 建立可选的完成报告 V49 迁移分支，规则与候选池相同：先证明映射、获用户批准，再迁移静态结构与做视觉验收。

**关键文件**：

- `src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts`、`src/renderer/src/pages/OriginalClipPoolReportInteractionBridge.ts` — 完成报告和结果跳转。
- `src/main/tasks/task-report-service.ts`、`src/shared/contracts.ts` — 报告聚合与脱敏数据合同。
- `src/renderer/src/pages/TaskCenterPage.tsx` — 任务中心中的聚合结果入口。
- `docs/prototype-migration-card-original-clip-v49-report.md` — 仅在获批视觉迁移时创建。

**验收标准**：报告不显示静态示例、不会串批次；每一条结果可追溯但不泄露源路径、密钥或完整字幕。视觉迁移仅在用户批准的范围内执行。

**预计工作量**：核心业务 2–4 个工作日；若批准报告 V49 迁移，另加 2–4 个工作日。

**2026-08-23 执行范围**：先收口真实批次读取、成功/失败/取消/未输出原因、候选与成果回链、异常筛选及读取失败隔离；复用现有页面数据槽和跳转出口，不新增控件、不调整布局、不创建报告 V49 迁移卡。已通过 Stage 1/2 独立审查，以及完整测试、类型检查、构建、Electron 重建和目标 E2E；Phase 28 进入当前队列。仍保留一项非阻断质量建议：新 manifest 的 episodeId 与 start/end 应成套校验。

## Phase 28：恢复、压力、隐私与数据安全收口

**启动门**：Phase 23–27 的实际改动已合并为一个可运行闭环，且用户确认进行跨链路可靠性工作。

**交付内容**：

- 覆盖生成和导出任务的去重、并发预算、排队、取消、重启中断、迟到回调、重试和发布指针保护。
- 覆盖 85 集资产、5,000 候选、500 待导出的性能基线，以及候选、成果、原始证据、媒体与密钥的非破坏边界。
- 对涉及数据结构的改动建立可校验备份、副本迁移、原子提升和恢复演练；问题报告只生成最小脱敏本地包。

**关键文件**：

- `src/main/services/original-clip-service.ts`、`src/main/services/clip-export-runtime.ts` — 任务和成果一致性。
- `src/main/db/schema.ts`、`src/main/db/migrate.ts` — 仅在已获批的可回滚数据变更中使用。
- `src/shared/contracts.ts`、`tests/current/p0-workflows.spec.ts` — 跨进程数据边界与当前 E2E 回归。
- `docs/phase-28-original-clip-reliability-report.md` — 压力、恢复和隐私证据摘要。

**验收标准**：中断、失败、升级和恢复不清空旧有效数据；没有源媒体/明文密钥/用户路径泄漏到日志、报告或测试快照；压力基线可重复并有实际结果。

**预计工作量**：3–5 个工作日。

**2026-08-23 状态**：已完成。现有生成/导出可靠性边界通过独立两阶段审查；新增精确 85 集、5,000 候选和 500 项受控队列压力测试；备份脱敏覆盖分集、导入目录、封面、成果和任务配置路径。通过 124 files / 707 tests（5 skipped）、类型检查、构建、Node/Electron 原生重建和目标 Electron E2E。未修改页面结构，V49 候选池/报告迁移继续延期。详见 `docs/phase-28-original-clip-reliability-report.md`。

## Phase 29：真实样本验收与交付候选

**启动门**：前述已获授权的功能 Phase 均通过定点回归，且具备符合分层基线要求的真实样本与必要的供应商条件。

**交付内容**：

- 以冻结的短夹具、公开完整集和隐藏完整集，跑通“证据 → 候选 → 人工确认 → 导出 → 报告”并保留受控证据；区分本地验证、真实供应商验证和未验证的外部前提。
- 执行代码审查、完整性测试、类型检查、构建、真实 Electron 回归和安全检查；只重验受影响链路，不把已冻结的其它页面拖入重跑。
- 形成交付候选说明、已知限制和回滚信息。打包或发布仍需用户另行授权，不在本 Phase 自动执行。

**关键文件**：

- `tests/current/p0-workflows.spec.ts`、`tests/compatibility/real-original-clip-trial.spec.ts` — 当前与真实样本回归。
- `src/main/services/real-clip-evidence-baseline.test.ts`、`src/main/services/real-clip-export-evidence-baseline.test.ts` — 分层基线和真实导出验证。
- `docs/phase-29-original-clip-acceptance.md` — 端到端验收、外部前提与限制。

**验收标准**：所有声称完成的原剧切片能力都有实际运行证据；未获得的供应商、媒体或用户授权明确保留为未验证；不因验证写回原片或生产数据。

**预计工作量**：3–5 个工作日；真实供应商和隐藏样本不可用时，结束本地与公开样本部分，不虚构正式验收。

**2026-08-23 当前进度**：公开 6 集 + 隐藏 2 集证据包基线通过，dev-06 真实 FFmpeg 导出通过，冻结发布治理基线通过；独立 Stage 1/2 审查通过。真实供应商候选生成和 8 集完整端到端外部链路仍列为未验证，不自动打包或发布。详见 `docs/phase-29-original-clip-acceptance.md`。

**2026-08-24 阶段性进度（已被 2026-08-25 完成状态覆盖）**：Task 29.1 三能力无媒体预检通过并经独立 Stage 1/2 审查；正式配置库 SHA 未变化。Task 29.2 在保护上下文保守规则后，`dev-01`、`dev-02` 均得到 1 条 `qualified_with_limit`、0 blocked，文本语义 P0 已通过。Task 29.3 的 `dev-04` 无媒体预检成功，但真实帧级请求和临时 `qwen3.7-plus` 复测均未返回可用受限结果；视频复核降为 P1，不再阻断文本/结构候选人工审片。Task 29.4 packaged-only 闭环执行器和 Task 29.5 6+2 事实矩阵已完成本地实现；一次完整闭环复跑仍受 DeepSeek 输出波动影响，未写成通过。页面、V49、生产库、打包和发布均未修改。

**2026-08-24 阶段性结论（已被 2026-08-25 完成状态覆盖）**：本地实现、719 项测试、类型检查、构建、Electron 重建、目标 E2E 和独立 Stage 1/2 审查均通过；当时真实供应商硬门尚未通过，因此未标记 Phase 29 完成。脱敏证据见 `docs/phase-29-evidence/run-manifest-20260824.json`。

**2026-08-24 临时模型复测结果**：用户授权后仅在临时 SQLite 使用 `qwen3.7-plus` 对 `dev-04` 复测一次；供应商返回无法满足受限 JSON 结果合同，分类为 `invalid-result`，正式配置库 SHA 保持不变。视频复核不再阻断文本 P0 主线。

**2026-08-25 P0 完成记录**：保护上下文由本地规则保守收口：有 `contextBefore/contextAfter` 的窗口即使供应商声称 `standalone`，也只能进入 `limited`；有保护上下文时允许 `continuity=limited`，`unclear`、越窗、时间倒置、事件映射错误和多候选仍拒绝。真实 `dev-01`、`dev-02` 均得到 1 条 `qualified_with_limit`、0 blocked；`hidden-01` 唯一盲验得到 OCR 67、ASR 52、1 条 `qualified_with_limit`、0 blocked。`dev-02` packaged-only 完整闭环通过：人工确认、真实 FFmpeg 导出、成果 `materialId`、报告项和源片 SHA 全部通过，正式数据库写入 0。当日曾将视频 `dev-03/dev-04` 记录为通过，后续独立审查已推翻该扩张结论，详见下方 2026-08-26 更正。Phase 29 的 P0 与人工审片主线完成；打包/发布仍需另行授权。

**2026-08-25 视频复核 P1 追加授权记录**：用户授权继续修复 Model Studio 视频复核。`qwen3.7-plus` 使用官方严格 JSON Schema 输出，锁定 conclusion、evidenceIds、claimKinds、reason 及 `additionalProperties=false`。当日 `dev-04 supported` 与 `dev-03 unclear` 只保留为供应商能力探测；因未绑定冻结候选，不能作为 P1 业务验收。该追加任务不修改页面、V49、正式 profile、数据库 schema、文本语义 P0 或打包发布状态。

**2026-08-26 独立审查更正（覆盖上述视频通过声明）**：旧视频执行器实际从整集 PTS 中段取帧，并为 package/evidenceId 生成临时身份，没有回链冻结候选边界；所以 `dev-03/dev-04` 只能算供应商能力探测，不能算 Task 29.3 通过。当前实现已改为读取哈希冻结的 `multimodal-scopes.v1.json`，在临时 SQLite 建立稳定 package、candidate、snapshot、B 级 scene evidenceId 和精确 PTS，再从本地证据读取命题、派生 factCode、记录帧哈希和供应商快照。旧结果不沿用；在新合同真实复跑前，两项均为 `limited-evidence`。6+2 矩阵已由封存账本完整覆盖，两个隐藏样本的 `runCount=1`，packaged 语义入口会在读取媒体或供应商配置前拒绝重复隐藏运行。Phase 29 的 P0 主线完成结论不变，P1 延期不阻断人工审片；页面、V49 与正式数据仍未修改。

**2026-08-29 视频 P1 冻结范围复验完成**：使用包含冻结 scope 执行器的实际打包 EXE、只读正式供应商配置、临时 SQLite 和新结果路径复验。`dev-04` 绑定稳定 package/candidate/snapshot/evidenceId、65.64–65.72 秒和 5 帧，供应商返回 `supported`；`dev-03` 绑定对应稳定身份、32.16–32.24 秒和 5 帧，供应商返回 `unclear`，系统正确保持 `blocked`。两次正式配置库 SHA-256 前后均为 `14447B235DAA20FD2A8BABB68AF79AFF545CC846B5E6D50AAEE92C8756E441E3`，写入 0。当前裁决封存在 `acceptance-ledger.v2.json` 与 `run-manifest-20260829-video-bound.json`；旧能力探测继续为 superseded。未修改页面、V49、正式配置或正式版。

**2026-08-30 最终审查**：P1 v2 的 tracked 脱敏逐帧结果、scope/ledger/run-manifest 三方身份、正负样本精确集合、供应商快照、生产库零写入、历史不可改写和验证数字经独立 Stage 1/2 复核通过，0 HIGH / 0 MEDIUM。全量 Vitest 133 files / 742 tests passed（5 skipped），build、Electron rebuild、current E2E 串行 14 passed / 7 conditional skipped。

### 2026-08-24 剩余执行计划：真实供应商端到端验收

**授权与固定边界**：用户已授权执行真实供应商验收。只允许读取当前正式应用中已保存的 profile 与密钥引用，并在同一 packaged identity 内复制到临时 SQLite；正式数据库始终只读。所有媒体、候选、导出、报告和结果 JSON 使用临时目录或既有测试结果目录。不得输出明文密钥、完整字幕、源路径或完整请求体；不得修改候选池、导出模态、完成报告布局、V49 静态 HTML、数据库 schema，也不得打包或发布。

**依赖顺序**：

```text
29.1 三能力只读预检
  → 29.2 文本语义公开样本（P0）
  → 29.4 单样本完整闭环（视频复核可选，人工审片兜底）
  ↘ 29.3 最小视频复核（P1，可并行，不阻断 29.4）
  → 29.5 公开 6 集 + 隐藏 2 集冻结矩阵
  → 29.6 回归、审查与封存
```

#### Task 29.1：packaged identity 与三能力只读预检

**交付内容**：

- 验证腾讯云 ASR、DeepSeek 文本语义、阿里云百炼视频复核三个 profile 的 endpoint、模型、密钥引用和当前 packaged identity 可解密性。
- 分别执行无业务媒体的连接/模型发现预检，记录成功或固定失败类别；不把“连接成功”改写成“真实识别/语义/视频能力通过”。
- 记录正式配置数据库写入数为 0，并扫描结果 JSON、日志和测试快照，确认不含密钥、用户路径和业务素材。

**关键文件**：

- `src/main/services/packaged-real-semantic-evidence.ts` — 腾讯 ASR 与 DeepSeek profile 的只读复制和预检入口。
- `src/main/services/packaged-real-multimodal-probe.ts` — Model Studio 无媒体连通性与模型可用性预检。
- `src/main/packaged-evidence-dispatcher.ts` — packaged-only 参数路由和脱敏结果输出。

**验收标准**：三个能力各自得到真实且可分类的结果；正式数据库 SHA/写入计数不变；任一能力失败时只阻断依赖它的后续 Task，不伪造替代供应商或清空旧配置。

**预计用时**：0.5 个工作日。

#### Task 29.2：真实 OCR/ASR → DeepSeek 文本语义公开样本

**交付内容**：

- 在调用前冻结 `dev-01`（OCR/ASR 对齐）和 `dev-02`（OCR/ASR 冲突）的预期资格、失败类别和禁止行为，不根据供应商返回结果反向调标准。
- 对 `dev-01`、`dev-02` 分别运行本地 OCR、真实腾讯 ASR、跨源裁决、证据包和 DeepSeek 结构化候选生成。
- 验证模型只能返回给定事件/锚 ID，PTS 由本地不可变证据解析；越窗、事件映射、时间顺序、连续性和候选数量错误必须被本地门禁拒绝。

**关键文件**：

- `src/main/services/packaged-real-semantic-evidence.ts` — 两个公开样本的真实文本语义验收执行器。
- `src/main/services/openai-compatible-clip-semantic-adapter.ts` — 最小材料请求与结构化响应边界。
- `docs/clip-evidence-baseline/scene-cards.md` — 调用前冻结的样本预期；保持只读，不按结果调参。

**验收标准**：两个样本分别产生与冻结场景卡一致的 `qualified`、`qualified_with_limit` 或 `blocked` 事实；OCR/ASR/候选均可回链，源媒体 SHA 不变，正式数据库写入为 0。若余额、认证、限流、模型或响应合同失败，保留准确失败码并停止扩大样本。

**预计用时**：0.5–1 个工作日。

#### Task 29.3：Model Studio 最小视频复核（P1，可选）

**交付内容**：

- 先执行不带媒体的 Model Studio 连通性和兼容视频模型预检。
- 对 `dev-04` 只发送本地截取的最多 12 张、绑定 PTS 和哈希的最小帧集，验证 `supported` 结果和证据 ID 回链。
- 对 `dev-03` 的视觉不明确场景冻结负向预期；没有足够证明时必须维持 blocked，不得以连接成功或通用描述升级资格。

**关键文件**：

- `src/main/services/packaged-real-multimodal-probe.ts` — 无媒体连通性预检。
- `src/main/services/packaged-real-multimodal-evidence.ts` — `dev-03`/`dev-04` 最小帧级复核。
- `src/main/services/clip-multimodal-review-service.ts` — 帧数、大小、超时和单次受控重试预算。

**验收标准**：`dev-04` 的支持结论有帧哈希、PTS、证据 ID 和供应商快照；`dev-03` 缺证明时保持 blocked；不上传整集、路径、数据库、字幕全文或密钥，正式数据库写入为 0。该 Task 失败不阻断已有文本/结构证据候选进入人工审片和确认导出。

**预计用时**：0.5–1 个工作日。

#### Task 29.4：单个公开样本完整闭环

**交付内容**：

- 新增 packaged-only 隔离执行器，以首个通过资格门的公开样本跑通“证据 → 候选 → 人工确认授权夹具 → 真实 FFmpeg 导出 → 完成报告”。
- 在临时 SQLite 中核对冻结任务轮次、候选证据、确认状态、导出批次、成果 `materialId` 和报告回链；失败、取消和未输出不得改写为完成。
- 比较执行前后源媒体 SHA、正式配置数据库哈希/写入计数和临时目录清理结果。

**关键文件**：

- `src/main/services/packaged-real-original-clip-e2e.ts` — 新增完整闭环的 packaged-only 执行器。
- `src/main/packaged-evidence-dispatcher.ts` — 新增受限参数和绝对结果 JSON 路径。
- `src/main/services/clip-export-runtime.ts`、`src/main/tasks/task-report-service.ts` — 复用既有导出与报告合同，不改变页面。

**验收标准**：文本语义 P0 通过后，至少一个公开样本真实生成合格/受限候选，经明确确认后生成可播放成果，报告可回链候选、范围、配置和成果；视频供应商不可用时复用当前工作台人工审片，不把人工决定写成自动证据或供应商结果；源片与正式数据库不变，临时文件可清理。

**预计用时**：1 个工作日。

#### Task 29.5：公开 6 集 + 隐藏 2 集冻结验收矩阵

**交付内容**：

- 按 `ocr-asr-aligned`、`ocr-asr-conflict`、`visual-review-unclear`、`visual-only-supported`、`queue-recovery`、`partial-success` 六类公开场景执行并汇总所有独立失败。
- 对 `hidden-01`、`hidden-02` 只执行一次冻结验收；结果用于验收，不用于修改阈值、提示、规则或供应商配置。
- 将每个样本标记为通过、受限、正确阻断或外部失败，并附本地证据、供应商证据、源 SHA、正式库零写入和清理结果。

**关键文件**：

- `docs/clip-evidence-baseline/manifest.v1.json` — 6+2 不可变样本身份与哈希，只读。
- `src/main/services/packaged-real-original-clip-e2e.ts` — 分层矩阵编排与事实摘要。
- `docs/phase-29-original-clip-acceptance.md` — 逐样本结果、限制和回滚信息。

**验收标准**：公开样本的文本语义 P0 符合冻结场景卡；视频复核 P1 的供应商失败可单列并转人工审片，不阻断已有文本/结构候选；隐藏样本只有在文本语义 P0 通过后才执行一次，硬门禁 100%，不得出现越权候选、猜测 PTS、源片写回、生产库写入或隐私泄漏。供应商外部失败单列，不得以本地夹具冒充通过。

**预计用时**：1–1.5 个工作日。

#### Task 29.6：完整回归、独立审查与开发主线封存

**交付内容**：

- 执行受影响定点测试、全量 Vitest、TypeScript strict、构建、Electron 原生重建和 current Electron E2E。
- 派发独立 Stage 1/2 code review，核对 Spec、冻结样本预期、真实调用证据、零生产写入和未授权范围。
- 更新 Phase 29 验收记录和 DEV-PLAN；将真实供应商无法控制的余额、认证、限流或模型开通问题保留为外部风险，不虚构完成。

**关键文件**：

- `docs/phase-29-original-clip-acceptance.md` — 最终证据与限制。
- `DEV-PLAN.md` — 原剧切片开发主线完成状态。

**验收标准**：文本语义 P0 和至少一个人工审片兜底的完整闭环有当场证据；视频复核 P1 可明确记录为通过、正确阻断或外部未通过，不能阻断主线；Stage 1/2 均 PASS，页面和 V49 保持未修改。完成只代表原剧切片开发主线封存，不代表打包或发布。

**预计用时**：0.5 个工作日。

**阶段预计结束时间**：在三个供应商均可用、额度充足且没有响应合同缺陷的情况下，预计 4–6 个工作日，于 2026-08-27 至 2026-08-31 完成。若遇外部认证、余额、限流或模型未开通，先完成不依赖该条件的矩阵，准确记录外部阻断；不会因此修改页面或回退重做 Phase 21–28。

## 工期与结束条件

| 路线 | 包含范围 | 预计投入 | 预计日历窗口（从 2026-08-20 起、用户决策与样本均及时提供） |
| --- | --- | --- | --- |
| 当前核验 | Phase 22 | 约 1.5 个工作日 | 2026-08-22 |
| 功能主线 | Phase 22–29，排除未证实缺口与可选 V49 页面迁移 | 约 20–31 个工作日 | 2026-09-18 至 2026-10-05 |
| 含视觉分支 | 功能主线 + 获批的候选池、完成报告 V49 迁移 | 在功能主线上增加 5–9 个工作日 | 约 2026-09-25 至 2026-10-16 |

原剧切片的“开发任务结束”定义为：Phase 29 对已获授权范围通过真实样本验收，并将所有未能验证的外部前提列明。它不等于自动打包、发布，也不等于全产品 V49 视觉迁移完成。

## Phase 21：V49 `screen-clip` 第一屏运行时宿主迁移

**目标与范围**：把 V49 原剧切片的完整第一屏应用壳、页面坐标系、滚动边界和工作台结构迁入真实 Electron renderer，并把既有原剧切片运行时绑定到原型已有节点。只覆盖原剧切片第一屏；不启动候选池、完成报告、字幕或其它页面迁移。

**交付内容**：

- 建立 V49 第一屏的完整 Electron 宿主，保留原型已有的应用壳、侧栏、页面容器、媒体监视器、双时间线、候选检查器及其滚动归属。
- 将真实剧目、分集、候选、媒体地址和已有交互回调限制性绑定至原型已有数据槽，不复制静态示例数据，也不改变元素顺序、网格、尺寸或状态 DOM。
- 复用 `OriginalClipWorkspaceRuntimeBridge`、`clip-workspace-media-session` 与既有 IPC，保持 CLIP-008、CLIP-045 的媒体会话、定位、播放、审阅与 0.1 秒边界不变量；不得以迁移名义重写这些行为。
- 覆盖默认候选已选、前后审阅加倍速浮层、媒体不可读三种目标状态的结构和真实失败路径，并补充受影响的定点测试。

**关键文件**：

- `docs/prototype-migration-card-original-clip-v49-runtime.md` — 全屏迁移合同、DOM 所有权、数据槽和视觉证据条件。
- `src/renderer/src/pages/StaticPrototypeSurface.tsx` — V49 静态夹具与真实宿主入口的隔离边界。
- `src/renderer/src/pages/OriginalClipWorkspaceRuntimeBridge.ts` — 既有运行时向 V49 节点的受限绑定。
- `src/renderer/src/pages/clip-workspace-surface.ts` — 原型内动态内容和状态呈现辅助函数。
- `src/renderer/src/pages/clip-workspace-media-session.ts` — 当前源分集唯一媒体会话与播放控制。

**验收标准**：

- 1440×900、1280×720、100% 缩放下，原型与 Electron 的默认、前后审阅加倍速浮层、媒体不可读均有成对截图、哈希、比较区域和接受结论；详见 `docs/design-evidence/v49/screen-clip/`。
- 默认、前后审阅加倍速浮层和媒体不可读状态保持原型结构；真实数据只替换受限数据槽，切换分集不残留旧媒体、旧候选或旧时间线。
- `OriginalClipWorkspaceRuntimeBridge` 的既有行为回归、迁移新增测试、类型检查、构建和 current E2E 受影响路径通过；独立代码审查两阶段通过。
- 本 Phase 不创建数据库迁移、不改供应商认证、不启动候选池/报告/字幕/全产品合同门禁替换/打包/发布；视觉验收仅覆盖本计划已经列明的 `screen-clip` 三种状态。

## 技术栈

| 层级 | 技术 | 当前锁定版本 | 本 Phase 用途 |
| --- | --- | --- | --- |
| 桌面运行时 | Electron | 43.1.1 | Windows 桌面宿主与隔离运行时 |
| 构建 | electron-vite | 5.0.0 | 主进程、preload 与 renderer 构建 |
| UI | React / React DOM | 19.2.7 | 工作区宿主和状态入口 |
| 语言 | TypeScript | 7.0.2 | 主进程与 renderer 类型边界 |
| 数据库 | SQLite / better-sqlite3 | 12.11.1 | 复用既有剧目、分集、候选和任务数据；本 Phase 不迁移表 |
| 单元测试 | Vitest | 4.1.10 | 迁移卡、隔离层和运行时桥定点回归 |
| 桌面测试 | Playwright | 1.61.1 | 真实 Electron 结构与行为测试 |
| 包管理 | pnpm | 11.9.0 | 依赖和验证命令 |

本次只是计划入口重组，未更换技术选型或依赖版本；以上版本直接来自当前 `package.json`。

## 数据库变更

当前没有获授权的数据库变更。

## 开发规则

- 一次只执行一个可独立验收的 Phase；完成并冻结后，不因后续 Phase 自动重跑或重写。
- 任何需求或设计边界变化先更新对应源文档，再修改代码。
- UI 以 current HTML 为唯一当前来源；真实数据、安全、IPC、P2 冻结和源文件保护继续服从 `Product-Spec.md`。
- 每个 Phase 完成 Code Review、测试完整性、编译验证和功能测试；只重验受影响链路。
- `build`、`rebuild:electron` 与 Electron E2E 串行执行，避免 `better-sqlite3` ABI 污染。
- 当前工作树未收口，不自动提交、推送、打包或发布。

## 历史归档

- 完整计划：`docs/history/dev-plan/DEV-PLAN-phases-1-20-through-2026-08-17.md`
- 原始规模：133928 字节、798 个物理行。
- 原始 SHA-256：`5F6B5554B8D012E53E185BDEEE63E53AAA87EE190891ED34CD6772287C1AC946`。
- 归档只用于追溯 Phase 1–20 的已发生工作、当时的技术选择和验收记录；不得从归档恢复待办或 superseded/legacy 门禁。
