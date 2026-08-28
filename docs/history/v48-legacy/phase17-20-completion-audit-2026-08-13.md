# Phase 17–20 完成审计（2026-08-13）

## 结论

本次代码、隔离 SQLite 和 Electron 回归已通过，但 **Phase 17–20 不具备正式完成条件**。真实 6+2 冻结媒体的文件级基线和隔离证据包预检已经通过；剩余缺口是 CLIP-032 的逐场景真实 OCR/ASR、资格、候选和导出边界验收，以及 Version 48 合同要求的项目库逐状态、双视口视觉基线。

不得用源 HTML 渲染图、历史截图、当前 Electron 截图、30 集导入负向试验或测试生成媒体替代这些输入。

### 2026-08-13 真实 `dev-02` 文本语义复验（受控失败）

- `v0.1.69-p1-internal-trial-visual-unverified`（EXE SHA-256 `af51d91ed4e407548567587ce52169e9f532694a5561d33c0d83e1ac5d1c54db`）对冻结 Baseline `dev-02` 的隔离运行已结束，摘要 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v069/dev-02-v069-result.json` 为 `semantic-generation / provider-response-invalid`。这意味着 OCR、腾讯 ASR、证据包和 DeepSeek 连通前置已越过，但模型输出未满足快照局部 ID 与跨窗结构合同；不代表密钥丢失、余额、认证或网络失败。
- 该样本有 44 个可分析窗口而本轮只请求 1 条候选。下一步会将“最多返回请求数量的候选”写入受限 provider 合同，仍保留全部冻结窗口和上下文用于判断，且不放宽任何结构、资格或视觉门禁。运行临时目录已清理；不得覆盖本失败摘要，也不得将其解释为冲突场景或候选资格通过。
- 随后 v0.1.70 的同一冻结样本复验仍为 `semantic-generation / provider-response-invalid`。候选上限不是唯一问题；下轮摘要将只新增结构失败的脱敏子码（不记录模型输出或任何原始字幕/媒体数据），用于区分窗口、事件、时间、连续性、数量与资格失败。
- v0.1.70–v0.1.72 的失败复核到一个请求合同回归：新增数量上限时，`selections` 的具体对象字段示例被替换为文字占位。修复将恢复原有完整对象示例，并额外限制数组长度；不减少 44 个冻结窗口、不放宽结构校验，也不把此前失败改记为通过。
- `v0.1.73-p1-internal-trial-visual-unverified`（EXE SHA-256 `b0c617cb0b959c8fda678ac5c8c9ad298526b768814b7090888c9a19a74265ae`，`app.asar` SHA-256 `5d28189f2e94103ef3f470a396c291f3a01a80da629c061269a990981b7db309`）已在同一冻结 `dev-02` 上真实通过：OCR 23、腾讯 ASR 51、证据包 `ready`、DeepSeek 生成 1 条 `qualified_with_limit`、`blocked=0`、生产库写入 0。摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v073/dev-02-v073-result.json`；运行结束后确认无语义临时目录、无 OCR/FFmpeg 子进程。该成功证明真实资格链路，不改变 `dev-02` 的 OCR/ASR 未闭合冲突为 0，也不替代视觉基线或正式发布条件。
- v0.1.73 成功之后，独立审查发现 provider 适配器曾接受“自由文本包裹 JSON”的非合同响应。该问题已修复为仅接受完整 JSON 或完整 Markdown JSON 代码块，且“前后说明 + JSON + 说明”的负向回归、独立 Stage 1/2 复审均通过。`v0.1.74` verification EXE 仍须对相同冻结 `dev-02` 重跑；完成前，本条 v0.1.73 结果只能作为较宽旧合同的历史证据，不能据此宣布本轮收口或 Phase 17–20 完成。
- `v0.1.74-p1-internal-trial-visual-unverified`（EXE SHA-256 `8ec776c946e86b260590b536ffee48b51f802d6c0ed2720a9c6b83c606dd85a2`）对冻结 `dev-02` 的重跑已在 `semantic-generation / provider-response-invalid-event-map` 受控结束，摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v074/dev-02-v074-result.json`。该枚举结果不输出模型原文、字幕、媒体路径、密钥或数据库内容；生产库最后写入时间未变化。随后将“事件来源必须完整回链同一 proposal 的受限上下文”从服务端校验显式写入 provider 合同，新增提示回归，并获独立 Stage 1/2 通过。`v0.1.75` 必须用新不可覆盖包重跑；该失败不能解释为密钥丢失，也不能标记真实候选资格或完整 Phase 17–20 通过。
- `v0.1.75-p1-internal-trial-visual-unverified`（EXE SHA-256 `75a742d610a88a4e946809f2c0604ef8d9aecf42e8b7c8806f4759a8a21a5680`，`app.asar` SHA-256 `66d1f32f3b0d3478a780a18c64969f4fe03e8111b648964b5ec444c4491692fe`）对同一冻结 `dev-02` 真实通过：OCR 23、腾讯 ASR 51、证据包 `ready`、DeepSeek 生成 1 条 `qualified_with_limit`、`blocked=0`、生产库写入 0。摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v075/dev-02-v075-result.json`。完成后本轮无 OCR/FFmpeg 子进程；生产库最后写入时间仍为 `2026-08-13T15:56:15.6122582+08:00`。此前一次因结果目录创建参数错误而中止的运行留下的独立旧临时目录不属于本轮，未作为通过证据也未触及生产库。该成功收口严格 JSON 与完整事件映射合同下的真实文本语义资格链路，仍不得宣称 `ocr-asr-conflict`、真实 `qualified`/视频复核、hidden-01 跨窗或 Version 48 视觉基线已完成。
- 同一 v0.1.75 包对冻结 `dev-01` 在 `semantic-generation / provider-response-invalid` 受控结束，摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v075-dev01/dev-01-v075-result.json`。它证明同一凭据链并非普遍失效，但不足以定位结构子类。随后新增 `schema` 子码；回归以 `PROVIDER_CONTENT_DO_NOT_PERSIST` 标记的非法对象验证可持久化校验错误不含该标记，且 checkpoint 子码可映射到打包摘要。`v0.1.76` 必须生成新 verification 包重跑，旧摘要绝不覆盖；该诊断不改变任何候选资格或 Phase 完成结论。
- 在 `v0.1.76` 打包前的独立复审中发现并关闭一个安全 HIGH：Zod strict schema 会把未知字段名回显到 issue 文本，旧路径可能把它写入失败记录。实现现将 schema 失败统一为固定原因；以 `PROVIDER_CONTENT_DO_NOT_PERSIST` 作为**未知字段名**的回归确认该标记不进入 `ClipSemanticValidationError`，从而不进入模型运行、任务 checkpoint 或结果摘要。该审查的 Stage 1/2 无 HIGH/MEDIUM；新的实跑仍需执行，且不会将任何 provider 原文写出。
- `v0.1.76-p1-internal-trial-visual-unverified`（EXE SHA-256 `2a07557ae049117cc439acdb16366773ad3bfe337e548f099e30d3eb13c3e0de`）对冻结 `dev-01` 实跑在 `semantic-generation / provider-response-invalid-event-map` 受控结束，摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v076-dev01/dev-01-v076-result.json`。这不是密钥、OCR、ASR 或安全脱敏失败；后续合同将事件输出限制为真正被 selections 引用的少量事件，仍要求每条事件完整回链同一受限窗口。`v0.1.77` 将在新的不可覆盖包中复验。
- `v0.1.77` 打包前，有限候选事件合同已由程序端而非仅提示词执行：事件必须精确对应单一 proposal 的完整 `before + core + after` 序列，候选仅能使用其引用事件 core，且拒绝未被候选引用的额外事件。重排、重复、context-as-core 和跨窗借用 context 的负向回归均通过，独立 Stage 1/2 无 HIGH/MEDIUM；新的真实 `dev-01` 验收尚待执行。
- `v0.1.77` 对冻结 `dev-01` 的新实跑仍受控结束于 `semantic-generation / provider-response-invalid-event-map`。该结果进一步确认前置 OCR、腾讯 ASR、证据包和 DeepSeek 调用均非本轮失败点；不记录模型原文。为去除模型手写长来源 ID 的不稳定性，`v0.1.78` 将模型合同改为仅返回冻结 `proposalId`，由程序精确派生 `core` 与 `before + core + after` 来源；strict schema 拒绝旧来源字段，selection 仍只可用映射窗口 core。未知/重复 proposal、同窗多事件、旧字段、未选事件和 context 借用均阻断，E2E 夹具也按应用 candidateLimit 截断。22 个定向测试、typecheck、差异检查及独立 Stage 1/2 复审通过；尚未用该新合同真实复跑，因此不得称为通过。
- `v0.1.78-p1-internal-trial-visual-unverified`（EXE SHA-256 `134f0386ceb8659253480f5dc5deeaf890122c4261e71cc8b17b603f2e6387ab`）对冻结 `dev-01` 实跑仍在 `semantic-generation / provider-response-invalid-event-map` 受控结束，摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v078-dev01/dev-01-v078-result.json`。本轮未泄露模型内容，也未改写生产库；失败表明模型仍需维护 `narrativeEvents.id` 与 `selections.narrativeEventId` 的关联。`v0.1.79` 改为只要求 `selections[]` 的冻结 `proposalId` 和核心锚点，应用生成事件键与来源映射；顶层及内嵌 legacy 事件字段均 strict 拒绝。重复/未知窗口、context 借用和字段脱敏回归已通过，19 个定向测试、typecheck、差异检查和独立 Stage 1/2 复审通过；新的真实复跑尚未执行，不能据此宣布通过。
- `v0.1.80-p1-internal-trial-visual-unverified`（EXE SHA-256 `1f2ee9f3f27fa4ac0aa6bd52e40da0ab17d9becd4edaa94c9204aa7fe75adfa4`）以冻结 `dev-01` 在只读生产配置、临时 SQLite 和冻结媒体下真实通过。不可覆盖摘要位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-semantic-20260813-v080-dev01/dev-01-v080-result.json`：OCR 25、ASR 23、证据包 `ready`、生成状态 `reviewing`、候选 1、`qualified_with_limit` 1、`blocked` 0、生产库写入 0。验收进程结束后已不存在。此结果验证直接窗口选择合同在 `dev-01` 的真实链路可用，但验证包仍为 `verification-only`、`visualFidelity=incomplete`；不得将其扩大解释为 `ocr-asr-conflict`、真实 `qualified`/视频复核、hidden-01 跨窗或 Phase 17–20 完成。
- `v0.1.81-p1-internal-trial-visual-unverified`（EXE SHA-256 `76fe2992fa57cf90b9d4b2722861d63d55054759040a70e5246d5adcaa9b5b68`）新增打包身份的视频复核最小连通性探针。它只读生产库中的 `multimodal-review` profile 和加密密钥记录，复制到临时 SQLite 后仅请求 Model Studio 模型列表；不读取剧集、字幕、候选、帧或媒体。不可覆盖摘要 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-probe-20260814-v081/modelstudio-v081-result.json` 为 `passed`、`providerConfigured=true`、242 ms、生产库写入 0，进程已退出。该通过只证明当前 EXE 身份的 provider 可连通，不构成帧级视频复核、`qualified`、任一场景卡或 Phase 17–20 完成。
- v0.1.81 的独立审查发现失败摘要缺少耗时和生产库写入数，不能在受控失败时证明隔离边界。该 HIGH 修复并通过独立 Stage 1/2 后，`v0.1.82-p1-internal-trial-visual-unverified`（EXE SHA-256 `d418d5c9a7167815585da423924fdb89a00854af84d967a1cd52c674626b87dd`）重跑相同、不读取媒体的探针。不可覆盖摘要 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-probe-20260814-v082/modelstudio-v082-result.json` 为 `passed`、`providerConfigured=true`、251 ms、生产库写入 0，进程和 OCR/FFmpeg 子进程均已退出。此项是修复后探针合同的真实证据，仍不构成帧级视频复核、`qualified`、任一场景卡或 Phase 17–20 完成。
- `v0.1.83` 新增受控帧级入口：仅允许冻结公开样本 `dev-04`、绝对 Baseline manifest 与已登记媒体 SHA-256；生产 profile/密钥仅只读复制至临时 SQLite，中点附近最多 12 张 JPEG 帧以临时 UUID evidence ID 发送。它不发送字幕、候选、媒体路径、PTS 或整段视频，且 `supported` 仅代表 provider 帧级能力，不能创建 `visual-only-supported` 场景卡、`qualified` 或 Phase 通过。独立审查后将 manifest 强制为绝对路径，并为外发体补充 UUID/JPEG、无路径/包元数据回归。定向 4 文件 / 14 测试、typecheck、差异检查通过。
- `v0.1.83` 与 `v0.1.84` 对相同冻结 `dev-04` 的不可覆盖实跑均以 `provider-failed` 受控结束（分别约 81 秒与 72 秒）；各摘要均记录 `sourceDatabaseWrites=0`，生产库最后写入时间未变。`v0.1.84` 曾补齐 `response_format` 兼容重试，但独立审查发现它会对任意 HTTP 400 重发 JPEG 帧；该 HIGH 已修为仅当响应的 `error.message`、`error.code` 或 `error.param` 明确指向 `response_format` 才最多重试一次，非相关 400 的负向回归通过。
- `v0.1.85-p1-internal-trial-visual-unverified`（EXE SHA-256 `abfa99b267b19a6d18558b5e5eff9022915ab461ecd02434e9387e00a2c832cb`）在上述限定重试合同下重跑冻结 `dev-04`，不可覆盖摘要 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-frame-evidence-20260814-v085/dev-04-v085-frame-evidence-result.json` 仍为 `failed / provider-failed / 73701 ms / sourceDatabaseWrites=0`；生产库最后写入时间仍未变化。配置只读检查确认 profile、端点和密钥引用存在，但当前模型名不含 `VL`、`Vision` 或 `Omni` 视觉模型标识。该证据不能证明密钥丢失；帧级验收现阻塞于需在用户已授权的 Model Studio `multimodal-review` 配置中选择实际可用的视觉模型并保存后重跑。三次失败均不构成视觉场景卡、`qualified`、导出或 Phase 17–20 完成。
- 2026-08-14 复跑不依赖视觉 provider 的真实 Phase 19 证据：`SHORTDRAMA_REAL_EXPORT_EVIDENCE=1`、`SHORTDRAMA_REAL_EVIDENCE_GOVERNANCE=1`、`SHORTDRAMA_REAL_EVIDENCE_BASELINE=1` 下，`real-clip-export-evidence-baseline`、`real-clip-governance-evidence-baseline`、`real-clip-evidence-baseline` 共 3 文件 / 3 测试通过。它确认冻结 `dev-06` 的实际 FFmpeg/ffprobe 导出边界与素材回链、`dev-05/dev-06/hidden-02` 的任务恢复/部分成功/指纹漂移阻断，以及 6+2 冻结媒体的临时 SQLite PTS 证据包均可运行；不写生产 SQLite、原媒体或用户资产。首次运行因本机 `better-sqlite3` 被前一轮 Electron 打包重建为 ABI 148 而无法由测试 Node ABI 137 加载；执行 `pnpm run rebuild:node` 后原样复跑通过，这不是产品逻辑失败。该项不替代 hidden-01 跨窗、视觉模型帧级复核或 V48 视觉门禁。
- 2026-08-14 复跑 Phase 20 的实际 Electron 工作区回归：先从当前源码 `pnpm run build` 并 `pnpm run rebuild:electron`，再执行 `phase8-original-clip-workflow` 与 `phase14-original-clip-pool-report`，2 文件 / 2 测试通过。隔离临时数据/媒体中验证 V49 唯一播放源、候选审阅范围、双时间线、0.1 秒边界微调、确认、候选池真实导出/完成报告，以及 1440×900 与 1280×720 无横向溢出。它证明当前新构建下的局部 Phase 20 集成回归，仍不等价于 V48 Open Design 视觉保真完成。
- 2026-08-14 当前源码全量回归：`pnpm test` 为 102 文件 / 550 通过 / 5 显式真实证据开关跳过；`pnpm run typecheck`、`pnpm run validate:design-contract`、`git diff --check` 通过；`pnpm run test:e2e` 为 15 通过 / 8 跳过。跳过项均为显式真实媒体或打包 DPI 条件，不能当作已执行。`pnpm run audit:fidelity` 仍为 `completed=0, incomplete=94`，这是正式候选/发布及 Phase 17–20 完成声明的独立阻断门禁。
- 2026-08-14 帧级验收运行隔离诊断：`v0.1.86` 曾尝试用新 Electron `userData` 目录避免与已运行旧 EXE 共用通道；有效脱敏摘要为 `missing-key / 33,937 ms / sourceDatabaseWrites=0`。该结论只证明此隔离方式改变了 Windows 安全存储上下文，不能解密同一已保存密钥；不表示密钥丢失、provider 失败或任何场景卡结果。诊断临时目录已清理，未创建隔离运行数据库。
- 2026-08-14 `v0.1.87` verification-only 打包介质诊断：当前 OCR runtime 与 v0.1.86 reference runtime 的 3,617 个文件逐项 SHA-256 一致，runner `--self-test` 通过，因此当前源码 EXE 重新构建时仅复用已验证 runtime；包输出到 E: exFAT 后 manifest 记录的 EXE SHA-256 与实算一致，且包内隐私审计通过。该 EXE 后续启动触发 Windows SideBySide `Invalid Xml syntax`，不能作为实际 EXE 证据。`mt.exe` 对新旧 EXE 的内嵌 manifest 提取结果完全一致、XML 可解析，故不归类为应用合同、密钥或 provider 失败。失败包与不可覆盖脱敏结果保留；下一次只能以新版本在 C: NTFS 的新目录重新打包并验收。这个环境问题不改变生产 SQLite 最后写入时间，仍不得宣称任何视觉场景卡、`qualified` 或 Phase 17–20 完成。
- 2026-08-14 `v0.1.88-p1-internal-trial-visual-unverified` 已在 C: NTFS 新目录构建，EXE SHA-256 为 `6b6c03f8202f3b490d32f81dcbf9b51b00f0ed61c0649a302269c9903ce4fd94`，与不可覆盖 manifest 一致；内嵌 manifest 可提取/解析，包内隐私审计通过。该新 EXE 对冻结公开 `dev-04` 的帧级最小外发验收生成不可覆盖脱敏摘要：`failed / provider-failed / 73,492 ms / sourceDatabaseWrites=0`；运行后 EXE 退出，生产库大小与最后写入时间保持不变。它不支持“密钥丢失”的推论，也未产生视觉场景卡、真实 `qualified`、导出或任何 Phase 通过。该场景仍需在已保存的 Model Studio `multimodal-review` 配置中选择并验证可用视觉模型后，以新包和新结果路径重跑。
- 2026-08-14 对生产配置库的只读脱敏复核确认：`multimodal-review` profile 仍有密钥引用，但模型字段保存的是设置页占位文字，而非已开通的视觉模型标识；未读取或输出密钥、端点及任何媒体内容。这与帧级 `provider-failed` 一致：问题不是密钥丢失，必须先在 Model Studio 配置中填入实际可用的视觉模型并保存，然后以新 verification-only 包和新结果路径复验。
- 2026-08-14 `v0.1.89` 的只读 Model Studio probe 失败摘要为 `missing-key / 361ms / sourceDatabaseWrites=0`。复核发现该旧码同时覆盖“密钥记录不存在”和“记录存在却无法解密”，不能用于判断密钥丢失。`v0.1.90-p1-internal-trial-visual-unverified` 将该错误拆分后，以新结果路径复验输出 `failed / key-unreadable / 232ms / sourceDatabaseWrites=0`，证明 profile 引用的密钥记录存在、但当前 Windows 安全存储无法解密。它没有读取帧、字幕、候选、媒体、端点或密钥内容，且不支持把问题归因于余额、模型、网络或用户未保存密钥。能力总览已改为对应的 `unreadable-secret` 受控态，UI 仍须由下一新包复验；本条不产生视觉场景卡、`qualified`、导出或任一 Phase 完成结论。
- 2026-08-14 `v0.1.91-p1-internal-trial-visual-unverified` 是含 `unreadable-secret` 总览状态的不可覆盖验证包，manifest EXE SHA-256 与实际 EXE 一致，包内隐私审计通过（3,744 文件）。新 EXE 的独立 probe 仍为 `failed / key-unreadable / 206ms / sourceDatabaseWrites=0`，结果位于 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-modelstudio-probe-20260814-v091/modelstudio-v091-result.json`。当前源码全量单测 106 文件 / 614 通过 / 5 显式跳过；真实 Electron provider 定向回归 7/7，其中假加密字节的真实 IPC 只能得到 `controlled / unreadable-secret`。该回归不读取生产密钥或媒体；不替代重新保存可读密钥、帧级 provider 支持、场景卡、`qualified`、视觉门禁或 Phase 17–20 完成。
- 随后的 `v0.1.87` 已撤回更换 Electron `userData` 的做法：帧级 CLI 保持打包身份的原安全存储上下文，来源数据库仍只读、profile/密钥只复制到临时 SQLite、帧级输入/脱敏 `wx` 结果边界不变。定向 2 文件 / 14 测试、typecheck、`git diff --check` 与当时独立 Stage 1/2 审查通过。v0.1.87 在 E: 介质上的打包/启动诊断与随后 v0.1.88 在 C: NTFS 的实际公开 `dev-04` 复验见上两条；两者均未支持视觉复核、`qualified` 或 Phase 17–20 完成声明。
- 2026-08-14 对 v0.1.88 外部 verification 输出根、OCR runtime 复用条件和不可覆盖候选边界完成独立 Stage 1/2 审查，无 HIGH/MEDIUM。脚本级 4 项负向回归确认外部根未带 `--verification`、为相对路径、指向正式 `release/candidates` 或经临时 junction 别名指向该根时，均在构建前退出；junction 在 `finally` 清理。该审查和回归只证明打包边界，不改变公开 `dev-04` 的 `provider-failed`，也不减少 `audit:fidelity` 的 94 项缺口。
- 2026-08-14 当前源码的 provider 历史配置防护经真实 Electron IPC 回归：隔离临时 SQLite 仅插入假的加密字节、密钥引用和历史“请按开通模型填写” `multimodal-review` profile；`window.desktopApi.listAiCapabilityStatus()` 返回 `controlled / model-required`，设置总览与 Model Studio 默认卡显示“需填写模型”。用例同时在 1440×900、1280×720 保存截图，`1 passed`；无网络请求、生产 SQLite/密钥/媒体读取或写入。此证据不能替代用户保存真实视觉模型、帧级 provider 成功、场景卡、`qualified` 或视觉保真验收。
- 2026-08-14 Provider Bridge 的 Stage 2 结构整改：原 434 行文件拆为 291 行绑定协调、62 行保存事务和 108 行原型 DOM 辅助，页面结构/样式/IPC 未变。定向回归首先暴露 Tencent ASR 缺双凭据时同步校验错误地短暂占用保存锁；锁已移动到全部同步校验后，Node ABI 下的 5 文件 / 35 项回归和 typecheck 通过。该整改只提升防护代码的可维护性与测试可复现性，不等价于任何外部 provider 或视觉验收结论。
- 2026-08-14 视觉证据根因复核：Open Design v0.19.0 daemon 健康（显式 personal workspace 读取当前项目成功），项目库存在冻结 V48 主 HTML、字幕状态资产及 `unmerged-pending-confirmation` 的 V49 原剧切片附件，却没有合同所要求的 47 个状态×双视口最终项目库预览。现场审计为 91 项缺项目库预览/Electron/metadata 中的一项或多项，另有 `screen-clip:candidate-selected`、`screen-clip-pool:default`、`screen-clip-report:default` 三项全屏像素比较超阈值；不得用任何已有 PNG、HTML 渲染或待确认附件填补。请求生成独立待确认状态基线附件的 Open Design 运行因 `AMR_INSUFFICIENT_BALANCE` 受控结束、`artifactCount=0`，不修改 V48 主源或生产页面。需先恢复该设计生成额度、生成并由用户确认附件，随后逐状态采集真实项目库+Electron 双视口证据；此前 `audit:fidelity=completed=0, incomplete=94` 和 `visual-unverified` 结论保持不变。
- 2026-08-14 三项已有预览差异迁移复核：新增 `docs/prototype-migration/original-clip-v48-project-preview-delta-20260814.md`，完整检查冻结 V48 原型、`StaticPrototypeSurface.tsx` 隔离壳、两个真实数据 bridge 和现有六张 PNG。三张项目库预览和 Electron 图均为 1440×900、96 DPI，但前者的 220px 侧栏/56px 顶栏约显示为 184px/47px，接近 `5/6` 缩放；Electron 与冻结 V48 HTML 均为 220px/56px。相应全屏差异为 27.2648%/14.2642、17.0876%/12.2022、26.1177%/12.2559（changed-pixel ratio/mean RGB delta）。因此根因首先是项目库预览渲染坐标系不符合或未证明符合合同固定视口，不是可通过局部 CSS 或 bridge 改动修正的生产布局差异；禁止缩放 iframe、改变应用壳、替换图片或放宽阈值。需由 Open Design 重新生成无缩放固定逻辑视口预览后再做同状态对比。

