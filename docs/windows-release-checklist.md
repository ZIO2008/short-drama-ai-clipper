# Windows P0 发布检查清单

> 治理更新（2026-07-26）：以下 P0 结果均为历史证据，不代表当前候选包。当前版本、包级验证与候选目录规则见 `docs/version-governance.md`；不得再把 `release-v*` 当默认启动或 E2E 包。

## 当前内部试点候选门禁（2026-07-23）

- [x] P0 发布包保留 P1/P2 的“开发中，暂不可用”路线图卡片，但不包含可到达的路由、preload IPC、主进程 IPC 或任务执行入口；历史 P1/P2 本地任务不得在任务中心继续运行或显示。`pnpm build` 后对 P1/P2 可执行入口检索为零结果。
- [x] 使用 `E:\剪辑盘\20260623_短剧切片投流\《嗨,被纯情少爷盯上了》\标准版` 完成真实 1–30 集验收。第 1 集固定使用 `01（戏前）.mp4`，SHA-256 为 `F8F95C1E9419EEA1E00F807B9578C9940667258CD1EA243D7143F0BF76000893`；`01（戏后）.mp4` 未导入。
- [x] 真实路径覆盖：导入→资产健康→滑窗预检→确认→FFmpeg 导出→退出/重启→恢复；另完成原剧切片的候选、人工调整、确认导出。详情见 `docs/p0-internal-trial-report.md`。
- [x] 结果清单记录集数范围、时长、帧率、实际大小、绝对路径和状态；多集输出 188,244,644 bytes，原剧切片输出 16,884,049 bytes，均 ≤200 MB。
- [x] 当次运行 `pnpm typecheck`、`pnpm test`（46 files / 139 tests；P1/P2 实验性测试已从 P0 默认测试图排除）、`pnpm build`、`pnpm test:e2e`（2 passed / 2 skipped）、独立 `release-v1.6` 目录包和该目录包 150% DPI 烟测均通过。
- [x] 独立 code-reviewer Stage 1/2 对当前工作树重新通过，无 HIGH/MEDIUM 问题；主进程入口已拆为 285 行，生产 IPC 与窗口创建职责独立。
- [ ] **明确暂缓（公开发布前唯一外部缺口）**：另一台干净 Windows 10/11 机器首次启动，以及真实系统 100%/125% DPI 人工验证。本清单完成时只能标注“可内部真实生产试点”，不得标注公开正式发布。

本节覆盖后续候选物；下方日期早于 2026-07-22 的记录仅为历史证据，不能替代本轮真实素材验收和复审。

## 自动化门禁

- `pnpm typecheck`：通过（Node 与 renderer strict tsc）。
- `pnpm test`：通过（42 个测试文件 / 118 条测试；测试使用内存库或隔离临时目录）。
- `pnpm build`：通过（Electron main、preload、renderer 均生成）。
- `pnpm rebuild:electron`：通过（better-sqlite3 Electron ABI 重建）。
- `pnpm test:e2e`：通过（最新构建，2 个 Playwright Electron 测试；FLOW-001–004 主流程 + 当前真实 Windows DPI 打包测试）。
- `pnpm pack:dir`：通过；产物为 `release/win-unpacked/短剧投流素材生成平台.exe`。
- 持久化 VM 验证通道：运行 `powershell -ExecutionPolicy Bypass -File tools/windows-release-smoke.ps1`，将目录包复制到 `D:\个人工作\vm-share\releases\<releaseId>`，并在 `D:\个人工作\vm-share\evidence\<releaseId>.json` 写入 SHA-256 与包内 FFmpeg 资源清单；VirtualBox 共享盘映射为来宾机 `Z:`。

## 交付边界

- 新应用 ID：`local.shortdrama.materialstudio`。
- 用户数据：`AppData/ShortDramaMaterialStudio/<channel>`，与旧工具隔离。
- 原型源 `D:\个人工作\Web-Prototype` 保持只读；生产 UI 通过 `docs/prototype-reuse-matrix.md` 映射。
- 备份只包含 SQLite 元数据，不包含原片、音频、字幕、剧本或导出视频。

## 独立审查

- 2026-07-19 新鲜 code-reviewer：Stage 1 PASS（无 HIGH），Stage 2 PASS。
- 审查覆盖 Product Spec P0 REQ-001–013、AC-001–032、FLOW-001–004、Electron 安全边界、备份/日志隐私和当前原型差异记录。

