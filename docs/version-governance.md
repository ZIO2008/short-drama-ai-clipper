# 版本治理

当前受控范围：`P1 · 内部试点`。应用版本唯一来自 `package.json` 的 `version`；范围和通道唯一来自 `src/shared/release-metadata.ts`。P2 解说/TTS/旁白仍无生产入口，不能当作本候选功能。

工作空间入口和文档权威顺序见 `D:\个人工作\WORKSPACE-CURRENT.md`。本文件必须区分“当前开发工作树”与“最近不可变候选”：工作树存在未提交变更时，不能以 `package.json` 的数字或目录修改时间把它称为发布版本。

## 当前设计基线与发布前置

V49 是全产品唯一当前设计基线：`design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`（SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`）。V48 HTML、`docs/design-contract-v48.json`、V48 截图和 V48 `audit:fidelity` 结果均为历史追溯资料，不得作为当前 V49 开发、视觉验收或发布的裁决。

当前 V49 合同已按 `screen-clip` 激活：3 个状态 × 2 个视口，共 6 项视觉证据；`validate:design-contract`、`audit:fidelity` 和打包入口读取当前 V49 合同。该范围允许生成内部候选，不代表全产品视觉完成或公开发布。其它屏幕的迁移和验收仍需另行授权。下文 2026-08 的未启用记录是历史事实，不覆盖本段现行结论。

## 当前状态的唯一查询方式

在主线根目录执行 `pnpm run status:current`。它只读 Git，校验候选 manifest、EXE 和 app.asar 的哈希，分别报告最近不可变候选、当前标准下已验证候选，以及它与当前源码是否一致。schemaVersion 2 要求干净源码提交、构建输入指纹、当前 scoped 设计合同指纹；验证记录的 tests/typecheck/build/currentE2E/packagedE2E/fidelity/review 均须引用实际命令记录和输出日志哈希，并绑定 manifest/closure。`tools/run-candidate-check.mjs` 负责捕获真实命令、开始/结束时间、环境与退出码；独立审查报告作为 review 的输出证据。本地哈希用于追溯和发现变化，不是防止有写权限者伪造的认证系统。无来源的旧 passed 标记不得作为当前通过依据。登记文档的后续提交不改变构建输入，源码改变则必须重新验证。`--json` 供脚本读取。

状态区分以下四种含义：

1. **当前开发树**：可以有未收口改动，绝不称为“最新版”或发布版本。
2. **最近不可变候选**：必须以不可覆盖目录中的 `candidate-manifest.json` 与哈希为准；它可能因当前门禁收紧而不再是“已验证候选”。
3. **当前标准下已验证候选**：除了不可变候选完整性，还必须有正式候选标记、通过的视觉审计和结构化验证记录；记录中的候选 ID、manifest 哈希、closure 路径/哈希和七项命令证据均必须匹配。没有就如实显示“未找到”。
4. **历史包**：只用于追溯或显式回滚，不能被默认启动、默认测试或目录修改时间重新定义为当前版本。

当前仓库未配置远程时，状态命令必须如实显示“未配置”；建立异机备份前，不得声称已经具备异机恢复能力。

## 工作区文件治理

| 分类 | 规则 | 当前路径例子 |
|---|---|---|
| 源码、测试、构建脚本 | 经审查和验证后进入 Git；不因文件多就忽略 | `src/`、`tests/`、`tools/*.mjs`、`tools/local-ocr/*.py` |
| 设计源与轻量证据 | 只有被当前合同或 closure 引用的版本作为当前裁决；其余保留为版本化历史证据 | `design/open-design/`、`docs/*-closure.md` |
| 原始验收结果 | 保留报告、请求/结果摘要、哈希和必要截图；不得把可重新下载的模型缓存当成验收证据 | `docs/ocr-acceptance/**/raw/`、`production-acceptance-report.md` |
| 可再生运行时与缓存 | 由构建脚本重新生成，Git 忽略；清理前先确认不含报告或用户数据，优先送入回收站 | `tools/local-ocr/runtime/`、`**/paddlex-cache/`、`__pycache__/` |
| 本地用户数据 | 不进 Git、不随候选包、不按缓存删除；先用应用内备份或诊断包保护，再迁移 | SQLite、WAL、SHM 与意外落在仓库根目录的数据库 |

清理流程只允许删除已核实的可再生缓存；源代码、原始素材、候选包、设计源、验收报告和数据库必须逐项确认。每次删除后记录目标、方式与保留锚点；不能因“目录看起来旧”清理。

**最近清理记录（2026-08-11）：** 已将 `docs/ocr-acceptance/2026-08-08/` 下 5 个 smoke 运行的 `episode-region-probe/` 与 `effective-region/` PNG 调试目录送入 Windows 回收站（95 文件，约 77.8 MB）。它们是可从同一 smoke 命令再生的过程帧，未作为验收报告引用；保留 `production-acceptance-report.md`、`raw/`、`manual-review/`、各运行的请求/结果摘要及所有非缓存源码。

**最近清理记录（2026-08-17）：** 经用户授权，`test-results/`（198.26 MiB）、`playwright-report/`（0.60 MiB）、`out/`（3.56 MiB）与 `tools/local-ocr/runtime/`（758.76 MiB）已送入 Windows 回收站；它们都是可再生输出，未包含原始验收报告、设计源、候选包或数据库。`tools/pack-current-candidate.mjs` 已解除对 `release/verification/v0.1.86-*` 的 runtime 哈希依赖：本地 runtime 缺失或自检失败时会执行 `pnpm run build:local-ocr` 重建。六份历史 closure、Version 48 对齐台账和未执行视觉运行卡移至 `docs/history/`，并由 `docs/history/README.md` 标记为非当前门禁输入；当时暂留的 `docs/prototype-gap-register.md` 已在 2026-08-18 当前计划精简后归档并改为历史索引。

**历史发布包清理记录（2026-08-17，首批）：** 经用户授权，已将 `release/` 下 37 个已被 V49 治理降级、且不作为当前状态命令锚点的目录送入 Windows 回收站，审计体积约 44.14 GiB。范围为候选包 `v0.1.11`–`v0.1.31`、验证包 `v0.1.86`、全部 2026-08-08 OCR 临时/验收/便携包、`validation/` 和 `win-unpacked.tmp/`。保留锚点固定为 `release/candidates/v0.1.32-p1-internal-trial/`（最近不可变候选）、`release/verification/v0.1.88-p1-internal-trial-visual-unverified/`（历史诊断介质）及 `release/win-unpacked/`（旧显式烟测入口）。本次只从项目工作区移出；回收站未清空，实际磁盘释放须由用户另行决定。清理后已重新执行 `pnpm run status:current`，状态命令仍能核验 `v0.1.32`。

**历史发布包清理记录（2026-08-18，第二批）：** 经用户授权，已将根目录 11 份 `release-v*` P0 目录包全部送入 Windows 回收站：`release-v1.6`–`release-v1.11-p0-r3` 中的连续修订目录，审计体积共 7109.1 MiB。这些包均为 2026-07-23 生成的 Git 忽略历史产物，且没有源码或构建脚本运行时引用；不能作为当前 V49 工作树、候选或默认 E2E 入口。回收站未清空，仍可恢复。

**回收站与旧设计快照处理（2026-08-18）：** 经用户授权，已清空当时的 Windows 回收站；本文件首批、第二批记录中的历史发布包现已永久移除并释放磁盘。随后将 `design/open-design/v2026-07-27/`（57 文件，30.5 MiB）送入新的回收站。该快照不受 Git 跟踪、没有源码或构建脚本运行时引用，只被旧设计快照的历史说明提及；当前 V49 HTML 不受影响。该设计快照目前仍可从回收站恢复。

**文本上下文精简记录（2026-08-18，Changelog）：** 原根 `Product-Spec-CHANGELOG.md` 的 188239 字节、1781 个物理行（其中 1138 个非空内容行）完整原文已移至 `docs/history/changelog/Product-Spec-CHANGELOG-through-2026-08-17.md`，原始 SHA-256 固定为 `D0372BB7C412BC2335400783C04C393E31202C928E04BA256B4EEDB54CE58040`。根文件只保留 V49 设计治理、`SUP-011` 凭据 schema 两项近期净变化及归档索引；归档不创建当前待办，也不得把旧 V48 验收、重复审查或历史 Phase 恢复为当前队列。

**文本上下文精简记录（2026-08-18，DEV-PLAN）：** 原根 `DEV-PLAN.md` 的 133928 字节、798 个物理行完整原文已移至 `docs/history/dev-plan/DEV-PLAN-phases-1-20-through-2026-08-17.md`，原始 SHA-256 固定为 `5F6B5554B8D012E53E185BDEEE63E53AAA87EE190891ED34CD6772287C1AC946`。根计划仅保留当前治理事实和已冻结的静态夹具；Phase 1–20、V48 门禁、重复审查及未经确认的运行时草稿均不得恢复为当前队列。

**文本上下文精简记录（2026-08-18，Product Spec）：** 原根 `Product-Spec.md` 的 199106 字节、944 个物理行完整原文已移至 `docs/history/product-spec/Product-Spec-through-2026-08-17.md`，原始 SHA-256 固定为 `EDC62CDE4BFCBE9656AF233F21A4FE681D7F7BD531938D4471D56DE60D6D5C48`。根规范只保留资产、供应商/凭据、原剧切片、字幕证据链、数据安全和验收的现行净要求；V48 视觉治理、旧 Phase 实施叙事及逐轮重复验收不得恢复为当前任务。`SUP-011`、`CLIP-008`、`CLIP-045`、真实 OCR/ASR/运行时合同、源文件保护和 P2 冻结继续有效。

**文本上下文精简记录（2026-08-18，Design Brief 与 V48 根入口）：** 原根 `Design-Brief.md` 的 24142 字节、200 行完整原文已移至 `docs/history/design-brief/Design-Brief-through-2026-08-17.md`，原始 SHA-256 为 `F75173F7D48BE5EAFA6160ED72C83FD405793B12FC71F9D4D8C8F2FF533A5B41`。根 Brief 只保留由 V49 实际 HTML 核对的当前方向、信息架构、页面/组件、token、状态和静态夹具边界。另将 10 份共约 144 KB 的 V48/早期原型长文移入 `docs/history/v48-legacy/`，原路径缩为哈希索引；它们不能恢复为当前设计源、验收门禁或开发队列。

**文本上下文精简记录（2026-08-18，旧验收与研究入口）：** 将 9 份共 44728 字节的旧 Phase/版本审计、字幕生产样本、AI 评估和字幕/OCR 研究长文完整移入 `docs/history/audits/`、`docs/history/research/` 与 `docs/history/v48-legacy/`；原路径仅保留带大小、行数和 SHA-256 的短索引。它们仍可供历史追溯，但不再构成当前开发、设计、字幕/OCR 合同、候选验证或发布门禁；其中 `subtitle-exchange-research.md` 的旧 OCR/ASR 取样设想不得覆盖当前独立 OCR 时间轴合同。本次没有修改代码、运行时迁移、视觉验收或发布状态。

**Open Design 存储盘点（2026-08-18，未执行删除）：** `design/open-design/` 共 18 个目录、156 个文件、19223689 字节（18.333 MiB）。跨目录共有 43 组完全相同文件，理论重复量 6.755 MiB，但不得在被 HTML 或测试引用的完整快照内按单文件随意去重。本次只读盘点，没有移动或删除任何设计文件。精确分类如下：

- **必须保留（7.129 MiB）：** `v2026-07-30-open-design-final/`、`v2026-08-05-asr-default-configuration/`、`v2026-08-05-model-studio-connectivity/`、`v2026-08-05-provider-connectivity-deepseek-candidate/`、`v2026-08-06-subtitle-region-calibration/`、`v2026-08-11-v49-clip-monitor-review/`；它们被当前运行时、测试、构建配置或 V49 治理直接引用。
- **孤立工具依赖、第二批清理已执行（1.105 MiB）：** `v2026-07-29-r5-merged/` 仅被未接入 `package.json` 的 `tools/validate-merged-prototype.cjs` 引用；快照已于 2026-08-18 送入 Windows 回收站，Git 跟踪脚本已从工作树删除。
- **字幕当前卡已转历史、第五批清理已执行（1.166 MiB）：** `v2026-08-05-subtitle-detail-complete-0070/`、`v2026-08-05-subtitle-detail-left-0071/` 已于 2026-08-18 送入 Windows 回收站；两份原迁移卡完整归档至 `docs/history/v48-legacy/`，原路径只保留历史索引。三源对照、单一播放头和 cue 定位目标已由现行实现与测试覆盖，旧 V48 静态验收顺序不得恢复为当前门禁。
- **ASR 当前卡已转历史、第四批清理已执行（0.633 MiB）：** `v2026-08-05-asr-provider-cards/`、`v2026-08-05-asr-tencent-credentials/` 已于 2026-08-18 送入 Windows 回收站；两份原迁移卡完整归档至 `docs/history/v48-legacy/`，原路径只保留历史索引。候选预填和腾讯双字段凭据目标已由现行实现与测试覆盖，旧 V48 视觉待确认不得恢复为当前门禁。
- **仅历史文档引用、第三批清理已执行（0.710 MiB）：** `v2026-08-05-asr-tencent-connectivity/`、`v2026-08-05-subtitle-recognition-modes/` 已于 2026-08-18 送入 Windows 回收站；对应 V48 历史卡已标明实体移出状态。
- **零引用、首批清理已执行（7.590 MiB）：** `v2026-07-29/`、`v2026-07-29-r2/`、`v2026-07-29-r3/`、`v2026-08-05-provider-connectivity/`、`v2026-08-05-subtitle-three-source-runtime-baseline/` 已于 2026-08-18 送入 Windows 回收站；其余 13 个目录未处理。

首批目录哈希采用可复算规则：递归列出普通文件，以目录内 `/` 相对路径按 ordinal 排序；每行写为 `相对路径<TAB>字节数<TAB>文件 SHA-256<LF>`，对全部行的 UTF-8（无 BOM）字节计算 SHA-256。清理前记录如下：

- `v2026-07-29/`：13 文件，778090 字节，目录 SHA-256 `2B010BF775E59B454C79468FB3D682744CA46A1A85E1A4A574B96777250F8FD6`。
- `v2026-07-29-r2/`：8 文件，32214 字节，目录 SHA-256 `98DA8764BF74F6510392B697168603901388AEC9FFB691FD14893DD06C4546DD`。
- `v2026-07-29-r3/`：14 文件，1505522 字节，目录 SHA-256 `5F489A39FC32E04B22F3F1C70CE1CF0DE980742E21F733CB133022402FCA8746`。
- `v2026-08-05-provider-connectivity/`：34 文件，4203875 字节，目录 SHA-256 `8E1606D6DBDA734970CD4212651DCA302EF2130150E9EF58201F040C651EFA44`。
- `v2026-08-05-subtitle-three-source-runtime-baseline/`：5 文件，1439103 字节，目录 SHA-256 `B0CD9A895515D5D3D4D68EB0C12F790AE7699EABE409745851BFA61EB716F8E1`。

第二批沿用同一目录哈希算法：`v2026-07-29-r5-merged/` 共 13 文件、1158383 字节，目录 SHA-256 `09C2C3E31862DA9541C8EFDE2914122D46345DBE61A15817CB04B7FE4E6F4A41`；`tools/validate-merged-prototype.cjs` 共 3589 字节、53 行，文件 SHA-256 `5CDCCA7DF9C64E5E9EA82D51920A7BB4A3092FCD3DE411AEBD95DA3C8C3098BB`。快照可在清空回收站前恢复，脚本可由 Git 恢复；已删除 `.gitignore` 中这批已清理设计快照的过期忽略规则，因此任何恢复都会重新显式出现在工作树中。清理后 `design/open-design/` 剩余 12 个目录、69 个文件、10106502 字节（9.638 MiB）。

第三批沿用同一目录哈希算法：`v2026-08-05-asr-tencent-connectivity/` 共 1 文件、335825 字节，目录 SHA-256 `4F800827361353F750848006B43B7952B4436299CEB13BF5F064115996CC833F`；`v2026-08-05-subtitle-recognition-modes/` 共 4 文件、408315 字节，目录 SHA-256 `A5A50EE771EA32B75E05D442C95CB38CCC13ACC64C83899E2E571C1B3FB861C6`。两者均可在清空回收站前恢复；清理后 `design/open-design/` 剩余 10 个目录、64 个文件、9362362 字节（8.929 MiB）。

第四批沿用同一目录哈希算法：`v2026-08-05-asr-provider-cards/` 共 1 文件、330974 字节，目录 SHA-256 `16F0EFD50AC046E3A297C346595B9CD2AC1DA4EB5621F0FA8D18FFAB44F6D2A0`；`v2026-08-05-asr-tencent-credentials/` 共 1 文件、333112 字节，目录 SHA-256 `A3A5B5CE495D7CF3F14DE337C19C6FDE05EC0E822DC6A88D7A99DC166A4B2A9D`。原迁移卡分别为 2318 字节/37 行/SHA-256 `D974C8FB6F947042F2100AC6027048FD04FABC5CC6ECAEC569E8819928DEAFD2` 与 1456 字节/23 行/SHA-256 `64737CC5FADD6EBBA3807790C4160F7C98B9532B7CC0486B2FED3F258A3CEC42`；腾讯卡内声明的原型 SHA 与清理前磁盘 HTML 实际 SHA `C5F61A7CD6950D067E7AAA6E0F314219431253FA9B1BD0B4CC109990A4D67992` 不一致。两份快照可在清空回收站前恢复；清理后 `design/open-design/` 剩余 8 个目录、62 个文件、8698276 字节（8.295 MiB）。

第五批沿用同一目录哈希算法：`v2026-08-05-subtitle-detail-complete-0070/` 共 3 文件、790961 字节，目录 SHA-256 `D305C26EBFD29E8D48B0F9B98D75374044BFDF3D2865A00B570373FB7A5698CB`；`v2026-08-05-subtitle-detail-left-0071/` 共 2 文件、431972 字节，目录 SHA-256 `5A684D740865547C785E3AEA08C20271D14B8BA7C03FACB1F8F11EC3420B6E9A`。原迁移卡分别为 2055 字节/30 行/SHA-256 `49BAA86F82270D3905B702565A9B9A0340A6C751ECD0BD46257B63AF65B7384A` 与 1867 字节/28 行/SHA-256 `A9DFE63767EE415EBE937EA77BC2752B9DD187E1056025FADD87AB49DE4D163B`。两份快照可在清空回收站前恢复；清理后 `design/open-design/` 只剩盘点中标记为运行时/测试/V49 必需的 6 个目录、57 个文件、7475343 字节（7.129 MiB）。

**Design Evidence 存储盘点（2026-08-18，未执行删除）：** `docs/design-evidence/` 共 205 文件、18633326 字节（17.770 MiB），只有 1 组 3 份相同的 45 字节 `.last-run.json`，理论文件级去重仅 90 字节，不值得拆散证据目录。精确分类如下：

- **可直接清理的独立历史证据：** 已清零。此前列出的 6 个独立历史目录均已逐项复核、登记并送入回收站；剩余 Design Evidence 全部属于仍被旧 V48 fidelity 门禁脚本读取的 `screen-*` 证据组。
- **Design Evidence 第一批清理已执行（3.247 MiB）：** 零引用的 `v48/current-electron-run-p0-shell-alignment/` 已于 2026-08-18 送入 Windows 回收站；43 个文件均受 Git 跟踪，因此可由回收站或 Git 恢复。
- **Design Evidence 第二批清理已执行（1.539 MiB）：** 仅由 V48 历史迁移卡引用的 `v48/subtitle-migration-2026-08-04/` 已于 2026-08-18 送入 Windows 回收站；共 12 个未跟踪文件、1613984 字节，目录 SHA-256 `D178AA1E765C0321AE9BC8B12C4ED14F9714A14D593CE6E9A06E91A6A78E19B4`。历史卡已标记实体移出；目录可在清空回收站前恢复，不再是当前门禁输入。
- **Design Evidence 第三批清理已执行（2.352 MiB）：** 仅由 V48/早期 P1 历史文档引用的 `v0.1.21/` 已于 2026-08-18 送入 Windows 回收站；共 31 个 Git 跟踪文件、2466564 字节，目录 SHA-256 `F0EBF7D6E23A255708F6EA8727A4DFA484CC0ED87A25FD88A06DC888CC1617D5`。历史文档仍保留版本化路径作为事实锚点；目录可在清空回收站前从回收站或 Git 恢复，不再是当前门禁输入。
- **Design Evidence 第四批清理已执行（1.031 MiB）：** 仅由 V48 历史复用矩阵和缺口登记引用的 `v48/current-electron-run/` 已于 2026-08-18 送入 Windows 回收站；共 13 个 Git 跟踪文件、1080877 字节，目录 SHA-256 `A24C7816D385664F4DB035D4FF21CA7A2A5E39CB11BF155ED3EBC14902A3805C`。历史文档仍保留版本化路径作为事实锚点；目录可在清空回收站前从回收站或 Git 恢复，不再是当前门禁输入。
- **Design Evidence 第五批清理已执行（3.228 MiB）：** 仅由 V48 历史复用矩阵和缺口登记引用的 `v48/current-electron-run-p0/` 已于 2026-08-18 送入 Windows 回收站；共 43 个 Git 跟踪文件、3384622 字节，目录 SHA-256 `28C8779F6227938BBC1660874CAF9019AB0143C40CF89078FFDEF66AEF156036`。历史文档仍保留版本化路径作为事实锚点；目录可在清空回收站前从回收站或 Git 恢复，不再是当前门禁输入。
- **Design Evidence 第六批清理已执行（1.203 MiB）：** 仅由 Phase 17–20 历史证据台账引用的 `v48/open-design-desktop-export-dpr150/` 已于 2026-08-18 送入 Windows 回收站；共 9 个 Git 跟踪文件、1261572 字节，目录 SHA-256 `DFCEF2659E6EF197C05AF215A267541530455F08E123F9891AFB49B81E3E5D8B`。台账已明确其为旧哈希/历史参考，不计入当前项目库预览审计；目录可在清空回收站前从回收站或 Git 恢复。
- **Design Evidence 第七批清理已执行（0.610 MiB）：** 仅由 V48 历史缺口登记和复用矩阵引用的 `v48/open-design-source-rendered-reference/` 已于 2026-08-18 送入 Windows 回收站；共 9 个 Git 跟踪文件、639961 字节，目录 SHA-256 `3CFCEA8CDE4669239DAFF7BB852C8E4FE30F5FFBE975706515BBE9793B33FB92`。历史文档仍保留路径作为事实锚点；该目录不等同于 Open Design 独立预览或 Electron 证据，不能恢复为当前 V49 门禁输入。
- **旧 V48 fidelity 脚本临时依赖（4.560 MiB）：** 10 个 `screen-*` 目录，共 45 个 Git 跟踪文件、4781224 字节。`tools/visual-fidelity-report.mjs` 通过 V48 合同动态读取这些路径，`tools/pack-current-candidate.mjs` 仍硬调用 `audit:fidelity`；在 V49 合同和门禁替换前不得单独删除。现有证据目录只覆盖合同 13 屏中的 10 屏，缺 `screen-results`、`screen-stitch`、`screen-ai`，且该门禁已被当前治理降为 V48 历史诊断，不能证明或阻断当前 V49 工作。

**V49 门禁依赖盘点（2026-08-18，仅盘点，未执行替换）：**

- **历史合同入口：** `docs/design-contract-v48.json` 固定读取 Version 48 HTML `design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`，列出 13 屏、47 个状态；按 `1440x900` 与 `1280x720` 两个视口展开为 94 个检查项。合同仍保留为历史来源索引，不得直接改名或覆盖成 V49 合同。
- **当前源事实：** V49 唯一源为 `design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html`，SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D`。实际 HTML 含 15 个固定屏幕（`library`、`assets`、`production`、`stitch`、`clip`、`clip-report`、`results`、`tasks`、`tags`、`settings`、`ai`、`timeline`、`subtitles`、`clip-pool`、`clip-export`）及供应商动态屏幕模板；V48 的 13 屏清单不能代表 V49 的全产品范围。
- **合同校验耦合：** `tools/validate-design-contract.mjs` 硬编码读取 `docs/design-contract-v48.json`，校验 V48 `authority.entry`、V48 `authority.sha256`、13 屏标识以及 `requiredProjectArtifacts` / `sourceMirror`。`package.json` 的 `validate:design-contract` 直接调用该脚本。
- **视觉报告耦合：** `tools/visual-fidelity-report.mjs` 硬编码读取同一 V48 合同和 `docs/design-evidence/v48/`，按合同屏幕/状态/视口寻找 `project-library-preview.png`、`electron.png` 与 `evidence.json`；缺失项会标记 `missing-version48-evidence`。当前 10 个 `screen-*` 目录共 45 个文件，只覆盖 10 屏，且缺少合同中的 `screen-results`、`screen-stitch`、`screen-ai`，不能据此证明 V49。
- **打包门禁耦合：** `tools/pack-current-candidate.mjs` 先执行 `pnpm run validate:design-contract`，再硬调用 `pnpm run audit:fidelity`；正式候选在 fidelity 非零退出时直接阻断，验证包则允许不完整但仍携带 V48 诊断结果。`release:verify` 通过 `pack:current` 继承这条旧链路。
- **替换边界：** 后续必须新建 V49 合同、V49 屏幕/状态/视口清单和独立证据根目录，再将 `validate:design-contract`、`audit:fidelity`、`pack:current` 与 `release:verify` 逐项切换；不能只把路径从 `v48` 替换成 `v49`，也不能把旧 45 个文件当作 V49 证据。替换完成并确认脚本不再读取 `docs/design-evidence/v48/screen-*` 后，才允许把 10 个目录作为一个批次送入回收站。
- **本项结论：** 盘点完成，未修改运行时代码、合同脚本、package scripts、V49 HTML 或任何证据文件；未运行 `audit:fidelity`、视觉验收、打包或发布。

