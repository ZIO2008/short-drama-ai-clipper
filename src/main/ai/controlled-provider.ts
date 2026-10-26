import { z } from 'zod'
import type { AiCapability } from './capability-registry.js'

const modeSchema = z.enum(['success', 'low-confidence', 'timeout', 'cost-limit', 'failure'])
export type ControlledMode = z.infer<typeof modeSchema>
export type ControlledResult = { capability: AiCapability; mode: ControlledMode; confidence: number | null; estimatedCost: number; message: string }

export const runControlledCapability = (capability: AiCapability, modeInput: unknown): ControlledResult => {
  const mode = modeSchema.parse(modeInput)
  if (mode === 'timeout') throw new Error(`${capability} 受控任务超时，未发送网络请求。`)
  if (mode === 'cost-limit') throw new Error(`${capability} 受控任务超过成本上限，未发送网络请求。`)
  if (mode === 'failure') throw new Error(`${capability} 受控供应商失败，未发送网络请求。`)
  return mode === 'low-confidence'
    ? { capability, mode, confidence: 0.35, estimatedCost: 0, message: '受控结果置信度不足，需保留证据并等待人工判断。' }
    : { capability, mode, confidence: 0.92, estimatedCost: 0, message: '受控结果成功；这不是实际供应商调用。' }
}
