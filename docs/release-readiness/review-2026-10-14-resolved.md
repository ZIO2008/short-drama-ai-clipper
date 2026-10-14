# 2026-10-14 正式使用前只读准备复审

结论：Stage 1 **PASS**；Stage 2 **PASS，保留一项 MEDIUM 断言缺口**。范围仅为正式使用前决策文档及三份演练脚本。未启动 Electron、未编译、未切换正式入口，也不构成发布许可或上一代工具数据迁移验收。

## Stage 1 · Spec 与事实边界

| 结论 | 核对项和证据 |
| --- | --- |
| PASS | `DEV-PLAN.md:7-11` 将 0.1.95 定义为已验证内部候选，正式版替换、公开发布和跨产品迁移仍未授权；决策文档 `docs/release-readiness/2026-10-14-formal-use-decision.md:7,34-41` 明确将并行正式使用、替换和迁移留待决定，没有扩大许可。`Product-Spec.md:35-38,214,221` 要求保护既有数据、物理隔离和可校验恢复。 |
| PASS | 旧入口 `D:/个人工作/短剧AI切片工具/_launch_stable.ps1:3-21` 依目录修改时间和 EXE 大小选择，决策文档 `:7-9,36-39` 正确要求独立明确入口。新平台 `src/main/index.ts:59-66` 使用 `ShortDramaMaterialStudio` userData；`src/main/data/legacy-user-data-migration.ts:78-87` 只寻找新平台的 development/stable 通道。报告 `:15-18,30,36` 没有把旧 v8.38.1 数据说成自动迁入。 |
| PASS | `release-readiness-rehearsal.mjs:11-17` 在创建临时目录前验证候选 manifest、EXE 文件存在及 SHA-256，并读取正式数据库主文件/WAL 的前指纹；`release-readiness-snapshot.py:36-55` 以只读连接和 SQLite backup API 准备含 WAL 提交的快照及隔离副本。`release-readiness-rehearsal.mjs:40-47` 比较快照完整性、计数、恢复文件 SHA-256 与两次包内 IPC 的剧目/分集计数；`src/main/packaged-smoke-runtime.ts:10-22` 限制打包 userData 为系统临时目录下真实目录。报告 `:24-30` 的演练范围与代码相符；本复审没有重跑两次 Electron，历史进程退出 0 仅有该报告记录，不能称为本次独立实机复验。 |
| PASS | 本次只读数据库审计退出 0：schema 44、4 剧目、87 分集、5 成果，快照及恢复 `integrity=ok`，快照与恢复 digest 一致。`release-readiness-db-audit.py:27-60,83-100` 给出实际读取和断言；报告 `:26-27` 的数字与本次原始输出一致。 |
| PASS | `release-readiness-db-audit.py:62-81` 只读检查 7 份内置备份，最新备份 87/87 分集源路径为 `[redacted]`；`src/main/services/backup-service.ts:112-132` 同时脱敏其他媒体/成果路径。报告 `:31-32,37` 正确排除将内置隐私备份当作完整持久回退。 |
| PASS（观察边界） | `release-readiness-rehearsal.mjs:48-49` 真实计算前后主文件及 WAL 的 SHA-256；本次另用 Python 只读读取，二者当前仍分别为 `e69d9dd813a28e8e94f035661e8e9c58d5d24933de6ada37c235cac4bd51476c`、`e18a7c05d23aa104a55f4b60808e6d4a06259ab5f0bd9d48f7048a0c0125b744`，与报告 `:29` 所列相同。这只证明观察窗口及本次读取时的文件字节相同，不证明期间所有进程行为，也不涵盖未采集的配置/SHM。 |

本次只读审计原始命令：`py -3 docs/release-readiness/scripts/release-readiness-db-audit.py`；退出码 `0`。

```text
{"mode": "read-only source, in-memory SQLite backup and restore", "sourceMainBytes": 4198400, "sourceWalBytes": 1042392, "schemaVersion": 44, "counts": {"dramas": 4, "episodes": 87, "subtitle_tracks": 216, "subtitle_cues": 5944, "generated_materials": 5, "clip_export_batches": 5, "provider_profiles": 3, "secret_records": 7, "app_backups": 41}, "snapshotIntegrity": "ok", "snapshotDigest": "7ba9f48c6ecb5555e12e065de3e1ee2278c0537f85b7e878304c0e44af44cc8c", "isolatedMutationChangedDigest": true, "restoredDigestMatches": true, "restoredCountsMatch": true, "restoredIntegrity": "ok", "markerAbsentAfterRestore": true, "managedBackupCount": 7, "latestManagedBackup": {"modifiedLocal": "2026-10-14T16:01:24", "integrity": "ok", "episodes": 87, "redactedEpisodePaths": 87}}
```

## Stage 2 · 质量、安全与残余缺口

| 结论 | 核对项和证据 |
| --- | --- |
| PASS | 前次“初始化异常遗留临时目录”已修复：`release-readiness-rehearsal.mjs:8-17` 先做候选身份和源库前指纹预检，再 `mkdtempSync`；下一执行块 `:40-55` 是 `try/finally`，清理前以 realpath、系统 temp 相对路径和唯一前缀核验目标。`release-readiness-snapshot.py:9-14` 也拒绝不在系统 temp 内的根目录。已创建并进入演练的临时目录有清理保护。 |
| PASS | 前次固定 `preservedSource: true` 已由 `sourceDatabaseFingerprintBefore/After` 和计算得出的 `sourceFingerprintsMatch` 取代，见 `release-readiness-rehearsal.mjs:15-16,48-49`。报告 `:29` 同步了两个原始 digest，并准确说明比较边界。脚本 SHA-256 实测：审计 `FAE82EBD6C2E82DE81EFD37CF89502864D421FB59892E412B7EDF2D7CE01CE52`、演练 `6C6878CDFB60B198A91279420B15FE86C831113A5A8A290726782FA4F174BE1C`、快照 `1C0CDBD7949F44227E3ACAA9590B9010B9C04C8C1AD32DA4B1001DD1E25161ED`，与报告 `:24` 相同。 |
| MEDIUM | `release-readiness-rehearsal.mjs:48-49` 只将 `sourceFingerprintsMatch` 写入 JSON，没有在不匹配时抛错或设置非零退出码。因此未来即使主库/WAL 指纹不同，脚本仍可能退出 0。此次报告所列两组值相等，现有演练结论成立；将“未改变正式数据”作为自动验收门禁前，应将不匹配变成失败条件。 |
| PASS | 三份脚本均不足 300 行；动态 SQL 表名来自固定白名单，见 `release-readiness-db-audit.py:9-19`；源库只读连接见 `:27-33`、`release-readiness-snapshot.py:36-45`。审查脚本未发现 `eval`、shell 拼接、硬编码密钥或输出剧名、字幕、媒体路径、密钥值。完整临时快照包含敏感数据，`release-readiness-rehearsal.mjs:50-54` 删除隔离目录；这不代替正式持久备份的访问控制。 |
| PASS（范围限定） | 未修改 UI，故无新页面与邻居页面的视觉差异可验；`docs/release-readiness/2026-10-14-formal-use-decision.md:30,34-41` 未声称完成旧工具迁移、云服务验收、完整媒体回退或正式发布。未运行编译及 Electron，无法附本次编译原始输出；候选既有测试见 `:41`，不能替代本次复审。 |

Stage 2 未发现 HIGH 安全缺陷。上述 MEDIUM 是未来演练自动判定的质量缺口，不推翻本次已记录的相等指纹与只读准备结论。