**V49 合同草案（2026-08-18，仅建立，未启用）：** 新增 `docs/design-contract-v49.json`，状态为 `draft`，合同修订标记为 `49.1-draft`。草案固定 V49 HTML SHA-256 `C95820F2FCE372E9BBA3A2A1062495D418951025C1A7C65A73429F5C0FFD563D` 与同目录 artifact JSON SHA-256 `FAFE935C973438356FE908A85DE2A288179EA06F638E8B76E680413ECE5B17E0`，列出 15 个固定屏幕和 1 个供应商动态屏幕模板，共 64 个从 V49 HTML、迁移卡和现有运行时测试推导的候选状态；每项都标记为待运行时确认或待视觉验收，不代表完整状态合同或视觉通过。草案尚未接入 `validate:design-contract`、`audit:fidelity`、`pack:current` 或 `release:verify`，也未创建 V49 证据目录；现有 10 个 V48 `screen-*` 目录继续保留。

**V49 证据格式（2026-08-18，仅建立，未采集）：** 新增 `docs/design-evidence/v49/README.md` 与 `docs/design-evidence/v49/evidence.schema.json`，规定每个屏幕/状态/视口必须独立保存 `project-library-preview.png`、`electron.png` 和 `evidence.json`。schema 强制绑定 V49 源哈希、合同修订、fixture/test、截图路径与 SHA-256、尺寸、允许差异和比较区域；过程状态与验收状态分离，不能用未采集或历史截图伪装通过。当前 V49 目录只有说明和 schema，没有截图、`evidence.json` 样本或验收结论；旧 V48 fidelity 脚本仍未接入。

