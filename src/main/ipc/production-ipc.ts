import { ipcMain } from 'electron'
import { z } from 'zod'
import type { MultiEpisodeService } from '../services/multi-episode-service.js'
import type { OriginalClipService } from '../services/original-clip-service.js'
import type { TaskCenterService } from '../tasks/task-center-service.js'
import type { TaskExecutor, TaskQueue } from '../tasks/task-queue.js'

type Context = {
  originalClipService: () => OriginalClipService
  taskCenterService: () => TaskCenterService
  taskQueue: () => TaskQueue
  multiEpisodeService: () => MultiEpisodeService
  requireP0Task: (taskId: string) => { type: 'original_clip' | 'multi_episode' }
  taskExecutor: TaskExecutor
  resumeP0Task: (taskId: string) => Promise<void>
  recordTaskCompletion: (taskId: string) => void
  writeTechnicalLog: (level: 'info' | 'warning' | 'error', eventType: string, details?: Record<string, unknown>) => void
}

export const registerProductionIpc = (context: Context): void => {
  ipcMain.handle('clips:generate-candidates', (_event, dramaId: unknown, input: unknown) => context.originalClipService().startIntelligentGeneration(dramaId, input))
  ipcMain.handle('clips:preflight-generation', (_event, dramaId: unknown, input: unknown) => context.originalClipService().preflightGeneration(dramaId, input))
  ipcMain.handle('clips:cancel-intelligent-generation', (_event, taskId: unknown) => context.originalClipService().cancelIntelligentGeneration(taskId))
  ipcMain.handle('clips:decide-intelligent-deadline', (_event, taskId: unknown, action: unknown) => context.originalClipService().decideIntelligentGenerationDeadline(taskId, z.enum(['continue', 'stop']).parse(action)))
  ipcMain.handle('clips:update-candidate', (_event, candidateId: unknown, start: unknown, end: unknown) => context.originalClipService().updateCandidate(candidateId, { startSeconds: Number(start), endSeconds: Number(end) }))
  ipcMain.handle('clips:delete-candidate', (_event, candidateId: unknown) => context.originalClipService().deleteCandidate(candidateId))
  ipcMain.handle('clips:list-candidates', (_event, dramaId: unknown) => context.originalClipService().listCandidates(dramaId))
  ipcMain.handle('clips:confirm', (_event, candidateId: unknown) => context.originalClipService().confirmCandidate(candidateId))
  ipcMain.handle('clips:export', (_event, candidateId: unknown, outputDirectory: unknown) => context.originalClipService().exportCandidate(candidateId, outputDirectory))
  ipcMain.handle('clips:list-episode-statuses', (_event, dramaId: unknown) => context.originalClipService().listEpisodeStatuses(dramaId))
  ipcMain.handle('clips:get-latest-export-batch', (_event, dramaId: unknown) => context.originalClipService().getLatestExportBatch(dramaId))
  ipcMain.handle('clips:preflight-export', (_event, dramaId: unknown, config: unknown) => context.originalClipService().preflightExport(dramaId, config))
  ipcMain.handle('clips:export-batch', (_event, dramaId: unknown, config: unknown) => context.originalClipService().exportCandidates(dramaId, config))
  ipcMain.handle('clips:start-export-batch', (_event, dramaId: unknown, config: unknown) => context.originalClipService().startExportCandidates(dramaId, config))
  ipcMain.handle('clips:get-export-progress', (_event, exportId: unknown) => context.originalClipService().getExportProgress(exportId))
  ipcMain.handle('clips:cancel-export-batch', (_event, exportId: unknown) => context.originalClipService().cancelExport(exportId))
  ipcMain.handle('clips:retry', (_event, candidateId: unknown, outputDirectory: unknown) => context.originalClipService().retryFailedCandidate(candidateId, outputDirectory))
  ipcMain.handle('clips:list-subtitle-variants', (_event, candidateId: unknown) => context.originalClipService().listSubtitleVariants(candidateId))
  ipcMain.handle('clips:save-subtitle-variant', (_event, input: unknown) => context.originalClipService().saveSubtitleVariant(input))
  ipcMain.handle('tasks:list', () => context.taskCenterService().list())
  ipcMain.handle('tasks:report', (_event, taskId: unknown) => context.taskCenterService().report(taskId))
  ipcMain.handle('tasks:retry-failed', async (_event, taskId: unknown) => {
    const id = z.string().trim().min(1).parse(taskId)
    try {
      const task = context.requireP0Task(id)
      const result = task.type === 'multi_episode' ? await context.multiEpisodeService().retryFailed(id) : await context.originalClipService().retryFailedTask(id)
      context.recordTaskCompletion(id)
      return context.taskCenterService().list().map((item) => item.id === id ? { ...item, status: typeof result === 'object' && result !== null && 'status' in result ? String(result.status) : item.status } : item)
    } catch (error) {
      context.writeTechnicalLog('error', 'task.retry_failed.error', { taskId: id, errorCode: 'TASK_RETRY_FAILED' })
      throw error
    }
  })
  ipcMain.handle('tasks:run', async (_event, taskId: unknown) => {
    const id = z.string().trim().min(1).parse(taskId)
    try {
      const task = context.requireP0Task(id)
      const result = task.type === 'multi_episode' ? await context.multiEpisodeService().run(id) : await context.taskQueue().run(id, context.taskExecutor)
      context.recordTaskCompletion(id)
      return result
    } catch (error) {
      context.writeTechnicalLog('error', 'task.run.error', { taskId: id, errorCode: 'TASK_RUN_FAILED' })
      throw error
    }
  })
  ipcMain.handle('tasks:pause', (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); try { context.taskQueue().pause(id); context.writeTechnicalLog('info', 'task.pause.requested', { taskId: id }); context.recordTaskCompletion(id) } catch (error) { context.writeTechnicalLog('error', 'task.pause.error', { taskId: id, errorCode: 'TASK_PAUSE_FAILED' }); throw error } })
  ipcMain.handle('tasks:resume', async (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); try { const task = context.requireP0Task(id); if (task.type === 'original_clip') throw new Error('原剧智能候选只能通过其工作区的期限决策或新建任务继续，任务中心不会绕过证据与期限门禁。'); await context.resumeP0Task(id); context.writeTechnicalLog('info', 'task.resume.requested', { taskId: id }); context.recordTaskCompletion(id) } catch (error) { context.writeTechnicalLog('error', 'task.resume.error', { taskId: id, errorCode: 'TASK_RESUME_FAILED' }); throw error } })
  ipcMain.handle('tasks:cancel', (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); try { const task = context.requireP0Task(id); if (task.type === 'original_clip') context.originalClipService().cancelIntelligentGeneration(id); else context.taskQueue().cancel(id); context.writeTechnicalLog('warning', 'task.cancel.requested', { taskId: id }); context.recordTaskCompletion(id) } catch (error) { context.writeTechnicalLog('error', 'task.cancel.error', { taskId: id, errorCode: 'TASK_CANCEL_FAILED' }); throw error } })
  ipcMain.handle('tasks:recover', async (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); try { const task = context.requireP0Task(id); if (task.type === 'original_clip') throw new Error('原剧智能候选只能通过其工作区的期限决策或新建任务继续，任务中心不会绕过证据与期限门禁。'); const result = await context.multiEpisodeService().recover(id); context.recordTaskCompletion(id); return result } catch (error) { context.writeTechnicalLog('error', 'task.recover.error', { taskId: id, errorCode: 'TASK_RECOVER_FAILED' }); throw error } })
  ipcMain.handle('multi:preflight', (_event, dramaId: unknown, config: unknown) => context.multiEpisodeService().preflight(dramaId, config))
  ipcMain.handle('multi:create-task', (_event, dramaId: unknown, config: unknown) => context.multiEpisodeService().createTask(dramaId, config))
}