## 首次启动与缩放

- [x] 在隔离 Windows 11 VM 启动目录包：从共享目录复制到来宾本地 NTFS，以独立 userData 启动；来宾机不依赖项目源码、Node、pnpm 或旧工具。证据为 `D:\个人工作\vm-share\evidence\20260721-114829.json` 与同目录原生截图。
- [x] 在当前 Windows 隔离临时 userData 启动目录包，进程保持运行并创建可打开的 `data/material-studio.sqlite`（主文件与 WAL 均已生成）。
- [x] 2026-07-20 最新目录包在 `D:\个人工作\smoke-evidence-20260720-121440` 隔离 userData 启动；进程保持运行、SQLite 主文件 4,096 bytes 且 WAL 226,632 bytes，`PATH=C:\Windows\System32` 下包内 ffmpeg/ffprobe 文件存在。
- [x] 在当前 Windows 隔离临时 userData 且将 `PATH` 限制为 `C:\Windows\System32`、移除外部 FFmpeg 环境变量的条件下启动目录包；进程保持运行并创建 SQLite 主文件与 WAL，证明运行时使用包内 `resources/models`。
- [x] 1280×720、1366×768、1440×900、1920×1080 检查无应用级横向滚动（Playwright Electron E2E）。
- [x] 通过目录包 `--force-device-scale-factor=1`、`1.25`、`1.5` 各启动 8 秒的隔离烟测；三种比例均进程存活并创建可打开的 SQLite。该证据是 Chromium 缩放模拟，不替代真实 Windows 系统 DPI 人工检查。
- [x] 当前 Windows 会话的真实系统 DPI 目录包测试：`pnpm exec playwright test tests/e2e/packaged-real-dpi.spec.ts --reporter=line` 通过；`devicePixelRatio=1.5`、`scrollWidth=1426`、`innerWidth=1426`，剧目库可见且无横向截断。该证据覆盖当前真实 150% 会话。
- [x] 2026-07-21 来宾 Windows 真实 125% 系统缩放：在“系统 > 屏幕”可见 125%（推荐），目录包 `20260721-114829` 通过本地 NTFS 诊断启动器进入剧目库；页面筛选、卡片/列表切换和“创建剧目”按钮可见且未截断。`vm-125-percent-app.png` 为原生 VM 截图，`exit-code.txt` 为 `ExitCode=0`，本地包路径为 `C:\Users\25288\AppData\Local\ShortDramaMaterialStudio\vm-releases\20260721-114829`。
- [x] 2026-07-21 来宾 Windows 真实 100% 系统缩放：用户切换到 100% 后，目录包 `20260721-114829` 通过本地 NTFS 诊断启动器进入剧目库；导航、搜索/筛选、卡片/列表切换、空态和“创建剧目”按钮可见且未截断。`vm-100-percent-app.png` 为原生 VM 截图；`copy.log`、`stdout.log` 和 `electron.log` 均为空，未生成复制失败 marker。
- [x] 键盘焦点、剧目工作区、预检确认和任务中心核心路径已在 E2E/渲染测试覆盖；`prefers-reduced-motion` 由 CSS 媒体门禁覆盖。通知抽屉键盘语义已有组件交互测试。

## 2026-07-20 复验记录

- `pnpm run typecheck`：通过。
- `pnpm test -- --reporter=dot`：通过，42 个测试文件 / 118 条测试；新增运行时 FFmpeg clean-PATH 原剧切片、任务崩溃恢复归一化、集号待修正、字幕归属/扩展、短 WebVTT、批量磁盘累计和远程媒体 URL 拒绝覆盖。
- `pnpm run build`：通过；main 130.23 kB、preload 5.37 kB、renderer 671.56 kB。
- `pnpm run test:e2e -- --reporter=line`：通过，2 tests passed；`PACKAGED_REAL_DPI` 为 `devicePixelRatio=1.5`、`scrollWidth=1426`、`innerWidth=1426`，FLOW-001–004 通过。
- `pnpm run pack:dir`：通过；目录包为 `release/win-unpacked/短剧投流素材生成平台.exe`，包内 `resources/models/ffmpeg.exe` 与 `ffprobe.exe` 均存在。
- 最新独立 code-reviewer：Stage 1 PASS、Stage 2 PASS；本轮改动后的复审须以当前工作树和上述 118 条测试结果为准。
- 仍未完成：另一台真实 Windows 10/11 clean machine 首次启动、真实系统 100%/125% DPI 人工检查；当前真实系统仅有 150% 证据，Chromium scale-factor 模拟不能替代缺失档位。