**V49 合同准备第 1 组合并完成（2026-08-18，未启用视觉验收）：** 已新增独立只读校验器 `tools/validate-design-contract-v49.mjs`，并将 V49 合同的 `statePlan.coverage` 标为 `source-confirmed-runtime-and-visual-pending`。校验器通过 V49 源 HTML 与 artifact JSON 的 SHA-256、16 个屏幕条目、64 个候选状态、两个视口、schema 必填字段、独立证据根目录和证据台账；首次运行结果为 `V49_CONTRACT_OK`，计划证据位为 128、实际采集文件为 0。新增 `docs/design-evidence/v49/evidence-ledger.md`，逐屏列出 64 个计划状态和 128 个基础证据位；供应商动态模板须在每个实际 provider key 上额外展开，不可把模板行误作已覆盖。合同仍为 `draft`、`activation.enabled=false`；证据台账条目全部为 `planned`，合同状态本身仍待运行时确认或视觉验收，未运行 V49 视觉验收。schema 还强制任何未来标为 `accepted` 的证据必须具有 `acceptance.status="passed"`；`package.json`、`validate:design-contract`、`audit:fidelity`、`pack:current`、`release:verify` 和旧 V48 `screen-*` 均未改动。

**未经确认的运行时尝试已撤销（2026-08-18）：** 曾基于文档整理时的草稿写入 `screen-clip` 全屏宿主、导航拦截、剧名绑定和无截图 E2E；该草稿不是用户授权，相关未提交代码、测试与“已完成”表述已按用户确认撤销。当前仅保留 V49 静态夹具基线；未运行 V49 视觉验收、旧 `audit:fidelity`、V49 门禁迁移、打包或发布。旧 V48 `screen-*` 证据继续保留，不能删除。

