# 2026-10-14 正式使用前只读准备终审

**结论：Stage 1 PASS；Stage 2 PASS；前次唯一 MEDIUM 已关闭。本次审查未发现新的 HIGH/MEDIUM。** 范围仅为正式使用前决策文档、三份复核脚本及与边界有关的产品代码。没有启动 Electron、改动正式数据、切换入口或执行发布；本报告不是并行正式使用、替换旧版或跨产品迁移的许可。

## Stage 1 · Spec Compliance

| 结论 | 逐项核对及证据 |
| --- | --- |
| PASS | 数据保护与隔离：`Product-Spec.md:37,214,221` 要求更新不清空既有数据、数据物理隔离及可校验回滚。决策文档 `2026-10-14-formal-use-decision.md:7,15-18,34-40` 区分旧 v8.38.1 和新 0.1.95 的入口、数据与备份，并将持久完整备份和切换列为待办；未声称已经完成切换。新程序路径由 `src/main/index.ts:59-66` 指向 `ShortDramaMaterialStudio`，其内置旧通道搜索仅限新 userData 下的 `development/stable`（`src/main/data/legacy-user-data-migration.ts:78-87`）。因此文档没有将跨产品迁移过称为已实现。 |
| PASS | 候选身份与隔离演练：`release-readiness-rehearsal.mjs:8-17` 在创建临时目录前校验 manifest、EXE 哈希，并采集正式主库/WAL 前指纹；`:19-47` 用实际候选 EXE 读取两个隔离 userData，比较快照、剧目/分集数及恢复 SHA；`release-readiness-snapshot.py:36-55` 通过源库只读连接及 SQLite backup API 获得含 WAL 提交的快照。包内路径约束见 `src/main/packaged-smoke-runtime.ts:10-22`。决策文档 `:24-30` 仅宣称 schema 44 现存数据的隔离启动和回退，明确排除新 schema 与旧产品数据迁移。本次未独立重跑 Electron；两次启动、4 剧目/87 集、恢复 SHA 相等与退出 0 属于决策文档记录的前次实测，代码支持该验收路径。 |
| PASS | 源库不变断言：`release-readiness-rehearsal.mjs:48-51` 现在在主库或 WAL 指纹不一致时立即抛错，因而不会打印成功 JSON，进程会以非零状态结束；`:52-56` 随后清理隔离目录。文档 `2026-10-14-formal-use-decision.md:29-30` 正确限定为观察窗口内字节比较，并说明并发外部写入也可能触发，不能直接归责演练。此次只读 Python 复核主库 `e69d9dd813a28e8e94f035661e8e9c58d5d24933de6ada37c235cac4bd51476c`、WAL `e18a7c05d23aa104a55f4b60808e6d4a06259ab5f0bd9d48f7048a0c0125b744`，与文档 `:29` 一致。配置和 SHM 未在该断言范围内，文档没有将它们称为哈希已验证。 |
| PASS | 内置备份边界：`release-readiness-db-audit.py:62-81` 只读审计最近备份；`src/main/services/backup-service.ts:112-132` 脱敏源媒体及其他路径。决策文档 `:31-32,37` 准确说明内置备份不能单独作为完整可继续剪辑的回退，持久完整备份仍须另建。 |
| PASS | 范围与许可：`DEV-PLAN.md:7-11` 只确认内部候选，正式替换与公开发布未授权；决策文档 `:34-41` 将并行入口、持久备份及最终切换留待决定。没有发现审查范围内新增 UI、路由或 API 的 Spec 漂移；本轮无 UI 改动，设计稿和邻居页面视觉对比不适用。 |

## Stage 2 · Code Quality / Safety

| 结论 | 核对项及证据 |
| --- | --- |
| PASS | 前次 MEDIUM 已关闭：旧 `review-2026-10-14-resolved.md` 指出只记录 `sourceFingerprintsMatch` 而仍可退出 0；现脚本 `release-readiness-rehearsal.mjs:48-51` 明确 `if (!sourceFingerprintsMatch) throw`。SHA-256 实测为 `25A3DA5A8C79C6F47E718A8762CCD4A4AB8DEC463577D2FAB529A5F4CF0BCDE1`，与决策文档 `:24` 一致。 |
| PASS | 临时目录清理：候选身份和正式库前指纹检查在 `mkdtempSync` 之前（`release-readiness-rehearsal.mjs:11-17`）；创建后的主流程由 `try/finally` 包围，删除前验证 realpath、系统临时目录相对路径与 `shortdrama-cutover-` 前缀（`:40-56`）。快照脚本另验证临时根目录的真实位置和前缀（`release-readiness-snapshot.py:9-14`）。本次只读枚举临时目录，`shortdrama-cutover-*` 残留数为 `0`。 |
| PASS | 隐私与注入：`release-readiness-db-audit.py:9-19` 动态 SQL 表名受固定白名单限制；源库只读连接见 `:27-33` 和 `release-readiness-snapshot.py:36-45`。演练输出 `release-readiness-rehearsal.mjs:51` 只含候选身份、计数、schema/完整性和哈希；未输出剧名、字幕正文、媒体完整路径或密钥。对三份脚本执行安全模式检索，未命中 `eval`、`innerHTML`、硬编码密钥模式或 shell 拼接。脚本均少于 300 行。 |
| PASS（范围限定） | 新脚本已通过 Node 语法检查和 Python AST 解析；本次只读终审未运行产品编译，也未重跑 Electron。决策文档 `:41` 引用的候选测试属于先前证据，不作为本次编译输出。 |

语法检查原始命令与输出（空输出代表 `node --check` 成功；退出码已另打印）：

```text
node --check docs/release-readiness/scripts/release-readiness-rehearsal.mjs
py -3 -c "import ast,pathlib; p=pathlib.Path('docs/release-readiness/scripts'); [ast.parse(f.read_text(encoding='utf-8'), filename=str(f)) for f in p.glob('*.py')]; print('Python AST parse: OK')"
Python AST parse: OK
node_check_exit=0 python_ast_exit=0
```

本次 `Get-FileHash` 读取正式数据库因其他进程占用而失败；随后使用 Python `Path.read_bytes()` 只读计算得到上表两个指纹。该事实进一步限制了归责范围：指纹匹配只证明采样时文件字节相同；若将来指纹不匹配，应先调查并发写入及环境状态。本次未生成或验证可长期保存的完整备份，正式使用所需决策与门槛仍以决策文档 `:34-40` 为准。
