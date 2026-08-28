import { describe, expect, it } from 'vitest'
import { isModelStudioAutomaticModel, selectModelStudioModel } from './model-studio-model-policy.js'

describe('Model Studio main-process model policy', () => {
  it('chooses only the documented ASR model from the discovered account directory', () => {
    expect(selectModelStudioModel('asr', ['unrelated-asr', 'paraformer-v2'])).toBe('paraformer-v2')
    expect(selectModelStudioModel('asr', ['unrelated-asr'])).toBeNull()
  })

  it('uses the explicit vision priority for text analysis and multimodal review', () => {
    expect(selectModelStudioModel('text-analysis', ['qwen3.6-plus', 'qwen3.7-flash'])).toBe('qwen3.7-flash')
    expect(selectModelStudioModel('multimodal-review', ['qwen3.7-plus', 'qwen3.7-flash'])).toBe('qwen3.7-flash')
    expect(selectModelStudioModel('multimodal-review', ['text-model'])).toBeNull()
  })

  it('does not treat an arbitrary historical model ID as an automatic selection', () => {
    expect(isModelStudioAutomaticModel('qwen3.7-flash')).toBe(true)
    expect(isModelStudioAutomaticModel('manual-model')).toBe(false)
  })
})
