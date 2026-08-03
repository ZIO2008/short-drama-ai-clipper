import { describe, expect, it } from 'vitest'
import { runControlledCapability } from './controlled-provider.js'

describe('controlled provider', () => {
  it('returns explicit non-network success and low-confidence results', () => {
    expect(runControlledCapability('tts', 'success')).toMatchObject({ confidence: 0.92, estimatedCost: 0 })
    expect(runControlledCapability('text-analysis', 'low-confidence')).toMatchObject({ confidence: 0.35, message: expect.stringContaining('置信度不足') })
  })

  it.each(['timeout', 'cost-limit', 'failure'] as const)('fails %s without falling through to a provider', (mode) => {
    expect(() => runControlledCapability('asr', mode)).toThrow('未发送网络请求')
  })
})