## 已验证实现

| 目标 | 当前证据 | 状态 |
|---|---|---|
| Phase 17：导入字幕不可越权为自动切点 | `src/main/services/original-clip-generation-gate.test.ts`；`tests/e2e/real-original-clip-trial.spec.ts`；`80_测试候选/phase17-20-real-import-blocked-20260813-r2/real-original-import-blocked-trial.json` | 通过（30/30 导入轨均为 `imported/reference_unknown`；0 任务、0 候选、0 MP4） |
| Phase 17：OCR/ASR/导入三源、时间质量、恢复路径 | `local-ocr-subtitle-service.test.ts`、`subtitle-asset-service.test.ts`、`subtitle-evidence-service.test.ts`、字幕 runtime E2E | 代码/隔离回归通过；不替代 CLIP-032 真实样本验收 |
| 6+2 真实媒体：文件冻结与证据包预检 | `verify:clip-evidence-baseline`；显式 `real-clip-evidence-baseline.test.ts`；四份独立输出 | 通过（8/8 媒体 SHA-256、当前源指纹、可读视频 PTS；0 候选、0 导出、0 字幕轨；未接触生产库） |
| Phase 18：证据包、资格、语义/视觉复核、冻结任务 | `clip-evidence-package-service.test.ts`、`clip-candidate-intelligence-service.test.ts`、`clip-multimodal-review-service.test.ts`、`original-clip-generation-gate.test.ts` | 代码/隔离回归通过 |
| Phase 18：队列、取消、期限、恢复与迟到保护 | `clip-generation-lifecycle.test.ts`；`clip-generation-lifecycle.ts` | 通过；独立 Stage 1/2 无 HIGH/MEDIUM |
| Phase 19：n:m 裁决、PTS/指纹门禁、FFmpeg 输出边界 | `clip-evidence-package-service.test.ts`、原剧切片和导出 E2E | 代码/隔离回归通过；仍受真实样本和视觉门禁约束 |
| Phase 20：V49 媒体会话、双时间线、快捷键与微调 | `OriginalClipWorkspaceRuntimeBridge.test.ts`；`phase8-original-clip-workflow.spec.ts` | 代码/双视口 Electron 回归通过；仍为 `visual-unverified` |
| 回归与审查 | `pnpm test`：97 files / 529 tests（另有 5 项按显式真实证据开关跳过）；typecheck、build、设计合同、Electron E2E：15 passed / 8 skipped；v0.1.63 实包定向 Electron E2E：8 passed；`git diff --check`；独立 Stage 1/2 | 通过 |

