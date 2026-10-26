import { describe, expect, it, vi } from 'vitest'
import { OpenAiCompatibleClipMultimodalReviewAdapter, OpenAiCompatibleClipSemanticAdapter } from './openai-compatible-clip-semantic-adapter.js'

const input = {
  package: { id: 'p', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'fixture', ruleVersion: 'fixture', status: 'ready' as const, reason: null },
  profile: { id: 'profile', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'fixture-model', secretRef: 'secret', timeoutMs: 1_000, pricing: null },
  proposals: [{ evidenceIds: ['11111111-1111-4111-8111-111111111111'], summary: 'fixture' }]
}
const reviewContract = { factCode: 'fact-1', reviewQuestion: '这些帧是否证明核心视觉事件成立？', claimKinds: ['core-event'] as const }

describe('OpenAiCompatibleClipSemanticAdapter', () => {
  it('retries a response-format rejection once without weakening the JSON-only contract', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'response_format unsupported' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"selections":[]}' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.select(input)).resolves.toEqual({ selections: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toMatchObject({ response_format: { type: 'json_object' } })
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).not.toHaveProperty('response_format')
  })

  it('retries an empty response-format result once without weakening the JSON-only contract', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"selections":[]}' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.select(input)).resolves.toEqual({ selections: [] })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toMatchObject({ response_format: { type: 'json_object' } })
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).not.toHaveProperty('response_format')
  })

  it('extracts only the API key from a saved credential package before sending a request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"selections":[]}' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => JSON.stringify({ version: 1, schema: 'api-key', values: { apiKey: 'package-api-key' } }) }, fetchImpl)

    await adapter.select(input)

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer package-api-key' })
    expect(String((fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization)).not.toContain('"schema"')
  })

  it('rejects a structured credential package for a different schema before making a request', async () => {
    const fetchImpl = vi.fn()
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => JSON.stringify({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'id', secretKey: 'key' } }) }, fetchImpl)

    await expect(adapter.select(input)).rejects.toThrow('API 密钥不可用')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not resend frames for an unrelated bad request', async () => {
    const evidenceId = '11111111-1111-4111-8111-111111111111'
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'unknown model' } }), { status: 400 }))
    const adapter = new OpenAiCompatibleClipMultimodalReviewAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.review({ ...reviewContract, package: input.package, profile: { ...input.profile, capability: 'multimodal-review' }, evidenceIds: [evidenceId], frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] })).rejects.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('extracts a fenced JSON object but leaves all semantic validation to the caller', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"selections":[]}\n```' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.select(input)).resolves.toEqual({ selections: [] })
  })

  it('rejects free text surrounding a JSON object instead of extracting it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '说明如下：{"selections":[]}请审阅' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.select(input)).resolves.toEqual({ invalid: 'not-json' })
  })

  it('sends the application-owned candidate cap while preserving every supplied window', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"selections":[]}' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await adapter.select({ ...input, candidateLimit: 1, proposals: [...input.proposals, { evidenceIds: ['22222222-2222-4222-8222-222222222222'], summary: 'another frozen window' }] })
    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ content: string }> }
    const prompt = JSON.parse(body.messages[0]!.content) as { candidateLimit: number; proposals: Array<{ windowId: string }>; output: { selections: Array<Record<string, unknown>> } }
    expect(prompt.candidateLimit).toBe(1)
    expect(prompt.proposals).toHaveLength(2)
    expect(prompt.proposals.map((proposal) => proposal.windowId)).toEqual(['window-1', 'window-2'])
    expect(prompt.output.selections[0]).toMatchObject({ proposalId: expect.any(String), startEvidenceId: expect.any(String), endEvidenceId: expect.any(String), evidenceIds: expect.any(Array), narrative: expect.any(Object), seamStatus: expect.any(String) })
    expect(prompt.output.selections[0]).not.toHaveProperty('narrativeEventId')
  })

  it('requires each selection to name one frozen proposal while the program derives its event map', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: '{"selections":[]}' } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipSemanticAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await adapter.select({ ...input, proposals: [{ evidenceIds: ['22222222-2222-4222-8222-222222222222'], contextBeforeIds: ['11111111-1111-4111-8111-111111111111'], contextAfterIds: ['33333333-3333-4333-8333-333333333333'], summary: 'protected context fixture' }] })
    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as { messages: Array<{ content: string }> }
    const prompt = JSON.parse(body.messages[0]!.content) as { outputContract: string[]; output: { selections: Array<{ narrative: { continuity: string }; seamStatus: string }> } }
    expect(prompt.outputContract).toEqual(expect.arrayContaining([expect.stringContaining('只输出 selections'), expect.stringContaining('不得输出 narrativeEvents、narrativeEventId、coreEvidenceIds 或 sourceEvidenceIds'), expect.stringContaining('windowId'), expect.stringContaining('无法闭合的窗口必须省略')]))
    expect(prompt.output.selections[0]).toMatchObject({ narrative: { continuity: 'continuous|limited' }, seamStatus: 'closed|expanded-closed' })
  })
})

describe('OpenAiCompatibleClipMultimodalReviewAdapter', () => {
  it('retries a response-format rejection once without weakening the JSON-only contract', async () => {
    const evidenceId = '11111111-1111-4111-8111-111111111111'
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'response_format unsupported' } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ factCode: 'fact-1', conclusion: 'supported', evidenceIds: [evidenceId], claimKinds: ['core-event'], reason: 'frame-only fixture' }) } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipMultimodalReviewAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.review({ ...reviewContract, package: input.package, profile: { ...input.profile, capability: 'multimodal-review' }, evidenceIds: [evidenceId], frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] })).resolves.toMatchObject({ conclusion: 'supported' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toMatchObject({ response_format: { type: 'json_object' } })
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).not.toHaveProperty('response_format')
  })

  it('rejects a structured credential package for a different schema before sending frames', async () => {
    const evidenceId = '11111111-1111-4111-8111-111111111111'
    const fetchImpl = vi.fn()
    const adapter = new OpenAiCompatibleClipMultimodalReviewAdapter({ readPlaintextForMainProcess: () => JSON.stringify({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'id', secretKey: 'key' } }) }, fetchImpl)

    await expect(adapter.review({ ...reviewContract, package: input.package, profile: { ...input.profile, capability: 'multimodal-review' }, evidenceIds: [evidenceId], frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] })).rejects.toThrow('API 密钥不可用')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends only the caller-owned UUID and JPEG data URLs, never package or media metadata', async () => {
    const evidenceId = '11111111-1111-4111-8111-111111111111'
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ factCode: 'fact-1', conclusion: 'supported', evidenceIds: [evidenceId], claimKinds: ['core-event'], reason: 'frame-only fixture' }) } }] }), { status: 200 }))
    const adapter = new OpenAiCompatibleClipMultimodalReviewAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.review({
      ...reviewContract,
      package: { id: 'package-id', dramaId: 'drama-with-subtitle', episodeId: 'episode-with-candidate', version: 1, sourceMediaFingerprint: 'C:\\sensitive\\source.mp4', ruleVersion: 'fixture', status: 'ready', reason: null },
      profile: { ...input.profile, capability: 'multimodal-review', provider: '阿里云百炼 / Model Studio' }, evidenceIds: [evidenceId],
      frames: [{ ptsSeconds: 1.25, dataUrl: 'data:image/jpeg;base64,ZmFrZS1qcGVn', sha256: 'fixture', byteLength: 9 }],
    })).resolves.toMatchObject({ conclusion: 'supported', evidenceIds: [evidenceId] })
    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as { enable_thinking?: boolean; messages: Array<{ content: Array<{ type: string; text?: string; image_url?: { url: string } }> }> }
    expect(body.enable_thinking).toBe(false)
    const content = body.messages[0]!.content
    expect(content).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,ZmFrZS1qcGVn' } },
    ])
    const serialized = JSON.stringify(body)
    expect(serialized).toContain(evidenceId)
    expect(serialized).not.toContain('C:\\sensitive\\source.mp4')
    expect(serialized).not.toContain('drama-with-subtitle')
    expect(serialized).not.toContain('episode-with-candidate')
    expect(serialized).not.toContain('ptsSeconds')
    const prompt = JSON.parse(content[0]!.text ?? '{}') as { factCode?: string; reviewQuestion?: string; requestedClaimKinds?: string[] }
    expect(prompt).toMatchObject({ factCode: 'fact-1', reviewQuestion: reviewContract.reviewQuestion, requestedClaimKinds: ['core-event'] })
  })

  it('uses strict JSON Schema for qwen3.7-plus and never falls back to free-form output', async () => {
    const evidenceId = '11111111-1111-4111-8111-111111111111'
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'response_format rejected' } }), { status: 400 }))
    const adapter = new OpenAiCompatibleClipMultimodalReviewAdapter({ readPlaintextForMainProcess: () => 'secret' }, fetchImpl)
    await expect(adapter.review({ ...reviewContract, package: input.package, profile: { ...input.profile, capability: 'multimodal-review', provider: '阿里云百炼 / Model Studio', model: 'qwen3.7-plus' }, evidenceIds: [evidenceId], frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] })).rejects.toThrow('HTTP 400')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string) as { response_format: { type: string; json_schema: { strict: boolean; schema: { properties: { factCode: { const: string } }; required: string[]; additionalProperties: boolean } } } }
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true, schema: { required: ['factCode', 'conclusion', 'evidenceIds', 'claimKinds', 'reason'], additionalProperties: false } } })
    expect(body.response_format.json_schema.schema.properties.factCode.const).toBe('fact-1')
  })
})
