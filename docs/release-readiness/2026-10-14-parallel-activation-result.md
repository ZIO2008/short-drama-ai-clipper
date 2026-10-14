# 0.1.95 本机并行使用执行结果

日期：2026-10-14。范围：在旧 v8.38.1 保持独立可用的前提下，建立素材平台 0.1.95 的固定本机入口、独立安装和完整数据库恢复锚点。此记录不代表公开发布、跨机器分发验收或旧工具数据迁移。

## 当前入口

- 新平台：项目根 `00_打开素材平台.bat`，调用 `_launch_material_studio_stable.ps1`。脚本只读取 `04_material_studio_stable/v0.1.95/install-manifest.json`，校验 EXE 和 `resources/app.asar` 的 SHA-256 后启动；`-VerifyOnly` 身份核验通过。
- 旧平台：`00_打开正式版.bat` 及 `01_正式使用/短剧AI切片工具-v8.38.1/` 原位保留，未把新平台复制到旧入口扫描的目录。
- 新包从已验证的 `release/candidates/v0.1.95-p1-internal-trial/win-unpacked/` 复制；3744 个文件、1,439,193,056 字节与来源逐文件大小和 SHA-256 相同。来源候选包未改。
- 安装 manifest 绑定 releaseId `v0.1.95-p1-internal-trial`、源码提交 `ffd7562a5ae6a415f7edac7f51aa2b7b202f40ae`；EXE SHA-256 `8228e55e193c2e03662bfb8eb0b12042f0ee52cf15c736237382bebf47b2fc87`，app.asar SHA-256 `4d614dbe2e9d780b9b9936527a09156b096221194c365eb49bbfcd456b02c9eb`。

## 数据恢复锚点与验收

- 完整 SQLite 备份位于项目根 `05_material_studio_backups/v0.1.95-before-parallel-20261014-165119-5b69c98c/`，目录权限限定当前 Windows 用户；`backup-manifest.json` 和 `material-studio.sqlite` 均在该目录。数据库 SHA-256 `0ba53d7cfd4f6555e26d883c5fa97115c9b851d7d2a9e366846c67b07d01c113`，4,198,400 字节，`integrity_check=ok`，schema 44。快照包含 WAL 已提交内容和未脱敏原片路径。
- 备份含 4 部剧、87 集、216 字幕轨、5944 字幕行、5 个生成素材、5 个导出批次。87 条原片引用均存在，备份时有 85 个源文件可访问。2026-10-14 只读核对确认另外两条均为单集测试剧目的临时素材引用，分别指向系统临时目录 `short-drama-subtitle-recovery-media-*` 与 `short-drama-p1-media-*`，其父目录已不存在；85 集的实际导入剧目原片均可访问。未修改数据库或自动重连原片。备份不包含媒体文件字节，也不能替代异盘或异机媒体备份。
- `node docs/release-readiness/scripts/verify-parallel-install.mjs`：从该备份恢复到系统临时 userData，恢复后的数据库 SHA-256 与备份相同；独立安装目录中的实际 EXE 以 `packaged-smoke` 通道启动，页面读取到 4 部剧、87 集，退出码 0。临时数据清理完成；正式数据库未作为烟测写入目标。
- 旧入口批处理 SHA-256 `2131553B15BB9C1CE7BD46F78939084241D19C6A8EE01CAA8EDA7F7C0A6536D0`、旧辅助脚本 `464F32CDFE306DC037BC7E03B2B3E3432BA994D07316A05E5F9916F476780CB4`、旧 v8.38.1 EXE `1FA93C3471C11DC8128998C662C705104E4528B98901B61C8A25216ACDA424C5`，与执行前记录一致。

## 本机操作与剩余限制

日常使用新平台前关闭可能仍运行的内部候选窗口，再双击 `00_打开素材平台.bat`。若需回到上一代独立工具，使用保留的 `00_打开正式版.bat`；两者的数据目录和业务数据不是自动互通的。需要恢复 0.1.95 数据库时，先关闭新平台，保留现场，再依据备份 manifest 校验哈希并在隔离目录验证，不能直接覆盖正在运行的正式数据库。

2026-10-14 用户已从新固定入口完成实际使用验收并反馈“没有问题”。这项确认补足了此前隔离烟测之外的日常入口验收；不扩大为跨机发布或旧版替换授权。

早期尝试备份时，Codex 桌面环境把 `%LOCALAPPDATA%` 映射到自身 LocalCache，留下两个同内容、未脱敏的验证副本：`C:/Users/ZIO/AppData/Local/Packages/OpenAI.Codex_2p2nqsd0c76g0/LocalCache/Local/ShortDramaMaterialStudio/full-backups/v0.1.95-before-parallel-20261014-164735-24681750/` 和 `.../v0.1.95-before-parallel-20261014-164942-608bc930/`。两者权限仅当前用户，数据库 SHA-256 与 D 盘受控备份相同。自动审批以 `blocked by policy` 拒绝清理操作，未提供更具体理由；没有绕过。它们不作为长期恢复锚点。

后续用户确认已手动删除上述两个 LocalCache 副本。2026-10-14 只读复核两个精确目录均不存在；D 盘受控备份的数据库和 manifest 仍存在，数据库 SHA-256 与 manifest 一致。先前自动审批拒绝的操作没有被工具绕过。

未向 GitHub push、merge、tag 或创建公开 Release；未改旧正式版、旧工程、用户媒体或正式数据库。此结果限定本机并行使用，后续如需真正跨机交付，另做安装器、媒体可达性和异机恢复验收。
