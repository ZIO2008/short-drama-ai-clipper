# 1.0.0 Setup 最终定向审查

结论：**PASS（本机安装交付范围）**。Stage 1、Stage 2 均通过，未发现本次范围内需要阻断的 HIGH / MEDIUM 问题。独立电脑验收暂缓；本报告不代表跨机兼容、真实云服务全流程或数字签名通过。

审查日期：2026-10-26。按 `D:/个人工作/.agents/skills/code-review/SKILL.md` 执行。审查者只读代码、实物和已有测试证据，未重建 native、未运行应用或安装器，仅写本报告。业务历史范围不重审；本轮单一需求源为 `Product-Spec.md:17`，执行边界为 `DEV-PLAN.md:5` 及 `docs/release-readiness/2026-10-26-exe-installer-plan.md:7`。

## Stage 1：Spec Compliance

| 裁决条目 | 结论与证据 |
| --- | --- |
| 标准 Setup.exe、可选目录、当前用户安装 | 完整实现。制作器 `docs/release-readiness/scripts/prepare-windows-installer.py:95` 配置 NSIS、非 oneClick、非 perMachine、禁止提权、允许目录选择；`:106` 使用 `--prepackaged`。实际 Setup 的 SHA256 独立复算匹配，成功安装退出0（`test-results/exe-installer-1.0.0/successful-install.json:24`）。交互向导未由审查者重跑，配置证据与实际静默安装证据分别保留。 |
| 桌面/开始菜单直接打开应用 EXE，无 BAT | 完整实现。制作器`:98`创建两类快捷方式，`:99`关闭结束后自动运行；`.tmp/test-installed-setup.ps1:40`读取实际 LNK。`successful-install.json:6`记录两个 TargetPath 均为安装目录应用EXE、Arguments均空。应用实际启动另见 `application-smoke.json:2`。 |
| 安装阶段获取固定上游视频组件并校验 | 完整实现。制作器`:59`复用已验收初始化脚本并调整根目录、`:66`落盘。实物 `resources/install/InitializeComponents.ps1:9` 固定两个 URL 与 SHA，`:80`校验已有文件，`:97`校验下载后文件。成功安装记录 `successful-install.json:25`确认两视频工具实际 SHA 匹配。 |
| 失败不显示成功、移除本轮快捷方式 | 完整实现。`docs/release-readiness/windows-installer/components.nsh:4`调用隐藏 PowerShell，`:7`分支非0时删除两个新链接、`:13`设置退出2并 Abort；`failed-install.json:2`记录真实坏哈希安装阻断、退出2、链接均无。180秒是无输出超时的静态边界，本次没有实际网络超时注入，不声称已测。失败可能留下程序文件及卸载注册，可重装/卸载；不等于完整回滚，制作器`:73`如实说明。 |
| 卸载保留数据与原片 | 完整实现。制作器`:100`设置 deleteAppDataOnUninstall=false，无自定义数据删除逻辑；`.tmp/test-installed-setup.ps1:54`运行真实卸载器并检查程序/快捷方式消失、隔离数据标记保留。`uninstall.json:3`记录三项均true且退出0。该数据标记在安装目录外；不是正式数据库迁移或原片删除测试。 |
| 原1.0.0业务及ZIP保持，OCR/许可完整 | 完整实现。制作器`:32`锁定输入ZIP SHA、`:45`逐项校验、`:80`及`:113`核对原程序字节。审查者独立复算3742原应用文件及4012 payload文件全部匹配；许可266文件、依赖索引113项，两个视频工具均未包含。原ZIP只读。来源说明根路径已修正（`:53`），安装/Setup措辞已适配（`:54`）；实物 Electron许可及Chromium许可根路径存在，旧路径问题关闭。 |
| 跨电脑暂缓、发布只增加附件 | 范围保持。制作器`:94`关闭发布，`:107`为 `--publish never`，未发现业务或路由扩张；原应用字节一致提供额外佐证。安装版附加到既有Release属于主Agent后续动作，本报告不声称外网附件已上传或tag已核验。跨机限制见制作器`:72`。 |

UI一致性：本轮应用UI无字节变更，无新业务页面。安装向导采用标准NSIS；没有另给设计稿。应用截图证据存在，但本审查未新增页面/邻居渲染对比，不把历史视觉验收冒充本次独立截图复验。