## 正式完成的硬缺口

### 1. CLIP-032 逐场景真实证据验收

`docs/clip-evidence-baseline/manifest.v1.json` 要求 6 个公开开发样本和 2 个隐藏验收样本。2026-08-13 已完成文件隔离和指纹登记，来源见 `docs/clip-evidence-baseline/baseline-v1-provenance-20260813.md`。当前：

- `D:/shortdrama-evidence-baseline/v1` 已存在，包含 6 个公开副本和 2 个隐藏副本；
- 8 个样本均已登记实际 SHA-256；
- `pnpm run verify:clip-evidence-baseline` 已通过：`CLIP_EVIDENCE_BASELINE_OK version=1 public=6 hidden=2`。
- 显式预检已分四批完成 `dev-01,dev-02`、`dev-03,hidden-02`、`dev-04,dev-05`、`dev-06,hidden-01`。每批仅在临时 SQLite 建包，确认当前源指纹和可读视频 PTS，均为 `ready`，且均为 0 候选、0 导出、0 字幕轨、未接触生产数据库；测试不再接受任何输出目录，也不落盘真实预检报告。
- 证据包的媒体可读性检查只读取一帧真实 PTS；场景锚点仍保留完整帧表的逐端点 PTS 核验，避免把慢速全帧扫描误判为媒体不可验证。
- `dev-03` 的真实本地 Paddle OCR 自动选区探测返回“没有足够稳定的字幕带”，没有创建轨道；其探测输出和只读临时帧在 `80_测试候选/phase17-20-real-ocr-preflight-20260813-dev03-r2`。这是 OCR 不能证明字幕事实的负向证据，不以导入 SRT 填补，也不等价于视觉复核结论。
- 独立自动选区 OCR 探测在 `dev-01`、`dev-02`、`dev-04` 分别得到 24、23、61 条真实时序 cue（耗时 150.719、316.328、268.735 秒）；输出位于外部测试候选目录，未落用户库或形成候选。它们等待同集 ASR、冲突裁决和资格门禁，不得被作为 OCR/ASR 对齐场景的单源完成依据。
- 2026-08-13 新增并实际执行显式开关的 `real-ocr-evidence-baseline.test.ts`：`dev-01` 在系统临时 SQLite 中从只读副本重新运行本地 Paddle 自动选区，成功创建**唯一一条** `generated/visual_aligned` OCR 轨并构建 `ready` 证据包（1 passed，111.82 秒）；断言 0 `task_items`、0 `clip_export_batches`，测试结束删除临时目录。它与“仅建包预检的 0 字幕轨”是两项不同验收，绝不混用。此项只验证真实 OCR 的隔离接入，不调用云端 ASR、未读取或输出任何密钥，也不替代 OCR/ASR 对齐、资格、候选或导出场景卡。
- 同一固定媒体/Python/runner SHA-256 约束下，`dev-02`（1 passed，241.78 秒）和 `dev-04`（1 passed，164.45 秒）也已在缓存收口后重新生成唯一 OCR 轨及 `ready` 证据包，并保持 0 任务、0 导出。Paddle 模型缓存被强制定向到同一临时目录，退出后恢复环境并删除。它们分别仍等待真实 ASR 冲突裁决和受控视觉事实验收，不能以这三次 OCR 接入通过替代场景卡结论。
- 清理条件已变成测试断言：SQLite 初始化、执行和关闭均纳入同一 `try/finally`；每次真实 OCR 用例在 `finally` 中恢复 `PADDLE_PDX_CACHE_HOME` 后断言其值与进入前一致，并删除临时根目录后断言目录已不存在。关闭失败也会在清理完成后使测试失败。
- 真实 ASR 尚未获云端调用授权。`verify:clip-evidence-baseline` 负责冻结媒体 SHA-256；后续真实调用入口只创建临时 SQLite，并在 FFmpeg/ffprobe 提取、音频读取、腾讯任务或网络请求前确认“腾讯云 ASR profile + 已授权凭据”存在。缺失时应以 0 字幕轨、0 任务、0 导出本地阻断。历史可接收任意 `--database` 路径的 ASR 样本工具不满足该隔离合同，不能充当本轮证据。
- `real-asr-evidence-preflight.test.ts` 已在已登记的 `dev-01` 基线条目上实跑（1 passed）：无 profile、腾讯 profile 无 `secretRef`、腾讯 profile 的凭据内容无效三种情况都会使 `DefaultAsrSubtitleService` 在任何媒体提取或网络请求前拒绝；用例本身不打开真实媒体内容，所有分支的 FFmpeg 与 `fetch` 均为 0 调用，临时 SQLite 为 0 字幕轨、0 `production_tasks`、0 导出，结束后断言临时根目录已删除。它是云端调用前的阻断证据，不等价于真实 ASR 时间轴或场景卡完成。
- 已实现 `tools/real-asr-evidence-baseline.ts` 作为唯一已授权真实 ASR 隔离入口（`pnpm run build:real-asr-evidence` 生成 bundle）：仅 `dev-01/dev-02`，先锁定媒体 SHA-256，生产库以 readonly 打开，只有腾讯 profile 与加密 credential blob 映射到临时 SQLite。所有 OCR runtime 覆盖变量均在任何敏感 I/O 前拒绝，且三条实际运行均以退出码 1 结束；缓存、临时 SQLite 和工作帧根目录均在 finally 清除。独立两阶段审查无 HIGH/MEDIUM。
- 用户授权后的 `dev-01` 正常路径实际运行已到达本地凭据 schema 校验，得到“腾讯云 ASR 凭据不可用”；因此 **0 FFmpeg/ffprobe、0 音频读取、0 腾讯任务、0 网络请求、0 轨道/任务/导出**。当前凭据重存并验证有效前，真实 ResultFormat=3、OCR/ASR 对照和冲突场景仍未完成；不得以这条阻断结果替代真实 ASR 绿灯。
- 真实预检测试不接受输出目录、不生成报告文件，彻底消除把真实媒体指纹、候选、字幕或导出记录经路径/链接写入源码仓库的风险；测试同时断言临时库中 `task_items`、`subtitle_tracks` 与 `clip_export_batches` 均为 0。

