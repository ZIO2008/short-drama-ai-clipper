# 0.1.93 内部候选源码两阶段复审

审查日期：2026-10-13。独立 code-reviewer；只读实现，仅新增本报告。范围为 `c5d8638` 之后 Phase 30 内部候选收口，以及 CLIP-005/005a 受影响链路。未扩大到全产品迁移，未启动应用、重建 ABI、生成包、推送或发布。

## 源码身份与裁决边界

实际调用 `captureProvenance(process.cwd())` 得到：

```json
{"schemaVersion":2,"sourceCommit":"c5d863864bb51885551e6ddd4d960e8a77946251","sourceInputsSha256":"ee7411cf6721d3a8b9dd93ea2f63c31180a2ae56cfd5db484ef1f7c2d61519cb","sourceDirty":true,"designContractSha256":"d759a4bc7b6a72cb36d2abbc73bb03f15db8a4817a82f75ee341f7330aece613"}
```

这是工作树输入的审查，不是 c5d8638 提交本身包含这些修改的声明。后续干净提交必须保持上述源码输入与设计合同指纹，否则本报告需要重审。报告 Markdown 不进入源码输入指纹。

**Stage 1：PASS（本轮源码实现范围）。Stage 2：PASS（本轮代码与测试实现范围），0 HIGH / 0 MEDIUM / 0 未解决 LOW。候选交付尚未验收：本报告不证明包已经生成、包级用例通过或七项正式门禁已齐全。**

初次读取指纹为 `2c4926b00c3514614e0004f2da4564b94fad03a43b2026683803f788c0637cf9`；结束前已补审 `tools/current-workspace-status.mjs:166` 的干净且源码匹配条件结论及 `:182` 候选标签修正，并重新捕获以上最终指纹。最新测试、构建记录与最终指纹一致。

## Stage 1：Spec Compliance

依据：`Product-Spec.md:174` CLIP-005、`:175` CLIP-005a；`DEV-PLAN.md:38` 2026-10-13 授权，`:40` 复验缺陷，`:42`–`:52` Task 30.2–30.5。命名及字幕新控件仍延期，不能误判为本轮漏实现。

| 条目 | 判定与证据 |
| --- | --- |
| 生成与确认、导出分离；未确认或正在导出不得抢占 | 完整实现。`src/main/services/clip-export-runtime.ts:40` 预检只允许 confirmed/exported，`:74` 事务检查所属剧目、状态和抢占数量。真实拒绝用例 `tests/integration/original-clip-repeat-export.spec.ts:98`。 |
| 目录编辑、首次源目录下切片、选择目录、最终输入预检 | 完整实现（基线继承，未改 UI）。`src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts:32` 默认目录，`:89` 可编辑，`:124` 初始化，`:140` 选择目录，`:148` 读取最终输入。 |
| 默认不选、跨集仅显式勾选、资格过滤、选择清空 | 完整实现（基线继承）。同文件 `:44` 空集合、`:45` 集合及资格双过滤、`:65` 原生 checkbox、`:104` 选择变更、`:160` 提交成功清空。`tests/current/original-clip-pool-export-report.spec.ts:153` 后续断言一项批次及再次勾选、导出后清空。 |
| 同一候选不同配置再次导出、新批次新文件、旧成果不覆盖 | 完整实现。`clip-export-runtime.ts:64` FFmpeg -n，`:67` 新物料 ID，`:74` 新批次；`tests/integration/original-clip-repeat-export.spec.ts:63` 实际 FFmpeg、不同码率、追加 _02、旧文件哈希、两份数据库快照及帧数断言。 |
| 失败和取消不撤销旧成功成果 | 完整实现。`clip-export-runtime.ts:77` 根据已有物料恢复 exported；真实缺源、实际写出后取消及未确认/并发拒绝用例 `tests/integration/original-clip-repeat-export.spec.ts:98`。 |
| 进程终止、重开数据库恢复 | 完整实现。`clip-export-runtime.ts:94` 恢复中断批次；`tests/integration/original-clip-repeat-export-process.ts:7` 独立数据库和真实服务；fixture `:90` 杀进程树，spec `:134` 重开库并验证旧文件与快照。 |
| 本批成果精确归属；部分成功后终止不能关联旧成果 | 完整实现。`clip-export-runtime.ts:67` 物料插入与 recordBatchMaterial 同一事务，`:81`–`:87` 写入本批物料 ID，`:80` finishBatch 保留完成项，`:71` 按 manifest 精确查询；spec `:28` 覆盖真实部分成功后杀进程，`clip-export-batch-outcome.test.ts:19` 覆盖之后又生成更新物料。 |
| 干净提交、构建输入、设计合同、真实命令与输出绑定 | 完整实现。`tools/candidate-provenance.mjs:9` 七项必需检查、`:14` 输入指纹、`:26` 来源快照、`:33` 打包前后约束、`:40` 文件边界及哈希、`:48` 来源校验；`tools/run-candidate-check.mjs:24` 子进程真实执行、`:29` 记录结束状态与日志哈希。 |
| 拒绝旧 passed、区分历史候选与当前树、允许后续登记文档提交 | 完整实现。`candidate-provenance.mjs:56` 祖先关系和源码输入对比，`:60` 结构化证据；`tools/current-workspace-status.mjs:135` 当前源码状态，`:179` 人类可读输出；`tools/current-workspace-status.test.ts:119`、`:128`、`:137` 对应回归。 |
| 新不可变内部候选、包级验证、禁止覆盖旧包和发布 | 打包/验证实现完整，实际交付待执行。`tools/pack-current-candidate.mjs:61` 已存在目录拒绝，`:97` manifest 来源，`:111` 再检查；`tools/run-current-packaged-e2e.mjs:22` 包测试加入重复导出；`tests/current/original-clip-pool-export-report.spec.ts:102` 关闭开发进程后以 packaged-smoke 打开同一临时库，确认/导出/报告在包内执行。无本轮发布命令新增。 |
| 页面、算法、包装范围不扩大；引导真实性 | 本轮 renderer/设计文件未变；仅批次恢复与验证工具变化。现有空选择引导 `OriginalClipPoolReportRuntimeBridge.ts:132` 明确提示先勾选；本轮无新页面、API、表或生产旁路。 |