Design Evidence 清理沿用 Open Design 的目录哈希算法：`v48/current-electron-run-p0-shell-alignment/` 共 43 文件、3404522 字节，目录 SHA-256 `7269F90473882CA2D4B78554F584C5AB36709BAF5AA964F5BE84597DAC7F1987`；`v48/subtitle-migration-2026-08-04/` 共 12 文件、1613984 字节，目录 SHA-256 `D178AA1E765C0321AE9BC8B12C4ED14F9714A14D593CE6E9A06E91A6A78E19B4`；`v0.1.21/` 共 31 文件、2466564 字节，目录 SHA-256 `F0EBF7D6E23A255708F6EA8727A4DFA484CC0ED87A25FD88A06DC888CC1617D5`；`v48/current-electron-run/` 共 13 文件、1080877 字节，目录 SHA-256 `A24C7816D385664F4DB035D4FF21CA7A2A5E39CB11BF155ED3EBC14902A3805C`；`v48/current-electron-run-p0/` 共 43 文件、3384622 字节，目录 SHA-256 `28C8779F6227938BBC1660874CAF9019AB0143C40CF89078FFDEF66AEF156036`；`v48/open-design-desktop-export-dpr150/` 共 9 文件、1261572 字节，目录 SHA-256 `DFCEF2659E6EF197C05AF215A267541530455F08E123F9891AFB49B81E3E5D8B`；`v48/open-design-source-rendered-reference/` 共 9 文件、639961 字节，目录 SHA-256 `3CFCEA8CDE4669239DAFF7BB852C8E4FE30F5FFBE975706515BBE9793B33FB92`。七批目录均可在清空回收站前恢复。第七批清理后 `docs/design-evidence/` 剩余 45 文件、4781224 字节（4.560 MiB），正好对应仍被旧 V48 fidelity 脚本读取的 10 个 `screen-*` 目录。

