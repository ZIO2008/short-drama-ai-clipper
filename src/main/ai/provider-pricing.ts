import { z } from 'zod'

const pricingSchema = z.object({ perRequest: z.number().finite().nonnegative() })

export const readPerRequestPrice = (value: string | null): number | null => {
  if (!value) return null
  try { return pricingSchema.parse(JSON.parse(value)).perRequest } catch { return null }
}
