import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import type { ProviderProfile, TencentAsrConfigurationTestResult, TencentAsrStoredCredentialStatus } from '../../shared/contracts.js'
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'

const inputSchema = z.object({
  capability: z.literal('asr'),
  provider: z.literal('腾讯云 ASR'),
  endpoint: z.string().trim().min(1).max(2048),
  timeoutSeconds: z.number().int().min(1).max(600),
  transientCredential: z.object({ version: z.literal(1), schema: z.enum(['api-key', 'tencent-cloud-secret-pair']), values: z.record(z.string(), z.string().trim().min(1).max(4096)) }).strict().optional()
}).strict()
const host = 'asr.tencentcloudapi.com'
const body = '{"TaskId":0}'
const action = 'DescribeTaskStatus'
const version = '2019-06-14'
type ProfileReader = { list: () => ProviderProfile[] }
type SecretReader = { readPlaintextForMainProcess: (secretRef: unknown) => string }
type FailureCategory = Extract<TencentAsrConfigurationTestResult, { status: 'failure' }>['category']
type Credentials = { secretId: string; secretKey: string }
const credentialsFromStoredValue = (value: string): Credentials | null => {
  const values = credentialValuesFromStoredValue(value, 'tencent-cloud-secret-pair')
  return values?.secretId && values.secretKey ? { secretId: values.secretId, secretKey: values.secretKey } : null
}

const failure = (category: FailureCategory, startedAt: number): TencentAsrConfigurationTestResult => ({ status: 'failure', category, elapsedMs: Math.max(0, Date.now() - startedAt) })
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const hmac = (key: string | Buffer, value: string): Buffer => createHmac('sha256', key).update(value).digest()
const utcDate = (timestamp: number): string => new Date(timestamp * 1000).toISOString().slice(0, 10)
const isExpectedProbeError = (code: string): boolean => /^InvalidParameter/.test(code) || /^ResourceNotFound/.test(code) || /^FailedOperation\.TaskNotExist/.test(code)
const isAuthenticationError = (code: string): boolean => /^(AuthFailure|SignatureFailure|UnauthorizedOperation)/.test(code)
const isRateLimitError = (code: string): boolean => /^(RequestLimitExceeded|LimitExceeded|Throttling)/.test(code)
const isServerError = (code: string): boolean => /^(InternalError|ServiceUnavailable)/.test(code)

const responseErrorCode = (value: unknown): string | null => {
  if (!value || typeof value !== 'object' || !('Response' in value) || !value.Response || typeof value.Response !== 'object') return null
  const response = value.Response
  if (!('Error' in response) || !response.Error || typeof response.Error !== 'object') return null
  return 'Code' in response.Error && typeof response.Error.Code === 'string' ? response.Error.Code : null
}

const hasResponseEnvelope = (value: unknown): boolean => Boolean(value && typeof value === 'object' && 'Response' in value && value.Response && typeof value.Response === 'object')

const authorizationFor = (credentials: Credentials, timestamp: number): string => {
  const date = utcDate(timestamp)
  const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
  const signedHeaders = 'content-type;host'
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(body)}`
  const credentialScope = `${date}/asr/tc3_request`
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`
  const secretDate = hmac(`TC3${credentials.secretKey}`, date)
  const secretService = hmac(secretDate, 'asr')
  const secretSigning = hmac(hmac(secretService, 'tc3_request'), stringToSign).toString('hex')
  return `TC3-HMAC-SHA256 Credential=${credentials.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${secretSigning}`
}

export class TencentAsrConfigurationTestService {
  constructor(private readonly profiles: ProfileReader, private readonly secrets: SecretReader, private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  getStoredCredentialStatus(): TencentAsrStoredCredentialStatus {
    const profile = this.profiles.list().find((item) => item.capability === 'asr' && item.provider === '腾讯云 ASR')
    if (!profile?.secretRef) return 'missing'
    try {
      return credentialsFromStoredValue(this.secrets.readPlaintextForMainProcess(profile.secretRef)) ? 'valid' : 'invalid'
    } catch {
      return 'invalid'
    }
  }

  async test(input: unknown): Promise<TencentAsrConfigurationTestResult> {
    const startedAt = this.now()
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) return failure('invalid-configuration', startedAt)
    try {
      const endpoint = new URL(parsed.data.endpoint)
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hostname.toLowerCase() !== host || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) return failure('invalid-configuration', startedAt)
    } catch { return failure('invalid-configuration', startedAt) }

    const transientValues = parsed.data.transientCredential
      ? credentialValuesFromStoredValue(JSON.stringify(parsed.data.transientCredential), 'tencent-cloud-secret-pair')
      : null
    let credentials: Credentials | null = transientValues?.secretId && transientValues.secretKey ? { secretId: transientValues.secretId, secretKey: transientValues.secretKey } : null
    if (parsed.data.transientCredential && !credentials) return failure('invalid-configuration', startedAt)
    if (!credentials) {
      const profile = this.profiles.list().find((item) => item.capability === 'asr' && item.provider === '腾讯云 ASR')
      if (!profile?.secretRef) return failure('missing-key', startedAt)
      try {
        credentials = credentialsFromStoredValue(this.secrets.readPlaintextForMainProcess(profile.secretRef))
      } catch { return failure('missing-key', startedAt) }
    }
    if (!credentials) return failure('missing-key', startedAt)

    const timestamp = Math.floor(this.now() / 1000)
    try {
      const response = await this.fetchImpl(`https://${host}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(parsed.data.timeoutSeconds * 1000),
        headers: { Authorization: authorizationFor(credentials, timestamp), 'Content-Type': 'application/json', Accept: 'application/json', 'X-TC-Action': action, 'X-TC-Version': version, 'X-TC-Timestamp': String(timestamp) },
        body
      })
      let payload: unknown = null
      try { payload = await response.json() } catch { /* response bodies remain in the main process */ }
      const code = responseErrorCode(payload)
      if (code && isAuthenticationError(code)) return failure('authentication', startedAt)
      if (response.status === 401 || response.status === 403) return failure('authentication', startedAt)
      if (response.status === 429 || (code && isRateLimitError(code))) return failure('rate-limit', startedAt)
      if (response.status >= 500 && response.status <= 599 || (code && isServerError(code))) return failure('server', startedAt)
      if (code && isExpectedProbeError(code)) return { status: 'success', elapsedMs: Math.max(0, this.now() - startedAt) }
      if (response.ok && hasResponseEnvelope(payload) && !code) return { status: 'success', elapsedMs: Math.max(0, this.now() - startedAt) }
      return failure('unexpected', startedAt)
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      return failure(name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network', startedAt)
    }
  }
}