| 位置 | 来源/当前值 | 风险 | 治理结果 |
|---|---|---|---|
| `package.json` | 当前开发树为 `0.1.62` | 多处手写 semver，或把工作树数字误读为发布版 | Electron `app.getVersion()` 直接派生；仅构建出 manifest 后才是候选包版本 |
| `release-metadata.ts` | `P1` / `internal-trial` | UI 写死 P0 | 主进程健康接口派生，UI 只显示接口返回值 |
| `release/candidates/` | 不可变候选目录 | 覆盖式 `release/` 无法追溯，或把历史候选冒充当前工作树 | `pnpm pack:current` 创建不可覆盖的 `v<version>-<scope>-<channel>` 目录和哈希 manifest |
| 历史打包 E2E | 显式 `SHORTDRAMA_PACKAGED_EXE` | 默认启动历史包 | 未传路径即跳过；历史 `pnpm release:verify` 只接受当时 manifest 对应 exe，不能作为 V49 候选验证 |
| 历史文档 | 旧 P0/P1 记录 | 被误读为当前候选 | 保留为历史事实，不构成当前发布证据 |

## 历史候选流程（已禁用，不能用于 V49）

以下仅记录 Version 48 候选的旧流程，不再作为现行命令说明。当前内部候选采用本文顶部的 V49 scoped 门禁；2026-10-13 起还须绑定源码及可核验命令证据。正式版替换和公开发布未获授权。