## Stage 2：Code Quality / 安全 / 测试真实性

- 代码质量通过：制作器130行，NSIS17行，职责围绕安装外壳；子进程采用参数列表和check=True（制作器`:87`、`:106`），异常中止；现有最终Setup禁止覆盖（`:29`）。新增 `--archive`（`:23`）仍锁定固定ZIP SHA，不改变本次实物身份。
- 安全扫描通过本次范围：制作器`:40`防归档越界、`:77`禁止重分发视频二进制、`:83`调用包隐私检查。审查者重新执行 payload隐私规则扫描得到 `INSTALLER_PAYLOAD_PRIVACY_PASS`，没有把manifest中的本机暂存路径当成产品泄露；该manifest用于本地证据，不能据此推断公开附件已无私密路径。初始化脚本只提取指定tar普通文件（实物脚本`:47`），SHA校验后才移动到目标（`:97`），临时删除有目录前缀/名称边界（`:113`）。
- 签名状态准确：独立 `Get-AuthenticodeSignature` 得到 `NotSigned`。构建器出现“signing with signtool.exe”不代表实物签名成功；说明文件明确未签名（制作器`:72`）。
- 测试真实性通过受影响范围：`.tmp/setup-smoke.mjs:12`重验实际安装EXE/asar身份，`:14`从安装EXE启动隔离userData，`:17`验证空库和版本，`:25`全新OCR缓存及SystemOnly PATH，`:30`运行5项业务测试。真实日志及退出0元数据位于 `test-results/candidate-checks/setupSmoke-1793022340348/setupSmoke.log:1`、`setupSmoke.json:9`。语义用本地fixture（`tests/current/packaged-business-smoke.spec.ts:12`、`:49`）；导出用例先在dev播种隔离候选（`tests/current/original-clip-pool-export-report.spec.ts:109`）。因此证明安装后的受控语义、OCR、真实导出/报告及85项IPC持久化，不证明任意真实素材经真实云从零闭环。
- 未实现/部分实现/Spec漂移：本轮裁决无未实现或部分实现项，无新增业务功能。安装准备修订目录r2与artifact `1.0.0-setup-r1`分别表示制备修订和首次安装交付，不作为应用版本差异。

## 编译及原始验证输出

审查者未独立重建NSIS。主Agent提供的本会话构建控制台摘录（会话84522退出0；未单独落盘构建log）如下，不能称独立构建结果：

```text
INSTALLER_PAYLOAD_PRIVACY_PASS
  • electron-builder  version=26.15.3 os=10.0.26200
  • building target=nsis file=D:\个人工作\短剧AI切片工具\03_发布包\素材平台-1.0.0-安装版-r2\ShortDramaMaterialStudio-1.0.0-Setup-x64.exe archs=x64 oneClick=false perMachine=false
  • default Electron icon is used reason=application icon is not set
{"artifact":"1.0.0-setup-r1","installerSha256":"984efdb38a853dd7624e36ec05fcb9339a8a6b323e23f86c04372f401c61aca9","installerBytes":403805667,"sourceAppUnchanged":true}
```

审查者只读检查原始输出（退出0；Python用compile()，无pyc写入）：

```text
ORIGINAL_APP_FILES_MATCHED 3742
PAYLOAD_FILES_MATCHED 4012
LICENSE_FILES 266
INDEX_TYPE list COUNT 113
VIDEO_BINARIES_INCLUDED False
PYTHON_SYNTAX_PASS
INSTALLER_PAYLOAD_PRIVACY_PASS
```

实际安装业务日志关键原文（完整5项日志保留在上述setupSmoke.log）：

```text
NSIS_INSTALLED_EXE_SMOKE_PASSED
Running 5 tests using 1 worker
  5 passed (1.2m)
```

审查锁定实物：403805667 bytes，SHA256 `984efdb38a853dd7624e36ec05fcb9339a8a6b323e23f86c04372f401c61aca9`。已安装目录随后由真实卸载测试清理；审查用原payload逐项核验，加此前成功安装全量hash记录建立证据链，未读取已卸载路径冒充当前文件。
