# 0.1.108 亲友分发 r3 最终独立审查

结论：**本轮“分享包准备＋本机隔离验证”Stage 1 PASS / Stage 2 PASS；HIGH 0、MEDIUM 0、LOW 1。跨机实际验收仍待完成，不构成公开发布或跨机稳定性通过。**

审查范围：Product-Spec.md:1、DEV-PLAN.md:1 新授权及 docs/release-readiness/2026-10-19-peer-distribution-plan.md:3-14 全部四步、完成标准与排除项。旧业务需求沿用同字节0.1.108既有验收，未冒充本轮重新完成全产品验收。只写本报告，未修实现、重建native模块、运行全量unit/Electron或操作正式库。

## Stage 1 — Spec Compliance

|条目|结果及证据|
|---|---|
|1 原版本身份与数据边界|完整。prepare-peer-distribution.py:82-91 固定候选及EXE/asar哈希；103-106逐文件复制校验。独立重算最终ZIP SHA256为503783481b58bb7e55fc935a699f281d4ffbeb56a1fd5e1501cd07f7c53cc444；final-zip-verification.json:14-18绑定相同应用。无产品/UI/DB变更。|
|2 可解压运行包与依赖|完整。prepare-peer-distribution.py:97-116 GUID staging、排除两项GPL视频二进制、附说明/许可。首次启动.ps1:8-23固定上游和SHA256，76-102校验后才启动。最终ZIP独立检查4013文件（4012清单条目＋清单自身），逐SHA全部匹配、完整CRC通过，未包含ffmpeg.exe/ffprobe.exe及许可目录pyc。|
|2 中文引导、配置、费用|完整。先读我.txt:4-13说明Windows x64、完整解压、首次联网、自有供应商/账号、云端费用、数据发送及资格门禁；19-25说明实际数据目录、升级备份、诊断。src/main/index.ts:65匹配数据目录；SettingsPage.tsx:75支持诊断入口。verify-final.mjs:49-53断言三个配置入口且final-provider-setup.png实际可见。既有设置占位措辞不作为新增服务验收证据。|
|2 许可来源与分发边界|完整。第三方组件与源码来源.txt:3-15列组件、来源与Python构建环境许可超集；17-29明确GPL、源码资料缺口、接收者直取上游及不得转发补全目录。独立检查许可索引113项。此结论是材料与包内容一致性审查，不扩大为对上游许可履行情况的法律认证。|
|3 最终包本机隔离验证|完整于本轮边界。final-isolated-smoke.json:2-17：真实packaged v108、空剧目/配置、DB正常、System32 PATH、配置入口；verify-final.mjs:40-56验证真实EXE，不以占位EXE模拟程序成功。r3-first-run-download.log:1-3只证明PrepareOnly下载；repeat-first-run.log:1离线复用；corrupt-component-rejected.log:1-2坏hash阻断。|
|3 OCR与业务证据复用|完整且限域。ocr-empty-cache.log:4-6证明内置模型初始化，不声称本轮OCR识别准确率验收。final-business-e2e.log:6-12为r2真实导出/报告、语义mock修正、OCR资格、失败导航、85 IPC持久化5项；与r3程序同字节证据见final-zip-verification.json:18及r2-zip-verification.json:14-17。未称付费外部服务已验收。|
|4 审查/交付与VM边界|完整于准备阶段。计划:14明确VM暂缓；final-isolated-smoke.json:17明确host隔离非VM。本报告完成本轮独立复核，交付只可指最终r3 ZIP及其SHA，跨机保留待验。|
|隐私|完整。prepare-peer-distribution.py:129-133打包前强制audit失败即退出；final-privacy-audit.json:2-5扫描最终解压及两下载文件4015项；verify-final.mjs:13-15使用实际文件扫描。tools/package-privacy-audit.mjs:5-13、44-57检查禁带数据/凭据和开发路径。结论限该规则扫描与空数据实测，不声称覆盖所有可能个人信息。|
|UI/Spec漂移|未发现本轮新增页面、API、表或交互。现有UI字节身份复用；新增文档和启动入口均在计划:5-8范围。本轮没有新页面，因此邻居页面新旧视觉比较不适用，已人工查看最终设置截图核实引导入口。|

## Stage 2 — Code Quality

- 通过：准备脚本151行、首启114行；职责集中、异常阻断清晰。GUID staging允许失败后新运行；最终ZIP存在即拒绝（prepare-peer-distribution.py:94-98）；独占partial经CRC通过才rename（134-142）。
- 通过：首启用.NET SHA256消除Get-FileHash自动加载依赖（首次启动.ps1:13-23）；解包只读取精确tar成员、不落盘归档路径（36-61）；下载到临时文件校验后移动（86-99），失败不启动（103-106）；临时目录清理有绝对路径及前缀检查（108-112）。
- 通过：测试真实性抽查verify-final.mjs:26-38离线代理与坏hash可达，40-56真实安装EXE和隔离userData；tests/current/packaged-business-smoke.spec.ts:44-54明确localhost语义fixture，未假冒真实付费API；original-clip-pool-export-report.spec.ts:110-116在指定候选时走真实packaged IPC。测试没有覆盖跨机、系统策略限制与实际付费账号，维持待验边界。
- **LOW-01**：prepare-peer-distribution.py:121 固定distributionId为`0.1.108-peer-r1`，最终目录为r3。最终ZIP SHA和文件清单仍可唯一追溯，故不阻断；后续打包可将修订号显式入参，减少人工混淆。

## 编译/静态检查与独立校验原始输出

本轮未重新编译产品，复用固定候选；未把语法解析称为产品编译成功。本轮新增脚本语法解析exit 0：

```text
PYTHON_AST_PARSE_PASSED
POWERSHELL_PARSE_PASSED
```

最终ZIP独立全量读取校验exit 0：

```text
ZIP_SHA256 503783481b58bb7e55fc935a699f281d4ffbeb56a1fd5e1501cd07f7c53cc444
CRC_BAD_FILE None
FILES 4013 MANIFEST_FILES 4012 MISMATCH []
FFMPEG_EXE_PRESENT False
SCRIPT_SHA256 4f33603f50774e1605b7db495f2c1a5066ee07c25fb24cbfa2ac26197e391601
PYTHON_BYTECODE_NOTICE []
LICENSE_INDEX_ENTRIES 113
```

已存业务日志原始结果（复用，不是本审查重跑）：

```text
5 passed (1.5m)
```