1. 历史上运行 `pnpm run check:version`，版本、范围、UI 和包级测试入口不一致会失败；这不是当前 V49 候选命令。
2. 当时 `pnpm run release:verify` 仍依赖 Version 48，因此不能用于 V49。该接线问题现已修正；当前流程为“校验 V49 scoped 合同 → 审核源码与验证证据 → 构建与哈希 manifest → 包级 E2E → 内部候选登记”。
3. 当前开发入口仍是 `pnpm dev`。历史候选 manifest 中的 `executablePath` 仅供追溯；不得从 `release-v*` 目录启动来证明当前工作树或 V49 候选。

**历史候选记录（2026-08-17）：** 当时最近不可变候选为 `v0.1.32-p1-internal-trial`，视觉缺口见 `docs/history/closures/v0.1.32-p1-internal-trial-closure.md`。该记录不代表当前候选；当前 release 指针与 `status:current` 分别报告登记身份和实物验证。旧包仅供追溯。

**验证包保留状态（2026-08-17）：** `release/verification/` 中唯一保留的是 `v0.1.88-p1-internal-trial-visual-unverified`。它是历史诊断验证介质，不是正式候选，也不代表当前 `0.1.92` 开发树；当前开发树与正式候选的结论只能以 `pnpm run status:current` 为准。`v0.1.35` 至 `v0.1.86` 的历史内部试验包已按用户确认送入回收站，不能再作为证据或默认启动入口。`v0.1.88` 同样不构成正式候选或发布。

## 历史包清单

`release` 与历次 `release-v*` 目录包全部属于历史证据；其中 11 份根目录 `release-v*` P0 包已按本文件 2026-08-18 的第二批记录送入回收站。即使用户将其恢复，也不得作为当前候选、默认 E2E 路径或“最新版本”结论。

回滚是显式选择某个历史目录并核验其自身 hash；不能把它伪装成当前工作树的验证结果。
