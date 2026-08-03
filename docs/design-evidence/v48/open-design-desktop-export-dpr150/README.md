# Open Design 桌面导出证据（DPR 150%）

> **历史快照证据。** 本目录记录采集当时的原型哈希，不是当前 Version 48 设计合同。当前权威 HTML 的 SHA-256 为 `D86D634D67B7DE5F62D5EEAD2737CCC2C4A60401CF7F34F7521BA581CBB6C92B`，以 `docs/design-contract-v48.json` 为准。

## 来源与用途

- 快照源文件：`design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html`
- 采集时 SHA-256：`39406369494666B6B6104AC752FD4F4D1EBC3768C363EDE7BE9DD85A283EAB9C`
- Open Design 桌面运行时：`0.16.1`
- 导出路径：已运行的 Open Design desktop IPC `export-artifact`，而不是浏览器截图或 Electron 候选应用截图。

## 采集方法

每张图由 Open Design 的隐藏 `BrowserWindow` 按逻辑视口渲染源 HTML。导出副本仅将相应 `.screen` 设置为 `active`，复现原型既有 `showScreen(name)` 的页面选择结果；不会改写源 HTML、Open Design 项目文件或业务数据。

Windows 当前桌面缩放为 150%，因此保留导出器给出的原始像素文件：

- `1440x900/`：逻辑视口 1440×900，对应 PNG 2160×1350。
- `1280x720/`：逻辑视口 1280×720，对应 PNG 1920×1080。

每个目录包含 `library`、`tasks`、`clip`、`subtitles` 四个页面状态。

## 验收边界

这些图证明历史快照的 Open Design 桌面导出通道、四个页面状态与双逻辑视口均可复现。由于现有 `audit:fidelity` 基线要求 1× 的 1440×900/1280×720 原始像素，而本机导出器受 Windows 150% DPI 影响，本目录不得替代当前设计合同或该审计基线，也不能把 `audit:fidelity` 的未完成项计为通过。
