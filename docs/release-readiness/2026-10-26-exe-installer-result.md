# 标准EXE安装包已交付并更新GitHub

2026-10-26。已纠正此前将“免安装ZIP+BAT”当作用户所需标准Windows安装包的交付偏差。现已补齐真正NSIS安装EXE，用户运行Setup按向导安装后，桌面和开始菜单直接打开应用EXE，无需BAT或手动解压。

## 唯一推荐安装附件

- GitHub：https://github.com/ZIO2008/short-drama-ai-clipper/releases/download/v1.0.0/ShortDramaMaterialStudio-1.0.0-Setup-x64.exe
- 本地：项目根03_发布包/素材平台-1.0.0-安装版-r2/ShortDramaMaterialStudio-1.0.0-Setup-x64.exe。
- 字节：403805667，约385MiB。
- SHA256：984efdb38a853dd7624e36ec05fcb9339a8a6b323e23f86c04372f401c61aca9。
- 附件SHA256-Setup.txt、Installing.zh-CN.txt同时上传。现有v1.0.0仍为Latest，说明与公开源码分支README首选安装EXE；原ZIP及原v1.0.0源码标签未覆盖/移动。
- 安装器制备源码提交：3e75c4c1d10859e27aa88dfad1697f2c9eed98c3。

## 实物验证

1. 制备采用electron-builder26.15.3/NSIS3.0.4.1的prepackaged路径，实际编译退出0。1.0.0原应用3742文件及EXE/asar保持原始字节；最终payload4012文件逐SHA匹配，许可266文件、索引113依赖保留。两个视频二进制不随安装器重分发，而在安装阶段固定上游下载并校验。
2. 真正Setup以静默参数和独立目录验证：预植损坏ffmpeg使安装退出2，两项本轮快捷方式被移除；同一Setup重新安装退出0，全部payload和两个工具SHA通过。失败会留下可重跑/卸载的程序文件及注册信息，不称完整回滚。
3. 解析实际桌面/开始菜单.lnk：TargetPath均为安装目录下的短剧投流素材生成平台.exe，Arguments为空，无BAT。实际同路径EXE以受控临时userData启动，isPackaged/1.0.0/stable/空库/数据库及可见正式版均通过。不是在真实数据上直接双击桌面进行测试。
4. 本地OCR在新缓存、仅系统PATH环境初始化通过；实际安装EXE的5项业务复验通过。业务证据使用合成素材、本地HTTP语义夹具，部分候选先在开发隔离环境预置，不冒充真实付费云服务或任意素材从零生成验收。
5. 真正uninstaller退出0，测试应用和本轮快捷方式移除；隔离data标记及实际应用SQLite仍存在，卸载后只读integrity_check=ok。未触碰正式数据/原片、未替换日常0.1.108。测试安装已卸载，用户若使用新版请运行推荐Setup正常安装。
6. Fresh nsis_final_review Stage1/2 PASS，无阻断HIGH/MEDIUM。Setup实际NotSigned；payload和安装器规则隐私扫描通过。网络180秒无输出超时仅静态核验，未实际等待超时；独立电脑与逐页人工点击向导均未验收。
7. GitHub全部六附件大小/服务端SHA256与本地匹配；新Setup匿名下载HEAD200，Content-Length403805667。公开说明首选EXE，原ZIP保留为便携备选。

## 制备与范围边界

安装交付身份为1.0.0-setup-r1（首次安装版交付），本机目录r2是制备修订，不是应用版本；更早r1草稿已标记未交付。初轮审查发现来源说明沿用ZIP相对目录，已修正为安装根目录/安装阶段/Setup分发，并重新构建后实测。NSIS构建原始完整stdout未单独落盘，仅有本会话控制台摘录和输出manifest，未伪造为独立构建日志；其余测试原始日志已封存。

独立电脑验收仍按用户决定暂缓。现有业务、数据库schema、候选算法、1.0.0 ZIP都未变；不启动其它增强。

精选证据：../release-evidence/v1.0.0-setup-r1/manifest.json及final-review.md。使用说明：windows-installer/Installing.zh-CN.txt。
