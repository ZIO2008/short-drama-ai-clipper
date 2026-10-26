# 1.0.0 正式初版最终实物审查

审查者：fresh code-reviewer /root/stable_final_review；日期：2026-10-26。
结论：**Stage 1 PASS；Stage 2 PASS（本轮正式分发范围），HIGH 0 / MEDIUM 0 / LOW 0。**

## 范围与方法

使用 `D:/个人工作/.agents/skills/code-review/SKILL.md`。已先读项目根 AGENTS/HANDOFF 顶部及当前 Product-Spec、DEV-PLAN、正式发布计划、候选 closure 和结构化证据。仅写本报告，未修改程序、重建 native、运行全量测试、公开上传或修改日常安装与正式数据。

审查目标是 Product-Spec.md:1、DEV-PLAN.md:5–14 与 docs/release-readiness/2026-10-26-initial-release-plan.md:5–21 定义的冻结业务正式分发：版本、渠道、候选身份、最终ZIP、说明、许可材料、隐私与本机隔离验证。既有业务逐项实现采用同源候选已绑定的测试与前次制备代码审查证据，不声称本次重新审遍全产品全部源码或全部历史Spec；未授权增强不作为缺陷。

## Stage 1：Spec Compliance

| 需求 / Priority | 结论与证据 |
| --- | --- |
| 1.0.0 / stable 正式初版 | PASS。package.json:3；src/shared/release-metadata.ts:1–5；AppShell.tsx:77（src/renderer/src/layout）。最终实际EXE健康状态及可见页脚为1.0.0 / stable / 正式版，test-results/initial-release-1.0.0/final-isolated-smoke.json:2–8；final-empty-library.png已目视核对。 |
| 冻结业务，不自动集成其它工具 | PASS。发布计划:7–12；制备脚本 docs/release-readiness/scripts/prepare-peer-distribution.py:90–104、117–123只读取候选。独立verifyProvenance返回currentSourceMatches=true；ZIP3742个程序文件逐SHA与候选相同，另两个视频文件明确排除。没有在ZIP拼入剪映工具、云OCR或新业务。 |
| 中文完整ZIP、校验清单、不可覆盖 | PASS。制备脚本:110–114、148–184；最终ZIP4013项无重复，清单4012项大小与SHA全部匹配，无额外项（清单本身除外），CRC通过。 |
| 源码与候选可追溯 | PASS。docs/release-evidence/v1.0.0-p1-stable.json:3–20、24–34；ZIP清单candidateManifestSha256和candidateVerificationSha256与本地候选文件一致；独立provenance无reasons。构建源码4610100e160ef098df9bb523605967ce4ef81ff3；最终测试运行时文档提交0fa592c不冒充重建，sourceInputsSha256保持5d10758aa1c52cf30090982ec05c2367b3177508b53f1392ce8cb5e11cf450e6。 |
| 首启从固定上游下载，哈希拒绝、离线复用 | PASS。docs/release-readiness/peer-distribution/首次启动.ps1:8–10、13–23、86–112；最终脚本由制备脚本:141–142替换为正式包称呼与1.0.0 User-Agent。first-run-download.log:1–3实见两个下载及成功；repeat-first-run.log:1复用成功；corrupt-component-rejected.log:1–2拒绝坏哈希；final-isolated-smoke.json:13–15。ZIP确实不含两个视频EXE。 |
| 本地OCR随包，首次不依赖开发环境 | PASS。最终包OCR runner与模型在清单内；.tmp/initial-final-verify.mjs:47–51使用新临时cache与SystemOnly PATH执行自检；ocr-empty-cache.log:1返回ok/detector/recognizer=true。该证据证明初始化，不等于整集OCR精度验收。 |
| 最终包独立安装、空库、供应商入口 | PASS。.tmp/initial-final-verify.mjs:52–75；final-isolated-smoke.json:2–17证实isPackaged、空剧目/空供应商、稳定渠道、隔离数据、SystemOnly PATH；两张最终截图已实见，无作者素材/账号预置。 |
| 真实业务闭环与失败路径 | PASS（限定测试前提）。tests/current/original-clip-pool-export-report.spec.ts:109–124先在dev隔离库生成候选，再以最终EXE打开同一隔离库；确认、显式勾选、真实FFmpeg导出和报告在最终EXE执行（:165–220）。tests/current/packaged-business-smoke.spec.ts:12、101、132、173分别验证语义一次修正、局部证据、失败返回和85集IPC持久化。finalBusiness日志5 passed；语义服务是localhost HTTP夹具（该文件:15–32），不是付费服务验收。 |
| README真实、数据升级卸载说明 | PASS。docs/release-readiness/initial-release/先读我.txt:4–6、9–12、15–26与实物匹配。真实数据目录代码src/main/index.ts:65–66。说明明确首次联网、无自动更新、备份与旧版保留、自有供应商费用/上传、二创受控、P2/云OCR不开放、只分发原ZIP。 |
| 未签名与跨电脑边界 | PASS。先读我.txt:6、25如实说明；本次独立Get-AuthenticodeSignature返回NotSigned。独立电脑按用户决定暂缓，不计阻断、不宣称通过。 |

