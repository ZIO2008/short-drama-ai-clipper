# 0.1.94 内部候选增量两阶段审查

日期：2026-10-13。独立 code-reviewer，使用 code-review skill；按 7d34029 基线证据复用、影响范围重验。仅写本报告，未启动应用、重建 ABI、打包、提交或发布。

**Stage 1 PASS；Stage 2 PASS。0 HIGH / 0 MEDIUM / 0 LOW。结论仅覆盖当前源码增量；不代表 0.1.94 包已经通过任何包级验收。**

## 输入身份与证据复用

实际调用 `tools/candidate-provenance.mjs:26` 的 captureProvenance：

```json
{"schemaVersion":2,"sourceCommit":"7d34029f3db114333a5e835845dba50f9ca72943","sourceInputsSha256":"c33a8f76f813b39db879c91eeaed48c2c9d367fc8d8102e2aa1ffcf490dbeb4a","sourceDirty":true,"designContractSha256":"d759a4bc7b6a72cb36d2abbc73bb03f15db8a4817a82f75ee341f7330aece613"}
```

独立计算 `sourceInputsSha256(root, '7d34029')` 为 `ee7411cf6721d3a8b9dd93ea2f63c31180a2ae56cfd5db484ef1f7c2d61519cb`，与 `docs/release-evidence/review-0.1.93.md:10` 的最终已审输入完全相同。故继承该报告逐项源码与质量裁决，而非仅相信提交说明。报告 Markdown 不进入源码指纹（`tools/candidate-provenance.mjs:10`）。后续干净提交须保持上述当前输入及设计指纹；若改变则重审受影响范围。

`git diff 7d34029` 只有测试新增 1 行、package 版本 1 行、DEV-PLAN、CHANGELOG、runtime 注册表及指针；另有旧 package 快照新增。独立执行 `git diff 7d34029 --name-only -- src tools pnpm-lock.yaml docs/design-contract-v49.json docs/current-design-baseline.json` 无输出。生产源码、构建工具、依赖锁、设计合同、原型均未改变；版本元数据变化不等于业务行为变化。

## Stage 1：Spec Compliance

逐项范围依据为 `Product-Spec.md:174` CLIP-005、`:175` CLIP-005a，及 `DEV-PLAN.md:44`–`:60` 的 Phase 30 局部授权；命名及字幕新控件仍暂缓。

| 条目 | 裁决与证据 |
| --- | --- |
| 生成、确认、导出分离；未确认及 exporting 不可抢占 | 完整实现，继承基线。`src/main/services/clip-export-runtime.ts:40`、`:74` 未变；基线报告 Stage 1 第 1 项。 |
| 目录可编辑、默认源目录下切片、选择及最终值预检；不改源片 | 完整实现，继承基线。`src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.ts:32`、`:89`、`:124`、`:140`、`:148` 未变；当前测试 `tests/current/original-clip-pool-export-report.spec.ts:148`、`:164` 保留。 |
| 同候选再次导出、新批次新文件、不同质量、不覆盖旧成果 | 完整实现。`src/main/services/clip-export-runtime.ts:64`、`:67`、`:74` 未变；测试 `:167`–`:184` 保留两次真实导出、新批次、质量与旧文件哈希断言。本次 `:114` 只补重启后的打开剧目导航。 |
| 默认不选、跨集只包含显式选择、资格过滤、成功后清空 | 完整实现，继承基线。`OriginalClipPoolReportRuntimeBridge.ts:44`、`:45`、`:65`、`:104`、`:160` 未变；测试 `:141`、`:163`、`:166`、`:176`、`:182` 未放宽。 |
| 失败、取消、进程中断后旧成功成果及状态保留 | 完整实现，继承基线。`clip-export-runtime.ts:77`、`:80`、`:94` 和 `tests/integration/original-clip-repeat-export.spec.ts:98`、`:134` 未变。 |
| 批次成果精确归属、快照及报告可追溯 | 完整实现，继承基线。`clip-export-runtime.ts:67`、`:71`、`:81`；测试 `original-clip-pool-export-report.spec.ts:181`、`:190`–`:193` 保留。 |
| 不扩页面、算法、包装、API 或表；引导及状态真实性 | 无漂移，整个 src 相对基线无差异；`DEV-PLAN.md:44` 明确局部范围，`:46` 如实保留中间包失败历史。无新增 UI 引导或状态。 |
| 不覆盖旧包；源码、命令、候选身份分离 | 实现未变，`tools/pack-current-candidate.mjs:61`、`:97`、`:111` 及 `tools/candidate-provenance.mjs:9`、`:33` 继续约束。`package.json:3` 改 0.1.94；`DEV-PLAN.md:46` 不把 0.1.93 诊断通过伪称最终候选通过。实际候选交付待完成。 |
| runtime 快照与 current 指针 | 完整一致。`docs/baseline-registry.json:118` 起将旧记录 superseded 并指向快照，新记录 current；`docs/current-runtime-baseline.json:3` 指向 0.1.94。实际 SHA256：旧快照 `4ae60a281e588d5b24c021f4ba3530e4e06a08cc0d75ef41978ff8947927dfa7`，当前 package `e494f4e070f0db8f73f5f28010e0282766bd07e703a23bc5a0f01fcf731c9ebd`，均与登记相符。 |

