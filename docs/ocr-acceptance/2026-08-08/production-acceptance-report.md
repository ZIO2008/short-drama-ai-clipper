# 本地 OCR 生产验收报告

日期：2026-08-08

## 结论

本地 Paddle OCR 可以进入生产试用。验收范围只覆盖画面字幕识别及其打包分发链路；没有改写 ASR、导入字幕、正式 OCR 轨、字幕页面或静态原型。

## 已验证的功能

- 10 集隔离压力样本：02、03、06、10、13、24、29、34、77、82 全部成功，均低于 180 秒。cue 数依次为 53、78、42、9、22、80、68、63、75、65。
- 三源只读分析已输出到 `three-source-analysis.json`。腾讯云 ASR、剪映导入字幕仅用于辅助分析，没有参与 OCR 时间码校正。
- 01、43、85 的正式 OCR 轨保持不变；10 集压力样本没有写入正式数据库。
- 人工边界抽查已覆盖 02、03、06、29、77、82；字幕出现和消失边界总体与画面一致。

## Windows 路径与模型分发

发现并修复了 Paddle Inference 在 Windows Unicode 模型缓存路径下读取模型图失败的问题。安装包中的模型可位于任意路径；运行时会先选择一个实际可写的 ASCII 缓存目录，再复制检测与识别模型。

- 显式 ASCII `PADDLE_PDX_CACHE_HOME` 优先。
- 用户默认缓存目录可用且为 ASCII 时使用它。
- 否则回退到 `C:\Users\Public\Documents\ShortDramaAI\paddlex`。
- 目标缓存的模型核心文件缺失或大小不一致时会重新复制。

## 最终安装包验收

安装包：`release/ocr-acceptance-pack-20260808-final/win-unpacked`

- 已确认包内包含 Python、runner、FFmpeg/FFprobe、SQLite native binding、PP-OCRv5 检测模型和识别模型。
- 用包内 Python 和 runner、全新缓存 `C:\ocr-acceptance-pack-final-cache` 实跑第 10 集：成功，9 条 cue，49.172 秒，低于 180 秒。
- OCR 服务失败分支已有自动测试：保留现有 OCR 轨、不创建半成品轨，并把 runner 的真实错误返回给调用方。

## 自动验证

- Python OCR 专项：25/25 通过。
- TypeScript：通过。
- `git diff --check`：通过。
- 最终独立代码复审：通过，无生产阻塞项。
- 完整 Vitest：425/429 通过；4 个已存在的无关 UI 失败仍保留，分别是 `StaticPrototypeSurface.component.test.tsx` 1 个、`SubtitleAssetRuntimeBridge.test.ts` 3 个。

## 残余风险

- 首次运行会复制约 173 MB 的模型到本机可写缓存，首次启动识别比后续运行慢。
- 当前完整回归中有 4 个既有 UI 测试失败，未在本轮处理，且与 OCR 执行或打包链路无关。
- 该结论是本地生产试用准入，不替代后续不同 Windows 用户名、权限策略和硬件配置上的发布前抽样验证。
- 运行时用文件存在与大小判断缓存是否需要重拷；同大小的极低概率文件损坏不会自动被发现。