未实现/部分实现：本次授权发布范围无。Spec漂移：未发现本轮新增业务范围；依赖修正及lockfile optional peer解析已在发布计划:25和候选closure:9记载。

## Stage 2：Code Quality / Safety / Evidence

- PASS：制备脚本职责为验证、复制、许可收集及归档；stable门禁校验来源和closure、候选EXE/asar，拒绝覆盖。证据：prepare-peer-distribution.py:90–114、119–123、148–184。首启脚本仅提取指定tar普通文件，不将归档路径直接写盘；SHA不符退出；临时删除限制在生成的系统临时路径（首次启动.ps1:26–77、93–112、121–127）。
- PASS：针对本轮制备Python/PowerShell检索eval、innerHTML、密码/密钥常见模式无匹配。另独立运行现有包隐私审计，最终解压目录含两项已下载工具共4015文件通过。证明现有审计规则范围无命中，不是全产品安全认证。
- PASS：许可实物含113项索引与随附许可；与清单SHA绑定。第三方组件与源码来源.txt:5–15列Electron/Chromium/Python/Paddle来源；:17–29明确FFmpeg/FFprobe为GPL构建、ZIP不分发这两个二进制、上游源码入口不等于全部对应源码封存、不得重打包转发。该结论核验材料与包边界一致，不作法律合规认证。
- PASS：测试真实性抽查确认packaged分支确实切换最终EXE并断言isPackaged，而非只运行开发入口（original-clip-pool-export-report.spec.ts:111–124）。临时媒体来自合成视频，外部语义来自HTTP夹具；不把合成测试当真实素材质量评估。
- PASS：本轮不改UI。已实际查看最终空库和供应商页截图，并比较两页侧栏、字体、暖色按钮、背景和间距一致；版本页脚无截断。继承44项scoped视觉证据（候选closure:25），不扩张为全产品设计认证。最终业务用例继续覆盖候选池/完成报告（original-clip-pool-export-report.spec.ts:149–220）。

### 原始编译/测试输出（复用绑定日志；本次未重跑全量）

来自 release/candidates/v1.0.0-p1-stable/checks/build.log 尾部；build.json:9–12退出0：

```text
vite v8.1.5 building ssr environment for production...
transforming...✓ 114 modules transformed.
out/main/index.js  706.08 kB
✓ built in 316ms
vite v8.1.5 building ssr environment for production...
transforming...✓ 2 modules transformed.
out/preload/index.cjs  14.74 kB
✓ built in 77ms
vite v8.1.5 building client environment for production...
transforming...✓ 174 modules transformed.
out/renderer/index.html                     0.42 kB
out/renderer/assets/index-B443XedN.css     82.67 kB
out/renderer/assets/index-rYXKaGpa.js   3,059.27 kB
✓ built in 779ms
$ node tools/verify-renderer-model-studio-boundary.mjs
RENDERER_MODEL_STUDIO_BOUNDARY_OK scripts=1
```

