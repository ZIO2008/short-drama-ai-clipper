# 旧媒体能力评估

评估对象：`D:\个人工作\短剧AI切片工具\02_开发源码\short-drama-ai-clipper`。评估时间：2026-07-18。原项目保持只读；下表只记录能力边界，不复制旧 UI、状态模型或运行时。

## 结论

旧工具的桌面层启动 Python `review_server.py`，通过固定的本地 Web v8 页面工作；候选核心模块多数直接依赖缺失的 `config.py`，`audio_scorer.py` 和 `visual_scorer.py` 不直接导入 `config.py`，但依赖 NumPy、pydub、OpenCV 等 Python 第三方库，而当前干净源码目录没有 `config.py`。因此旧模块不能直接进入新平台生产运行时。新平台只重构可验证的本地媒体基础能力，并在主进程通过受控服务调用。

## 逐项决策

| 旧模块 | 证据 | 决策 | 新平台边界 |
|---|---|---|---|
| `desktop/main.js` | 启动 Python 服务、随机端口、加载 `/v8/`，旧 appId 与 userData 规则独立 | 删除运行时复用 | 新 Electron 主进程直接管理 SQLite、媒体子进程和 IPC；不启动旧 Web 服务。 |
| `desktop/preload.js` | 只暴露 `chooseOutputDir`，服务于旧页面 | 删除运行时复用 | 新 preload 仅暴露已校验的领域 API。 |
| `app_control.py` | 状态/启动/停止/诊断均围绕旧端口和 `review_state.json`；诊断会复制旧项目文件 | 重新开发 | 只借鉴“状态、版本、端口、日志”诊断维度；新诊断不读取旧目录或复制视频/密钥。 |
| `review_server.py` 内嵌 `ffprobe_video_codec` / `ffprobe_duration`（约 6145–6270）与 `media_features_for_clip`（约 6680+ 行） | 服务文件内直接拼接旧项目路径并返回 Web 状态；不是独立适配器 | 重新开发 | 只迁移“探测时长/编码/磁盘”能力到 `media-probe.ts`，通过参数数组和结构化错误返回。 |
| `review_server.py` 内嵌 `run_start_clipping_job` / `export_clip_video`（约 7216–7505、8960–9001 行） | 旧 HTTP 状态、Python 配置和导出目录耦合 | 删除直接复用 | 新 `ffmpeg-runner.ts` 只承担可取消子进程；裁切、字幕和包装在后续 P0 任务按新任务模型实现。 |
| `review_server.py` + `web/v8` 其余单体服务/UI | 458 KB 服务和静态页面，旧 UI、项目状态、导出路径耦合 | 删除 | 不迁移旧 UI、路由、全局状态或 HTTP 服务。 |
| `core/exporter.py` | 调用 FFmpeg 裁切、字幕烧录、水印和缩略图；绑定 `config`、旧目录和 Python PIL | 重构后复用思路 | Phase 3 只落地可取消 FFmpeg runner；裁切/包装在后续任务按 Spec 重新建模。 |
| `core/scene_detector.py` | PySceneDetect + OpenCV 场景切换，直接依赖旧 `config` | 后续重构 | Phase 3 不引入 Python/AI 依赖；候选生成阶段再评估纯本地实现或独立适配器。 |
| `core/transcriber.py` | Whisper 模型下载/缓存和转录，依赖 Python 模型与旧配置 | 不进入 P0 Phase 3 | P0 字幕准备在后续阶段接入；P1 AI 分析明确不实现。 |
| `core/clip_analyzer.py` | 字幕、音频、视觉打分和候选池，依赖 `config`、OpenCV、NumPy、pydub | 重构后复用算法意图 | 不复制旧候选状态；后续按当前剧集/任务数据模型重写。 |
| `core/audio_scorer.py` / `visual_scorer.py` | 逐场景波形/帧差评分，依赖 NumPy、pydub、OpenCV | 后续重构 | 仅保留为候选评分参考；不作为 Phase 3 运行时依赖。 |
| `core/clip_auditor.py` | 临时音频、关键帧、可选 OpenAI 请求和 JSON 审核，含 API key 读取 | 删除直接复用 | P1 AI 审核不实现；本地边界校验若需要将另建无密钥服务。 |
| `requirements.txt` / 缺失的 `config.py` | 运行时依赖 Python AI/媒体包；候选核心模块多数直接 import `config.py`，但 `audio_scorer.py`、`visual_scorer.py` 不直接 import；干净旧目录无法独立启动 | 不迁移 | 新平台依赖锁定在 TypeScript/Electron；外部 FFmpeg 通过运行时诊断发现。 |
| 多集滑动窗口组合 | 旧核心模块没有按连续集号生成窗口的实现或验收数据 | 重新开发 | 按 REQ-006 在 Phase 7 以新剧集/任务数据实现；Phase 3 不假设旧工具具备该能力。 |

