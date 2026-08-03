# 字幕交换调研（2026-07-29）

## 结论

P0 采用 **UTF-8 SRT/VTT 标准文件交换**，不实现剪映/CapCut 草稿读写、本地草稿 JSON 解析、登录自动化或未公开 API。

- 剪映/CapCut Desktop 存在公开的人工 SRT/TXT 导入路径；本产品输出一部剧的标准字幕文件与操作说明，操作者在剪映桌面端的“Captions / Add Captions / Import file”完成导入。
- DaVinci Resolve 是同等合法的备选：官方文档明确支持向时间线导入 SRT 格式字幕/闭合字幕文件。
- 因此不新增“已接入剪映”的自动化宣传或本地桥接脚本；产品能力应表述为“导出并指导导入标准字幕文件”。

## 公开证据

1. [CapCut：How Do I Import Subtitles?](https://www.capcut.com/help/how-to-import-subtitles)（核验日期 2026-07-29）：官方帮助页说明 Desktop/Web 支持外部字幕，Desktop 可通过 Captions → Add Captions 导入 UTF-8 的 SRT 或带时码 TXT，并将各条字幕生成为可编辑时间线文本块。
2. [DaVinci Resolve 15 New Features Guide](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_15_New_Features_Guide.pdf)（核验日期 2026-07-29）：Blackmagic 官方 PDF 的字幕章节说明可在文件对话框选择 SRT 格式字幕/闭合字幕文件导入。
3. [5jubsPRO/capcut-sub-export](https://github.com/5jubsPRO/capcut-sub-export)（核验日期 2026-07-29）：该 GitHub 项目要求复制/替换 CapCut `draft_content.json`。它证明社区“自动化”方案通常依赖草稿数据，不属于公开稳定接口；本项目明确拒绝采用。

## 生产约束

- 导出必须保持 UTF-8、序号、时间码与段落顺序；SRT 和 VTT 均可生成，剪映导入优先使用 SRT。
- 导入说明必须提示：先在剪映桌面端创建/打开项目，再由其公开菜单选择本产品导出的 `.srt`；本产品不读取、修改或上传任何剪映项目文件。
- 真实软件版本、剪映菜单文案和 DaVinci 版本差异在实际验收时记录；若公开菜单改变，只更新说明，不引入逆向或登录自动化替代。
- 不把 DaVinci 或剪映的自动转写准确率归因给本产品；本产品只记录自身 ASR/OCR/人工决议的真实样本指标。