## 隐私与故障

- [x] 数据库损坏时能恢复最近有效备份，并在顶栏显示恢复时间点（备份/恢复隔离测试）。
- [x] 日志、任务快照、报告和诊断包检索不到明文密钥、API 请求正文、视频/音频/字幕/剧本文本（隐私集成测试与递归脱敏测试）。
- [x] 源文件失联、输出目录无权限、磁盘不足、格式不支持和 FFmpeg 缺失均有领域错误/通知路径测试；Windows 包含 `resources/models/ffmpeg.exe` 与 `ffprobe.exe`。

## 2026-07-21 复验记录

- `pnpm run typecheck`：通过。
- `pnpm test -- --reporter=dot`：通过，42 个测试文件 / 118 条测试。
- `pnpm run build`：通过；main 130.53 kB、preload 5.37 kB、renderer 671.56 kB。
- `pnpm run test:e2e -- --reporter=line`：通过，2 tests passed；真实系统 `devicePixelRatio=1.5`、`scrollWidth=1426`、`innerWidth=1426`。
- `pnpm run pack:dir`：通过；目录包 EXE、包内 `ffmpeg.exe`、`ffprobe.exe` 均生成。
- 最新目录包证据：`releaseId=20260721-114829`，EXE SHA-256 `33106B906038F87E76BC55DB580362B6D5D29197F7F3C0A3CB170E3B667081CC`，FFmpeg SHA-256 `04E1307997530F9CF2FE35CBA2CA7E8875CA91DA02F89D6C7243DF819C94AD00`，FFprobe SHA-256 `4303EC85855340689B1F8AA5D9C1DC06EF3E3090682DE3034EDC3FCA2B0798D5`；清单位于 `D:\个人工作\vm-share\evidence\20260721-114829.json`。
- VirtualBox `Windows11-Clean-Test-Retry`：`running`、8 GB RAM、2 CPU、`VMSVGA`、3D 加速关闭、Guest Additions `7.2.12`、共享目录 `codexshare` 映射来宾机 `Z:`。用户已确认目录包在来宾桌面启动成功，当前截图可见剧目库页面；此前的 GPU fatal、renderer launch-failed、ACPI reset 均未在本次 VMSVGA 运行中复现。
- `tools/windows-release-smoke.ps1` 的诊断启动器现在会在复制前清理 `copy.log`、退出码、stdout/electron 日志和本地包 marker，避免沿用旧的 `CopyExitCode=16` 造成误判；启动时清除同名环境变量并启用 delayed expansion，以 `!ERRORLEVEL!` 记录 robocopy 和应用进程的真实退出码。包仍先复制到来宾 `%LOCALAPPDATA%` 的 NTFS 再启动，manifest 说明仅列出实际生成的日志和 marker。
- 2026-07-21 独立 code-reviewer 复审：Stage 1 PASS（无 HIGH），Stage 2 PASS；覆盖 GPU 启动修复、共享盘→本地 NTFS 诊断启动器、Electron 安全边界和 P0 流程。修复后再次审查，无新增 HIGH/MEDIUM。
- 进一步实测：VirtualBox 能稳定提供来宾画面与 Guest Additions 显示提示，但当前嵌套窗口不接收自动化鼠标/键盘输入；Guest Control 需要独立 Windows 密码而 PIN 不能作为该凭据使用。因此没有伪造系统缩放结果，也没有改动来宾系统设置。

## 最终 Windows 验收结论

- [x] 真实 Windows 系统缩放已覆盖 100%（`vm-100-percent-app.png`）、125%（`vm-125-percent-app.png`）和 150%（打包 E2E `devicePixelRatio=1.5`）。
- [x] 隔离 Windows 11 VM 中通过共享目录交付目录包、复制至来宾本地 NTFS、使用独立 userData 启动；不依赖来宾机中的项目源码、Node、pnpm 或旧工具。
- [x] `20260721-114829` 是当前最终目录包证据；复制、应用退出、renderer/GPU 日志的 marker 语义已经过独立审查和 cmd 真实验证。
