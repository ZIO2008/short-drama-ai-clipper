# Windows P0 发布检查清单

## 自动化门禁

- `pnpm typecheck`：通过（Node 与 renderer strict tsc）。
- `pnpm test`：通过（34 个测试文件 / 78 条测试；测试使用内存库或隔离临时目录）。
- `pnpm build`：通过（Electron main、preload、renderer 均生成）。
- `pnpm rebuild:electron`：通过（better-sqlite3 Electron ABI 重建）。
- `pnpm test:e2e`：通过（1 个 Playwright Electron 测试；隔离数据目录、真实 FFmpeg 媒体、FLOW-001–004、四种窗口尺寸）。
- `pnpm pack:dir`：通过后产物应为 `release/win-unpacked/短剧投流素材生成平台.exe`。

## 交付边界

- 新应用 ID：`local.shortdrama.materialstudio`。
- 用户数据：`AppData/ShortDramaMaterialStudio/<channel>`，与旧工具隔离。
- 原型源 `D:\个人工作\Web-Prototype` 保持只读；生产 UI 通过 `docs/prototype-reuse-matrix.md` 映射。
- 备份只包含 SQLite 元数据，不包含原片、音频、字幕、剧本或导出视频。

## 首次启动与缩放

- [ ] 在未安装开发工具、旧工具或旧用户数据的 Windows 10/11 x64 机器启动目录包。
- [x] 1280×720、1366×768、1440×900、1920×1080 检查无应用级横向滚动（Playwright Electron E2E）。
- [ ] 100% / 125% / 150% Windows 缩放检查按钮、表格和抽屉无截断。
- [x] 键盘焦点、剧目工作区、预检确认和任务中心核心路径已在 E2E/渲染测试覆盖；`prefers-reduced-motion` 由 CSS 媒体门禁覆盖。通知抽屉键盘语义已有组件交互测试。

## 隐私与故障

- [x] 数据库损坏时能恢复最近有效备份，并在顶栏显示恢复时间点（备份/恢复隔离测试）。
- [x] 日志、任务快照、报告和诊断包检索不到明文密钥、API 请求正文、视频/音频/字幕/剧本文本（隐私集成测试与递归脱敏测试）。
- [x] 源文件失联、输出目录无权限、磁盘不足、格式不支持和 FFmpeg 缺失均有领域错误/通知路径测试；Windows 包含 `resources/models/ffmpeg.exe` 与 `ffprobe.exe`。
