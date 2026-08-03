# 供应商目录：事实来源与核验边界

核验日期：2026-07-26。以下链接均通过官方站点可达性检查；目录只引用页面明确提供的能力或计费入口，不把营销描述当成质量保证。

| 方案 | 官方资料 | 目录结论 |
|---|---|---|
| whisper.cpp | https://github.com/ggml-org/whisper.cpp | 上游项目页面声明 MIT 许可；归类为“本机运行”，不承诺免费硬件、模型下载或部署成本。 |
| Ollama | https://docs.ollama.com/ | 官方文档可达；归类为“本机运行”，模型许可、质量和硬件要求由用户在所选模型页面核验。 |
| Google Gemini API | https://ai.google.dev/gemini-api/docs/pricing | 官方定价页区分免费层与付费层；目录不写死额度，提示用户在开通时核验模型、地域和配额。 |
| OpenAI API | https://developers.openai.com/api/docs/pricing | 官方定价页可达；目录归类为按量付费，不宣称有免费 API 额度。 |
| 阿里云百炼 / Model Studio | https://www.alibabacloud.com/help/en/model-studio/pricing | 官方定价页可达；目录归类为“试用/额度待确认”，不向用户承诺任何具体额度。 |

质量标签的含义：`本机可控` 指数据路径可由用户保持本机，但不等于效果最佳；`云端高能力候选` 指官方提供对应 API/模型入口，不等于本应用已接入或已验证效果。目录必须持续显示此边界。