- 新增治理场景卡 `src/main/services/real-clip-governance-evidence-baseline.test.ts`，显式开关实跑 `dev-05`、`dev-06`、`hidden-02`：在临时 SQLite 中验证冻结任务按原配置恢复、部分成功 checkpoint 的 blocked/recovery 持久化回读，以及源指纹漂移时发布候选被拒绝；断言 0 导出批次、0 生成素材，并在退出后删除临时目录。该证据只覆盖生命周期/授权边界，不等价于真实 OCR/ASR、语义候选质量、视觉事实或导出完成；`hidden-01` 跨窗口事件仍未用 fixture 冒充真实验收。

- 新增 `real-clip-export-evidence-baseline.test.ts`，显式开关实跑 `dev-06`：固定 Baseline SHA-256，在临时 SQLite 创建手动候选，调用当前 `OriginalClipService` 的真实 FFmpeg/ffprobe 导出与首尾边界验证，确认输出可读、时长在帧容差内、批次为 `completed`、生成素材可回链；源媒体 SHA-256 保持不变，临时输出/库由 finally 清理。该证据只覆盖真实导出链路，不等价于自动候选、OCR/ASR 或视觉门禁完成。

### 最新 Electron 回归（2026-08-13）

`pnpm run test:e2e` 在新建外部目录 `80_测试候选/phase17-20-full-e2e-20260813-r1` 中完成：15 passed / 8 skipped / 0 failed。通过项包括 Phase 17 字幕三源映射与重启恢复、Phase 19 候选池/完成报告、Phase 20 V49 监视器的真实候选审阅/确认、Version 48 双视口 fixture 和 provider 受限失败态；8 项跳过是需要显式真实媒体试验或独立打包 DPI 条件的套件，不得当作已执行证据。
- 这一步仍不包含 OCR/ASR、语义/视觉事实、候选资格、应生成/应阻断或导出边界的场景卡结论。

