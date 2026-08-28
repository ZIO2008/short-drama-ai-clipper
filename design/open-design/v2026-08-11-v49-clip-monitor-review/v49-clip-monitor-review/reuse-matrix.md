# screen-clip 运行时复用矩阵

| 原型元素 | `data-od-id` / 选择器 | 建议运行时组件 | 输入 | 输出 / 状态 | 复用边界 |
|---|---|---|---|---|---|
| 监视器媒体区 | `clip-monitor-media` | `ClipMonitor` | 当前 `EpisodeAsset`、媒体元数据、可读状态 | `contain` 画面、读取中 / 缺媒体呈现 | 不嵌入切点或审阅控件。 |
| 播放底栏 | `clip-monitor-transport` | `ClipTransport` | `currentTime`、`duration`、循环、倍速、音量 | 源 PTS、候选相对时码、播放状态 | 只维护审阅会话，不调用候选更新。 |
| 循环 | `clip-loop` | `LoopToggle` | 当前审阅范围、`loopEnabled` | `aria-pressed` 与播放循环 | 范围来自审阅模式，不改候选。 |
| 倍速浮层 | `clip-speed`、`#clipSpeedPopover` | `PlaybackRatePopover` | `playbackRate` | 0.75× / 1× / 1.25× / 1.5× | 仅点击后挂载或显示。 |
| 音量浮层 | `clip-volume`、`#clipVolumePopover` | `VolumePopover` | 音量、静音状态 | 滑杆与静音激活态 | 仅点击后挂载或显示。 |
| 审阅范围 | `clip-review-range` | `ReviewRangeMode` | 当前候选入点、出点、源时长 | 源片 / 当前候选 / 前后审阅的播放区间 | 不调用 `updateClipCandidate`。 |
| 边界微调 | `clip-boundary-nudges` | `CandidateBoundaryNudges` | 当前 `ClipCandidate` | 四个 0.1 秒方向操作、可用性 | 唯一允许调用 `updateClipCandidate` 的新增控件。 |
| 媒体不可读 | `.clip-media-missing` | `MediaUnavailableMonitor` | `EpisodeAsset` 读取失败、最后已知画幅 | 监视器轮廓、重定位提示、禁用候选微调 | 不伪造低质量候选或旧画面。 |

## 事件契约

- `playback:update`：维护播放、循环、倍速、音量和当前时间；不持久化候选。
- `reviewRange:change`：在本地计算源片 / 当前候选 / 前后审阅的播放区间；不持久化。
- `candidate:boundaryNudge`：以候选 ID 为边界调用 `updateClipCandidate`，以 0.1 秒为增量并校验入点、出点与时长。
- `episode:change`：原子切换媒体、源分集时间线、候选时间线、检查器与当前选中行；失败时进入媒体不可读状态。
