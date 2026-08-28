# 字幕交换与识别路线调研（2026-07-29）

## 决策

- 以本地或用户已完成的整剧转写为优先来源，统一导入、校对、导出为 UTF-8 SRT/VTT；平台不依赖云端 ASR 才能工作。
- 剪映（CapCut）优先作为人工完成整剧转写后的导入/导出工具：官方帮助明确 Desktop/Web 支持导入外部字幕，主要格式为 SRT/TXT，并提示 SRT 使用 UTF-8。
- 达芬奇 Resolve 作为替代：官方资料说明其转写链路可标准 SRT 导入/导出，适合作为同一交换格式的备选。
- 不接入、也不改写 CapCut 草稿 JSON：GitHub 上的非官方项目虽能操作草稿文件，但不是公开稳定 API，存在格式漂移、兼容和数据损坏风险。

## 产品落地边界

1. 本应用导出的 SRT 是通用交换文件，不自动操控剪映或达芬奇，不要求登录，也不读取用户的草稿目录。
2. OCR 只读取用户明确配置的固定字幕区域；OCR 与 ASR 的差异保留为待人工决议记录，不能自动覆盖任一来源。
3. 每次识别或外部导入可记录样本字符数、差异字符数、冲突数、预计/实际费用和说明；未填数据不宣称准确率或零费用。
4. 后续若发现厂商公开、稳定且允许自动化的 API，再单独评估，不把 GitHub 逆向脚本当成产品依赖。
5. 本地固定区域 OCR 适配 Tesseract 命令行：平台通过 FFmpeg 在 ASR 时间锚点截取用户定义区域，再调用本机 Tesseract；未检测到引擎时只提示配置 `SHORTDRAMA_TESSERACT_PATH`，绝不自动切换到收费云 API。

## 证据链接

- CapCut 官方帮助：<https://www.capcut.com/help/how-to-import-subtitles>
- Blackmagic Design DaVinci Resolve 新功能资料（转写/SRT 交换）：<https://documents.blackmagicdesign.com/ae/SupportNotes/DaVinci_Resolve_19_New_Features_Guide.pdf>
- Blackmagic Design DaVinci Resolve 自动化与脚本能力说明：<https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20.2_New_Features_Guide.pdf>
- Tesseract 官方命令行文档：<https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html>