剩余工作是按场景卡完成真实 OCR/ASR 证据、候选资格、应生成/应阻断和导出边界验收；绝不修改原始源片。

### 2. Version 48 逐状态视觉门禁

`docs/design-contract-v48.json` 共定义 47 个屏幕状态、两种视口，合计 94 项证据。当前审计结果：

- `pnpm run audit:fidelity`：`completed=0, incomplete=94`；
- 91 项缺少项目库预览、Electron 截图或 metadata；
- 2026-08-13 通过 Open Design MCP 复核到项目库中与 V48 契约一致的历史入口文件：`short-drama-material-studio.html` 的 `.file-versions` 快照 SHA-256 为 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92`，其页面内容包含“全局 / 剧目库”“剧目库”“创建剧目”等主入口结构，与用户当前预览截图一致。该证据只确认 V48 入口文件身份，不替代 47 状态 × 2 视口的 94 项项目库预览、截图和 metadata。
- 3 项已有配对但像素阈值超限：`screen-clip:candidate-selected:1440x900`、`screen-clip-pool:default:1440x900`、`screen-clip-report:default:1440x900`；
- 合同要求 `source=open-design-project-library-preview`，禁止以 HTML 本地渲染、历史附件、缩放裁切图或 Electron 自身截图伪造基线。

所需外部状态：Open Design 项目 `01b5725c-2688-4cbc-bc29-7432712449b3` 可访问，且能按合同状态在 1440×900 与 1280×720 导出可归档项目库预览。取得后逐项采集对应 Electron 截图、metadata 和区域阈值；三项超阈需先依据同状态基线修正生产布局，再重采集和审计。

## 复验顺序

1. 对 6 个公开样本完成真实 OCR/ASR 证据、资格、应生成/应阻断和导出边界验收；隐藏 2 集仅用于最终独立验收，不用于调参。
3. 从 Open Design 项目库采集 94 份固定视口预览；不要把现有 `open-design-source-rendered-reference/` 写入项目库证据目录。
4. 以相同 fixture 采集 Electron 对照与 metadata，先修复 3 个已知超阈项，再运行 `pnpm run audit:fidelity` 至 `completed=94, incomplete=0`。
5. 在上述两项都通过后重新执行全量单测、typecheck、build、设计合同、Electron E2E、独立 Stage 1/2 审查；仅此时才可将各 Phase 的真实状态改为完成。是否发布仍需单独授权。
## 2026-08-13 打包身份真实 ASR 增量

- `v0.1.57-p1-internal-trial-visual-unverified` 的专用隔离入口以当前打包 EXE 的 `userData` 为只读凭据来源，仅复制 profile 与加密记录至临时 SQLite。`dev-01` 实跑摘要为：OCR 25 条、ASR 23 条、`ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready`、源库写入 0。它证明腾讯云双凭据在该 EXE 身份下可解密并完成一次真实 ASR；不等同于 OCR/ASR 对齐、候选资格、场景卡或视觉验收完成。
- `dev-02` 的真实 OCR 未在可接受时间内收敛。`v0.1.58-p1-internal-trial-visual-unverified` 对该入口增加 180 秒 OCR 上限；实跑得到受控 `failed` 摘要，并确认 EXE、OCR 子进程和当次临时根目录均已退出/清理。由于未进入 ASR 阶段，`dev-02` 冲突场景、跨轨裁决和 Phase 18 资格场景仍为未完成。
- 以上两个验证包均为 `verification-only` 且 `visual-unverified`；`audit:fidelity` 尚未通过前，不能发布或称为 Phase 17–20 完成。

- `v0.1.61-p1-internal-trial-visual-unverified` 已重新打包并通过隐私扫描；EXE SHA-256 为 `abbcb142bedb48edf25e4593581d24e10246490011f4aa8b7f589739ebedae61`，`app.asar` SHA-256 为 `d49a5dcf6924a2e1be04a4987e54cd7392979a56bbb4619f74c5e13e86f40fa5`。该包仍是不可覆盖的 `verification-only`，视觉状态为 `incomplete`。
- 以该 v0.1.61 打包身份、独立 `user-data` 和冻结 Baseline v1 manifest 实跑 `dev-02` 成功：`dev-02-v061-result.json` 记录 `status=passed`、OCR 23 条、腾讯 ASR 51 条、`ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready`、生产库写入 0。该结果证明 450 秒外层 OCR 时限与 420 秒 runner 上限不会在旧 180 秒处误杀，并完成一次真实 OCR+ASR 隔离接入；它仍不等价于 OCR/ASR 冲突裁决、Phase 18 资格/候选场景或视觉门禁完成。

### 2026-08-13 v0.1.62 真实跨轨裁决增量

- `v0.1.62-p1-internal-trial-visual-unverified` 是本轮跨轨裁决代码对应的不可覆盖验证包：EXE SHA-256 `f6514d3b03ba1d59b80aebcee80272ac3d8be99fdf568d912a7fa046724097ed`，`app.asar` SHA-256 `964ae3ec8135a5e0160487727dffe16a8507707f4efae0f6914cd044d90d12e7`。清单明确为 `verification-only`、`visualFidelity=incomplete`，包内隐私扫描通过。
- 该 EXE 对 `dev-01`、`dev-02` 均在只读冻结媒体、当前 EXE 身份只读凭据来源和临时 SQLite 下执行 OCR、腾讯 ASR、`readAnchorReadiness`、语义事件持久化和候选范围排除；生产数据库写入均为 0，临时目录由入口清理。结果摘要只包含计数和指纹：`dev-01` 为 OCR 25、ASR 23、语义事件 14、阻断冲突 0、可用锚点 14、候选范围 14；`dev-02` 为 OCR 23、ASR 51、语义事件 51、阻断冲突 0、可用锚点 51、候选范围 44，均为 `ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready`。
- 因 `dev-02` 实测未出现未闭合冲突，不能将该样本标记为 `ocr-asr-conflict` 场景卡通过。时间偏移或句子拆分本身不构成冲突；需要保持 Baseline v1 冻结不变，并补充确有未闭合冲突的独立场景卡结果后，才能收口该项及后续候选资格。真实文本语义 provider 未配置时，也不得以 fixture 代替该候选质量验收。
- 使用同一 v0.1.62 EXE 的隔离 Playwright 包级回归为 9/9：100%/125%/150% DPI 无横向裁切、85 集列表到末行、三源字幕独立展示/定位且删除导入不影响 OCR/ASR、字幕批次重启后保留中断原因，以及 Version 49 监视器读取、审阅、微调和确认真实本地候选。输出根目录为外部测试候选目录；未使用生产 SQLite、源片或历史候选。该通过不替代 Open Design 项目库视觉基线。
- 新增文本语义不可用的正式入口回归：隔离 SQLite 中未配置 profile、服务未初始化、缺失/失效密钥或缺失地址时，预检均在锚点读取前将目标集标为 `blocked`，`startIntelligentGeneration` 在生成任务入库前拒绝，已有候选和已有生成任务计数保持不变；所有路径额外断言 `anchorReadiness` 为 0 调用，存在 adapter 实例的路径断言语义 adapter 也为 0 调用。`original-clip-service.test.ts` 与 `clip-candidate-intelligence-service.test.ts` 定向执行为 2 files / 30 tests passed。它只覆盖本地适配器错误态和旧候选保护，不替代真实语义候选质量验收。

### 2026-08-13 v0.1.63 新包身份复验

- `v0.1.63-p1-internal-trial-visual-unverified` 清单记录 EXE SHA-256 `e50e6faf2e12463a2d591334fd93ef6c1225c7a690fa36700e9000e9e4e910b3`、`app.asar` SHA-256 `4f242f9dee28fa9a1e0cd4bceefff07aa34f47428bbf5cc7df68383309531251`；清单核验一致，隐私扫描通过，包类型仍为 `verification-only`。
- 使用该新 EXE、冻结 Baseline v1 和隔离临时 SQLite 实跑 `dev-02`：结果文件 `D:/个人工作/短剧AI切片工具/80_测试候选/phase17-20-real-asr-20260813-v063/dev-02-v063-result.json` 为 `status=passed`、OCR 23 条、腾讯 ASR 51 条、`ResultFormat=3`、`SentenceMaxLength=40`、证据包 `ready`、生产库写入 0。`blockedConflictCount=0`，所以仍不能标记为 OCR/ASR 冲突场景卡通过。
- 该新 EXE 的隔离包级回归为 8/8：100%/125%/150% DPI、85 集列表末行、三源字幕独立展示/删除隔离和重启恢复均通过；这不改变 `visual-unverified`、真实语义 provider 未配置和 Version 48 逐状态视觉门禁未完成的结论。