## Stage 2：Code Quality

- 测试真实性：`tests/current/original-clip-pool-export-report.spec.ts:114` 使用真实可访问按钮点击，先有 `:113` 剧目库可见断言；未用注入状态替代导航，未删除断言、加 skip、放宽超时或使用强制点击。文件共 194 行，无新增 any。
- 隔离与安全：`:35`–`:37` 仍以系统临时目录隔离数据、媒体、输出；`:108` 显式 packaged-smoke 临时 userData，`:111` 确认真实 packaged；生产 `src/main/packaged-smoke-runtime.ts:9`–`:20` 仍校验绝对路径、真实目录、realpath 与临时根包含关系，`src/main/index.ts:58` 仍禁用 packaged E2E 环境。没有修改任何安全门禁或新增密钥、注入与危险执行路径。
- 视觉：生产 renderer、原型与设计合同均无差异，设计指纹与基线相同。本轮复用既有视觉结论，不启动应用或新增邻居截图，不声称本轮进行了新视觉验收或全产品视觉已通过。
- 基线质量：继承 `docs/release-evidence/review-0.1.93.md:40` 起的事务、测试真实性、安全和结构裁决；本次没有受影响的生产代码质量项。

## 验证及原始输出

审查者实际执行注册表验证，exit 0：

```text
baseline registry valid: 10 entries, 5 domain pointers
```

已读取并校验两份日志 SHA256 与记录相符。当前构建记录 `test-results/candidate-checks/preflight94-build-1791896255339/preflight94-build.json:3`–`:10` 绑定本报告输入，command=`pnpm run build`，exitCode=0，outputSha256=`712766227691ebe56020b915ccdde5206150aa36ee5aae8f7b5c4898f4aceb0a`。原始日志（仅省略终端清行控制符）：

```text
✓ Lockfile passes supply-chain policies (verified 10h ago)
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 788ms using pnpm v11.25.0
$ pnpm run check:version && pnpm run validate:phase29-acceptance && pnpm run clean:build-metadata && electron-vite build && pnpm run verify:renderer-model-studio-boundary
$ node tools/check-version-consistency.mjs
VERSION_CHECK_OK version=0.1.94
$ node tools/validate-phase29-acceptance.mjs
phase29 acceptance ledger valid: public=6 hidden=2 hiddenRuns=1+1 multimodal=passed+correctly-blocked
$ node -e "for (const file of ['out/tsconfig.node.tsbuildinfo','out/tsconfig.web.tsbuildinfo']) require('node:fs').rmSync(file,{force:true})"
vite v8.1.5 building ssr environment for production...
transforming...✓ 111 modules transformed.
rendering chunks...
out/main/index.js  693.68 kB
✓ built in 149ms
vite v8.1.5 building ssr environment for production...
transforming...✓ 2 modules transformed.
rendering chunks...
out/preload/index.cjs  14.74 kB
✓ built in 13ms
vite v8.1.5 building client environment for production...
transforming...✓ 148 modules transformed.
rendering chunks...
out/renderer/index.html                     0.42 kB
out/renderer/assets/index-26ps3LEY.css     82.47 kB
out/renderer/assets/index-z-z6i1QI.js   2,983.46 kB
✓ built in 245ms
$ node tools/verify-renderer-model-studio-boundary.mjs
RENDERER_MODEL_STUDIO_BOUNDARY_OK scripts=1
```

导航修复诊断记录 `test-results/candidate-checks/diagnostic-packaged-export-1791896175147/diagnostic-packaged-export.json:3`–`:10` 为不同输入 `6e8ec65b44e6a574713826cf7c8f06758dd5d762b74a3f20c5cbe626c91609b4`，exit 0；日志原文：

```text
Running 1 test using 1 worker
(node:16916) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
  ok 1 [current] › tests\current\original-clip-pool-export-report.spec.ts:66:1 › CLIP-REAL-005 to CLIP-REAL-008 closes the isolated Electron pool, export, and report path (15.0s)
  1 passed (20.0s)
```

该诊断仅支持导航修复有效，记录本身未保存 EXE 路径/哈希，不能单凭此日志独立认证包身份，更不能登记为 0.1.94 packagedE2E 通过。0.1.93 EXE 身份来自主 Agent 的执行上下文，不作为本报告对新包的裁决证据。

本报告不重复运行已审源码全量测试、不改 ABI。冻结干净提交后仍须重录七项正式门禁与最终包级 5 项，完成真实隐私审计及候选身份登记；当前 dirty 工作树预构建和旧包诊断均不能代替这些交付证据。