```text
$ tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json
 Test Files  150 passed | 5 skipped (155)
      Tests  893 passed | 5 skipped (898)
```

类型检查退出0（checks/typecheck.json:9–12）。current整轮48pass/10skip/1fail，失败P2 Escape项原样单worker两次复验通过，同源聚合49覆盖；不称单轮全绿（closure:24）。实际候选安装11项通过（closure:27），不替代最终ZIP验证。

### 本次独立实物命令及原始输出

命令：Python标准库zipfile.ZipFile.testzip；逐清单size/SHA256；逐程序文件对照candidate；manifest/verification SHA256；hashlib.file_digest等价SHA计算。退出0：

```text
ZIP_CRC None
ZIP_ENTRIES 4013 DUPLICATES 0
INVENTORY 4012 MISMATCH [] EXTRA set()
CANDIDATE_PROGRAM 3742 MISMATCH []
candidateManifestSha256 True
candidateVerificationSha256 True
VIDEO_EXCLUDED True
METADATA {'appVersion': '1.0.0', 'channel': 'stable', 'signed': False, 'licenseIndexEntries': 113}
ZIP_SHA 4d43ca54168d32e6769ff58e580087ba11638658a3d223db8f1080905f0467d6 BYTES 572321846
```

命令：node内调用tools/candidate-provenance.mjs的verifyProvenance；node内递归调用tools/package-privacy-audit.mjs的auditPackagePrivacy；PowerShell Get-AuthenticodeSignature。各核心命令成功：

```text
{"reasons":[],"sourceIsAncestor":true,"currentSourceMatches":true}
INDEPENDENT_PRIVACY_PASS files=4015
NotSigned
```

最终运行原始输出与退出状态已读：test-results/candidate-checks/finalSmoke-1793000724754/finalSmoke.json:9–15、finalSmoke.log:1：

```text
FINAL_STABLE_ISOLATED_SMOKE_PASSED
```

finalBusiness-1793000742787/finalBusiness.json:9–15、finalBusiness.log:1–17：

```text
Running 5 tests using 1 worker
  ok 1 [current] › tests\current\original-clip-pool-export-report.spec.ts:68:1 › CLIP-REAL-005 to CLIP-REAL-008 closes sparse local evidence, pool, export, and report path (26.3s)
  ok 2 [current] › tests\current\packaged-business-smoke.spec.ts:12:1 › packaged semantic selection repairs an unfinished proposal once without subtitle recovery (10.3s)
  ok 3 [current] › tests\current\packaged-business-smoke.spec.ts:101:1 › packaged preflight automatically accepts local OCR islands without changing subtitles (2.6s)
  ok 4 [current] › tests\current\packaged-business-smoke.spec.ts:132:1 › packaged clip subtitle preflight failure returns to real global pages instead of prototype demos (5.3s)
  ok 5 [current] › tests\current\packaged-business-smoke.spec.ts:173:1 › packaged app persists 85 real IPC imports and subtitle mapping in isolated temporary userData (9.2s)
  5 passed (58.6s)
```

最终smoke前两次因exact文本定位范围不符失败，记录分别保留于finalSmoke-1793000564194和finalSmoke-1793000650589；第三次使用现有`.sidebar-foot .meta`节点断言成功。未修改程序/ZIP，不称三次均通过。OCR日志含底层Windows输出解码乱码及ccache提示，但有效JSON明确ok=true且进程退出0；不把日志提示改写成完整识别精度证明。

最终交付实物：`03_发布包/素材平台-1.0.0-正式初版/素材平台-1.0.0-Windows-x64-正式初版.zip`，572321846字节，SHA256 `4d43ca54168d32e6769ff58e580087ba11638658a3d223db8f1080905f0467d6`。允许在已授权范围交付本地正式初版；跨机兼容性、真实付费供应商、人工内容质量与公开发布均未在本报告宣称完成。