## Stage 2：Code Quality

- 事务正确性：物料与归属原子持久化；恢复不依赖 candidate 的全局最新成果，见 `clip-export-runtime.ts:67`、`:80`、`:94`。数据库写入仍用参数绑定；动态 IN 部分只生成占位符（`:74`）。
- 测试真实性：真实 FFmpeg fixture 以 320×180、25 FPS、20 秒生成源文件（`original-clip-repeat-export-fixture.ts:48`），验证 500 帧与生产时长容差；缺源用 rename，取消等待实际输出字节，崩溃用子进程树终止，未用合成 exporting 状态冒充崩溃。窄单测 helper `tests/helpers/record-mocked-clip-export.ts:4` 仅同步模拟物料归属，真实持久化由集成测试兜底。
- 安全：新增来源脚本未发现硬编码密钥、eval、HTML 注入或前端密钥变量；`candidate-provenance.mjs:40` realpath 后约束证据在候选目录内。哈希是本地追溯与变更检测，不是对有写权限攻击者的认证。没有据此声称防伪造安全保证。
- 结构：新增 provenance 与 runner 分离职责，新增 TS 无显式 any；修改的运行时类 95 行、新增集成用例不足 200 行。现有长行风格未在本轮做全文件重构。
- 已解决 LOW：`docs/version-governance.md:15` 原先遗漏 `currentE2E`，主 Agent 已补齐；复查文档与 `candidate-provenance.mjs:9` 七项一致。
- 视觉边界：本轮无 UI/样式/设计合同变更，按派发限制未启动应用或打开邻居页面，不声称新的视觉验收。current E2E 日志只用于行为证据，不能替代候选包或全产品视觉验收。

## 实际验证与原始输出

审查者独立执行 `pnpm run typecheck`，退出码 **0**，原始输出：

```text
$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
```

已读取预验证原始日志及记录，均仅作审查辅助：

1. `test-results/candidate-checks/preflight-tests-1791859430620/preflight-tests.log:58`：

```text
 Test Files  135 passed | 5 skipped (140)
      Tests  762 passed | 5 skipped (767)
Packaging inputs changed: sourceInputsSha256
```

测试断言通过，但 runner 因源码变化判失败，**不能登记为正式 tests 通过**。

2. `test-results/candidate-checks/preflight-focused-1791859527373/preflight-focused.json:9` command 为状态与批次归属两文件，exitCode 0；对应日志：

```text
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

3. `test-results/candidate-checks/preflight-e2e-1791859609731/preflight-e2e.json:9` 为 current Playwright，exitCode 0；对应日志：

```text
  7 skipped
  14 passed (1.0m)
```

后两份记录属于初读指纹的预验证，sourceDirty=true，不能作为干净提交上的候选正式证据。包级 7 项跳过不算通过。

4. 最终工作树预验证：已实际读取 `test-results/candidate-checks/preflight-final-1791872027789/preflight-final.json` 与日志，exitCode=0，源码指纹为本报告最终 ee7411…：

```text
 Test Files  135 passed | 5 skipped (140)
      Tests  763 passed | 5 skipped (768)
   Start at  14:13:49
   Duration  50.22s (transform 19.71s, setup 0ms, import 58.47s, tests 161.83s, environment 69.34s)
```

5. 构建原始证据：已读取 `test-results/candidate-checks/preflight-build-1791872045177/preflight-build.json`，command=`pnpm run build`，exitCode=0，指纹与最终工作树一致；outputSha256=`8ab804e5835a5ac8b75e6c1b063848a4c8f76afbd913eab9c71b263d86a1dae0`。对应日志原始输出（省略终端清行控制符）：

```text
$ pnpm run check:version && pnpm run validate:phase29-acceptance && pnpm run clean:build-metadata && electron-vite build && pnpm run verify:renderer-model-studio-boundary
$ node tools/check-version-consistency.mjs
VERSION_CHECK_OK version=0.1.93
$ node tools/validate-phase29-acceptance.mjs
phase29 acceptance ledger valid: public=6 hidden=2 hiddenRuns=1+1 multimodal=passed+correctly-blocked
$ node -e "for (const file of ['out/tsconfig.node.tsbuildinfo','out/tsconfig.web.tsbuildinfo']) require('node:fs').rmSync(file,{force:true})"
vite v8.1.5 building ssr environment for production...
transforming...✓ 111 modules transformed.
rendering chunks...
out/main/index.js  693.68 kB
✓ built in 97ms
vite v8.1.5 building ssr environment for production...
transforming...✓ 2 modules transformed.
rendering chunks...
out/preload/index.cjs  14.74 kB
✓ built in 17ms
vite v8.1.5 building client environment for production...
transforming...✓ 148 modules transformed.
rendering chunks...
out/renderer/index.html                     0.42 kB
out/renderer/assets/index-26ps3LEY.css     82.47 kB
out/renderer/assets/index-z-z6i1QI.js   2,983.46 kB
✓ built in 263ms
$ node tools/verify-renderer-model-studio-boundary.mjs
RENDERER_MODEL_STUDIO_BOUNDARY_OK scripts=1
```

以上最新预验证仍为 sourceDirty=true。冻结提交后需重录七项正式门禁，包级结果及最终候选登记不包含在本报告 PASS 内。
