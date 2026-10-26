import { rm, stat } from 'node:fs/promises'

/** A practical input guard, not a hidden export limit. The task value remains authoritative. */
export const MAX_TARGET_SIZE_MB = 4096
/** @deprecated Historical compatibility constant; no longer used as an export gate. */
export const MAX_OUTPUT_SIZE_BYTES = 200 * 1024 * 1024

/** Removes a non-compliant output before it can be recorded as a usable result. */
export const enforceOutputSizeLimit = async (outputPath: string, targetSizeMb?: number): Promise<number> => {
  const sizeBytes = (await stat(outputPath)).size
  if (!targetSizeMb) return sizeBytes
  const limitBytes = targetSizeMb * 1024 * 1024
  if (sizeBytes <= limitBytes) return sizeBytes
  await rm(outputPath, { force: true })
  throw new Error(`导出文件超过任务设置的 ${targetSizeMb} MB 上限，已删除未合规文件。请降低目标大小、码率或时长后重试。`)
}
