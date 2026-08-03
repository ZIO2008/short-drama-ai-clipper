# 版本治理

当前受控范围：`P1 · 内部试点`。应用版本唯一来自 `package.json` 的 `version`；范围和通道唯一来自 `src/shared/release-metadata.ts`。P2 解说/TTS/旁白仍无生产入口，不能当作本候选功能。

工作空间入口和文档权威顺序见 `D:\个人工作\WORKSPACE-CURRENT.md`。本文件必须区分“当前开发工作树”与“最近不可变候选”：工作树存在未提交变更时，不能以 `package.json` 的数字或目录修改时间把它称为发布版本。

| 位置 | 来源/当前值 | 风险 | 治理结果 |
|---|---|---|---|
| `package.json` | `0.1.32` | 多处手写 semver，或把工作树数字误读为发布版 | Electron `app.getVersion()` 直接派生；仅构建出 manifest 后才是候选包版本 |
| `release-metadata.ts` | `P1` / `internal-trial` | UI 写死 P0 | 主进程健康接口派生，UI 只显示接口返回值 |
| `release/candidates/` | 不可变候选目录 | 覆盖式 `release/` 无法追溯，或把历史候选冒充当前工作树 | `pnpm pack:current` 创建不可覆盖的 `v<version>-<scope>-<channel>` 目录和哈希 manifest |
| 打包 E2E | 显式 `SHORTDRAMA_PACKAGED_EXE` | 默认启动历史包 | 未传路径即跳过；`pnpm release:verify` 只接受当前 manifest 对应 exe |
| 历史文档 | 旧 P0/P1 记录 | 被误读为当前候选 | 保留为历史事实，不构成当前发布证据 |

## 当前候选流程

1. 运行 `pnpm run check:version`，版本、范围、UI 和包级测试入口不一致会失败。
2. 运行 `pnpm run release:verify`：先校验 Version 48 设计合同并通过 `pnpm run audit:fidelity`；任一逐状态视觉证据缺失或阈值超出时，打包必须停止。之后才构建、确认 Electron ABI 对应的 SQLite 原生绑定已存在、生成不可变候选目录、确认候选的 `app.asar.unpacked` 包含该绑定、写入 exe/app.asar SHA-256 manifest，并用该 manifest 的 exe 跑 DPI 与长列表包级 E2E。`pnpm pack:dir` 现在是同一不可覆盖候选流程的别名。
3. 当前启动入口是开发模式 `pnpm dev`，或候选 manifest 中的 `executablePath`。不得从 `release-v*` 目录启动来证明当前工作树。

最近不可变候选：`v0.1.32-p1-internal-trial`。它包含逐集字幕首屏加载真实状态、请求乱序详情隔离与完成报告导出批次绑定；manifest EXE 已实际启动并完成包级验证。入口、哈希与终审证据见 `docs/v0.1.32-p1-internal-trial-closure.md`。该候选是最后一个可追溯的包级产物，不等于当前未提交工作树，也不等于正式发布版本。所有旧候选包（包括 `v0.1.31`）只保留历史追溯。

## 历史包清单

`release`、`release-v1.6`、`release-v1.7`、`release-v1.8`、`release-v1.9`、`release-v1.9-p0`、`release-v1.9-p0-r2`、`release-v1.10-p0`、`release-v1.10-p0-r2`、`release-v1.11-p0-r1`、`release-v1.11-p0-r2`、`release-v1.11-p0-r3` 全部是历史证据。它们不删除、不移动，也不得作为当前候选、默认 E2E 路径或“最新版本”结论。

回滚是显式选择某个历史目录并核验其自身 hash；不能把它伪装成当前工作树的验证结果。
