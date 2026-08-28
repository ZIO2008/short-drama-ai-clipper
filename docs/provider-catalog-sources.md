# 供应商目录：事实来源与核验边界

核验日期：2026-08-14。以下链接均通过官方站点可达性检查；目录只引用页面明确提供的能力或计费入口，不把营销描述当成质量保证。

| 方案 | 官方资料 | 目录结论 |
|---|---|---|
| whisper.cpp | https://github.com/ggml-org/whisper.cpp | 上游项目页面声明 MIT 许可；归类为“本机运行”，不承诺免费硬件、模型下载或部署成本。 |
| Ollama | https://docs.ollama.com/ | 官方文档可达；归类为“本机运行”，模型许可、质量和硬件要求由用户在所选模型页面核验。 |
| Google Gemini API | https://ai.google.dev/gemini-api/docs/pricing | 官方定价页区分免费层与付费层；目录不写死额度，提示用户在开通时核验模型、地域和配额。 |
| OpenAI API | https://developers.openai.com/api/docs/pricing | 官方定价页可达；目录归类为按量付费，不宣称有免费 API 额度。 |
| DeepSeek API | https://api-docs.deepseek.com/quick_start/pricing/ | 2026-08-04 核验：官方文档列出 OpenAI 兼容基址 `https://api.deepseek.com` 与 `deepseek-v4-flash`；归类为仅用于文本语义分析的国内按量付费候选，不宣称已启用真实调用。 |
| 阿里云百炼 / Model Studio | https://help.aliyun.com/zh/model-studio/vision；https://www.alibabacloud.com/help/en/model-studio/pricing | 2026-08-14 核验：官方视觉文档列出 `qwen3.7-flash`、`qwen3.6-flash`、`qwen3.7-plus`、`qwen3.6-plus` 等可用于图像/视频理解的当前模型。目录只从这份显式 allowlist 中按固定优先级自动选择，并将同一受控目录用于文本语义分析；不向用户承诺具体额度，也不要求用户填写模型 ID。 |

质量标签的含义：`本机可控` 指数据路径可由用户保持本机，但不等于效果最佳；`云端高能力候选` 指官方提供对应 API/模型入口，不等于本应用已接入或已验证效果。目录必须持续显示此边界。
