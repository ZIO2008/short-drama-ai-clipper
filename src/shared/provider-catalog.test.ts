import { describe, expect, it } from 'vitest'
import { MODEL_STUDIO_CONFIGURED_MODEL_LABEL, MODEL_STUDIO_PROVIDER, catalogEntriesFor, isModelStudioProvider, isProviderModelGuidanceValue } from './provider-catalog.js'

describe('provider catalog', () => {
  it('offers DeepSeek only as a text-analysis preset', () => {
    const deepSeek = catalogEntriesFor('text-analysis').find((entry) => entry.id === 'deepseek-api')

    expect(deepSeek).toMatchObject({
      name: 'DeepSeek API',
      region: 'cn',
      endpoint: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      requiresSecret: true
    })
    expect(catalogEntriesFor('asr')).not.toContainEqual(expect.objectContaining({ id: 'deepseek-api' }))
    expect(catalogEntriesFor('multimodal-review')).not.toContainEqual(expect.objectContaining({ id: 'deepseek-api' }))
  })

  it('offers the Alibaba Cloud and Tencent Cloud presets only for ASR', () => {
    expect(catalogEntriesFor('asr')).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'model-studio-asr', name: '阿里云百炼 / Model Studio', region: 'cn', model: null }),
      expect.objectContaining({ id: 'tencent-cloud-asr', name: '腾讯云 ASR', region: 'cn', model: '16k_zh', difficulty: 'advanced-api' })
    ]))
    expect(catalogEntriesFor('text-analysis')).not.toContainEqual(expect.objectContaining({ id: 'model-studio-asr' }))
    expect(catalogEntriesFor('multimodal-review')).not.toContainEqual(expect.objectContaining({ id: 'tencent-cloud-asr' }))
  })

  it('describes Tencent Cloud ASR configuration checks without promising media recognition execution', () => {
    const tencentAsr = catalogEntriesFor('asr').find((entry) => entry.id === 'tencent-cloud-asr')

    expect(tencentAsr?.costNotice).toContain('最小签名连通性检测')
    expect(tencentAsr?.costNotice).toContain('不上传音视频')
    expect(tencentAsr?.bestFor).toContain('最小签名连通性检测')
    expect(tencentAsr?.notFor).toContain('创建腾讯云 ASR 字幕识别任务')
    expect(tencentAsr?.costNotice).not.toContain('尚未启用签名调用或测试')
  })

  it('classifies catalog guidance text as an unsavable model value', () => {
    expect(isProviderModelGuidanceValue('请按开通模型填写')).toBe(true)
    expect(isProviderModelGuidanceValue('请按所选能力填写模型')).toBe(true)
    expect(isProviderModelGuidanceValue('qwen-vl-plus')).toBe(false)
    expect(isProviderModelGuidanceValue(MODEL_STUDIO_CONFIGURED_MODEL_LABEL)).toBe(true)
  })

  it('keeps Model Studio ASR model selection out of the shared Renderer catalog', () => {
    const asr = catalogEntriesFor('asr').find((entry) => entry.id === 'model-studio-asr')
    expect(asr?.model).toBeNull()
  })

  it('treats zero-width and whitespace variants as the canonical Model Studio directory identity', () => {
    expect(isModelStudioProvider(`${MODEL_STUDIO_PROVIDER}\u200B`)).toBe(true)
    expect(isModelStudioProvider(`${MODEL_STUDIO_PROVIDER}\u200E\u200F\u2061\u180E`)).toBe(true)
    expect(isModelStudioProvider(' 阿里云百炼 /  Model Studio ')).toBe(true)
    expect(isModelStudioProvider('阿里云百炼 / Ｍｏｄｅｌ　Ｓｔｕｄｉｏ')).toBe(true)
    expect(isModelStudioProvider('Model Studio compatible')).toBe(false)
  })
})
