# P0 内部真实生产试点报告

**候选目录包：** `release/win-unpacked/短剧投流素材生成平台.exe`
**日期：** 2026-07-23
**结论：** 可用于内部真实生产试点；不得称为公开正式发布。

## 试点素材与保护边界

- 源目录：`E:\剪辑盘\20260623_短剧切片投流\《嗨,被纯情少爷盯上了》\标准版`
- 导入集数：连续第 1–30 集。
- 第 1 集选择：`01（戏前）.mp4`；`01（戏后）.mp4` 未导入。选择依据是“戏前”对应正片起点，避免把同一集的两种版本写入同一剧目。
- `01（戏前）.mp4` SHA-256：`F8F95C1E9419EEA1E00F807B9578C9940667258CD1EA243D7143F0BF76000893`。
- 试验全程只读取源文件；输出仅写入 `短剧AI切片工具/80_测试候选/` 下的独立目录。

## 真实输出结果

| 流程 | 输出 | 时长 / 帧率 | 实际大小 | 结论 |
|---|---|---:|---:|---|
| 多集拼接与重启恢复 | `D:\个人工作\短剧AI切片工具\80_测试候选\p0-real-media-20260722-231127\真实P0验收剧目\多集拼接_20260722T151133\真实P0验收剧目_第001-002集.mp4` | 451.819 秒 / 25 FPS | 188,244,644 bytes | ≤200 MB，通过 |
| 原剧切片、人工微调与确认导出 | `D:\个人工作\短剧AI切片工具\80_测试候选\p0-real-original-clip-20260723-final\clip-eb5959e6.mp4` | 8.280 秒 / 25 FPS | 16,884,049 bytes | ≤200 MB，通过 |

多集试验先在隔离 userData 中导入 30 集、对第 1–2 集做大小模式预检（目标 190 MB），创建待运行任务，强制结束应用，再启动新应用并从任务中心恢复任务。产物时长、帧率和体积由 FFprobe/文件系统重新读取，不以 UI 文案代替。

原剧切片试验同样导入 30 集，执行候选 `0.5–10` 秒 → 人工调整为 `1–9` 秒 → 确认 → 实际 FFmpeg 导出。微调状态修复后于 2026-07-23 重新执行该真实试验；完整机器可读 JSON 见 `D:\个人工作\短剧AI切片工具\80_测试候选\p0-real-original-clip-20260723-final\real-original-clip-trial.json`。

## 当次自动化与打包证据

- `pnpm typecheck`：通过。
- `pnpm test`：46 个测试文件、139 条测试通过。P1/P2 实验性测试已从 P0 默认测试图排除，避免把非发布范围纳入 P0 交付门禁。
- `pnpm build`：通过；P1/P2 路由、preload IPC、任务类型和可执行工作流检索为零匹配。素材生产页保留两张明确标记“开发中，暂不可用”的路线图卡片。
- `pnpm test:e2e`：2 通过、2 跳过；通过项覆盖 FLOW-001–004 和当前 Windows DPI 打包启动。两份真实素材脚本需要显式环境变量，默认跳过，防止日常回归读写真实素材。
- `pnpm exec electron-builder --dir --config.directories.output=release-v1.6`：通过；独立目录包位于 `release-v1.6/win-unpacked/`，包含 `resources/models/ffmpeg.exe` 与 `ffprobe.exe`。
- `SHORTDRAMA_PACKAGED_EXE=release-v1.6/win-unpacked/短剧投流素材生成平台.exe pnpm exec playwright test tests/e2e/packaged-real-dpi.spec.ts --reporter=line`：通过；当前系统缩放为 150%，`devicePixelRatio=1.5`、`scrollWidth=1426`、`innerWidth=1426`。
- 最新独立 code-reviewer：Stage 1/Stage 2 通过，无 HIGH/MEDIUM；P1/P2 严格扫描对 `out/` 和新目录包 `app.asar` 均为零匹配，且不再包含 TypeScript 构建元数据。

## 保留发布边界

本候选物在素材生产页显示 P1/P2 AI 二创与 AI 解说的“开发中，暂不可用”路线图卡片；卡片不包含路由、审核时间线、preload/IPC、任务执行或成果入口。P1/P2 实验性源文件保留在仓库但不进入 P0 构建路径。

**公开发布前唯一保留的外部验证缺口：** 另一台干净 Windows 10/11 机器的首次启动，以及真实系统 100%/125% DPI 人工验证。本报告不将内部试点结果表述为公开正式发布。
