# Version 48 最终源固定视口参考图

生成时间：2026-08-01。

这些 PNG 是在当时的原型快照（SHA-256 `39406369494666B6B6104AC752FD4F4D1EBC3768C363EDE7BE9DD85A283EAB9C`）中，以本机 Chromium 和 `deviceScaleFactor=1` 渲染的历史参考图。当前权威 HTML 已由 `docs/design-contract-v48.json` 固定为 SHA-256 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`；本目录不能作为当前合同的哈希或视觉验收证据。每个视口均通过源内已有交互进入，不改写 Open Design 项目、HTML 或生产应用。

| 视口 | 页面 | 文件 |
| --- | --- | --- |
| 1440×900 | 剧目库 | `1440x900/library.png` |
| 1440×900 | 任务中心 | `1440x900/tasks.png` |
| 1440×900 | 原剧切片工作区 | `1440x900/clip.png` |
| 1440×900 | 字幕资产 | `1440x900/subtitles.png` |
| 1280×720 | 剧目库 | `1280x720/library.png` |
| 1280×720 | 任务中心 | `1280x720/tasks.png` |
| 1280×720 | 原剧切片工作区 | `1280x720/clip.png` |
| 1280×720 | 字幕资产 | `1280x720/subtitles.png` |

## 证据边界

这是一组“最终源渲染参考图”，用于人工复核最终 HTML 的固定视口结构；它**不是** Open Design 独立预览窗口截图，也不是当前 Electron 截图，不能写入 `open-design-project-library-preview`，不能降低 `audit:fidelity` 的零阈值，也不能关闭其 92 项缺口。

Open Design 的“新标签页”独立预览路径已经确认正确，但 2026-08-01 在 Codex 重启后，Computer Use 仍无法绑定该窗口：重新枚举并按唯一窗口重试后均返回 `window id 2099202 no longer belongs to D:\\Tool\\open design\\Open Design.exe; current owner is D:\\Tool\\open design\\Open Design.exe`。该桥接错误与源渲染分开记录，未以本目录图片伪装解决。