## 可迁移的稳定原则

- FFmpeg/ffprobe 必须使用参数数组调用，禁止拼接 shell 字符串；记录退出码、阶段、耗时和可行动错误。
- 媒体路径只作为输入引用，探测失败要区分不存在、无权限、格式不支持和工具缺失。
- 长任务必须可取消，取消后等待子进程退出并清理临时文件，不阻塞渲染进程。
- 临时文件进入隔离的应用数据临时目录；不写旧项目目录，不复制原片。
- 任何 AI/供应商请求不进入 Phase 3 媒体服务，不把密钥放入命令行、日志或任务快照。

## 需求追踪与证据索引

- `core/exporter.py:42-69,103-125` 与 `review_server.py:8960-9001` 对应 REQ-005 / AC-011 的“切片导出”能力，但旧实现绑定 Python 配置、字幕烧录和旧成果目录；因此只迁移参数化、可取消 FFmpeg 进程原则，实际成果追溯留到后续 P0 Phase 6/7。
- `core/transcriber.py:1-44` 与 `review_server.py:8566+` 只有 Whisper ASR/字幕准备能力，不能证明 REQ-003 的 TXT/DOCX/PDF 剧本导入或 AC-008、AC-009；剧本导入在新平台重新开发，P1 AI 分析不进入本阶段。
- `core/scene_detector.py:1-57`、`core/clip_analyzer.py:1-80` 对应 REQ-005 候选生成；它们依赖 PySceneDetect/OpenCV/缺失 `config.py`，后续按新任务模型重写。
- 旧模块没有 REQ-006 / AC-012、AC-013 的连续集号滑动窗口实现；新平台 Phase 7 重新开发，不把旧代码当作证据。
- 审计命令：`$old='D:\个人工作\短剧AI切片工具\02_开发源码\short-drama-ai-clipper'; Get-ChildItem -LiteralPath $old -Recurse -File` 核对候选模块；`Select-String -Path (Join-Path $old 'review_server.py'),(Join-Path $old 'core\*.py') -Pattern 'ffprobe_video_codec|ffprobe_duration|media_features_for_clip|run_start_clipping_job|export_clip_video|transcribe'` 核对内嵌媒体能力；新平台以 `pnpm typecheck`、`pnpm test`、`pnpm build` 和隔离临时媒体测试为验收入口。
- FFmpeg 测试二进制来自 [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)（GPL-3.0-or-later，版本 5.3.0）；ffprobe 测试二进制来自 [`ffprobe-static`](https://github.com/joshwnj/ffprobe-static)（MIT，版本 3.1.0）。生产运行时不把测试二进制写入用户项目目录，优先使用受控 runtime/models 路径或用户显式配置。发布前锁定依赖版本并复核上游安全公告，按月检查 FFmpeg/ffprobe 版本与许可证变更，升级后重新跑完整媒体矩阵和 Windows 打包冒烟测试。

## 验收证据边界

本评估只证明旧模块的迁移取舍，不证明旧工具本身可在新平台运行。Phase 3 验收矩阵如下：

| 场景 | 输入 | 期望证据 |
|---|---|---|
| 可读视频 | 隔离临时目录中的真实短 MP4 + 可用 ffprobe | 返回 `durationSeconds`、`fps`、视频/音频 codec，`readable=true`。 |
| 失联/无权限 | 不存在路径、拒绝读取路径 | 分别返回 `NOT_FOUND`、`NOT_READABLE`，含可行动文案。 |
| 不支持格式/工具缺失 | 无视频流 JSON、不可执行 ffprobe | 返回 `UNSUPPORTED_FORMAT` 或 `FFMPEG_UNAVAILABLE`，不抛未处理异常。 |
| 取消长命令 | 隔离 Node/FFmpeg 长进程 + `AbortController` | 返回 `CANCELLED`，子进程退出，测试进程继续响应。 |
| 运行时诊断 | 隔离数据目录、FFmpeg/ffprobe 路径 | 输出工具版本、可写状态和磁盘剩余空间，不包含密钥/视频内容。 |

这些场景由 `media-probe.test.ts`、`ffmpeg-runner.test.ts` 和后续 runtime-check 测试逐项覆盖；没有证据的旧模块不得被 import 到新平台。
