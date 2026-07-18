const SENSITIVE_KEY = /(?:key|secret|token|password|authorization|credential|prompt|request[_-]?body|api[_-]?key|private[_-]?key|payload|body|path|file|directory|filename|video|audio|subtitle|script)/i
const SENSITIVE_VALUE = /(?:^|\b)(?:bearer\s+\S+|sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})/i

export function sanitizePrivacyValue(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return undefined
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value) ? undefined : value
  if (Array.isArray(value)) return value.map((item) => sanitizePrivacyValue(item)).filter((item) => item !== undefined)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value)) {
      const sanitized = sanitizePrivacyValue(childValue, childKey)
      if (sanitized !== undefined) result[childKey] = sanitized
    }
    return result
  }
  return value
}

export function sanitizePrivacyRecord(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized = sanitizePrivacyValue(details)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : {}
}
