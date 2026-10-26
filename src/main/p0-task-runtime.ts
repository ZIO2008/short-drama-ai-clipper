import type Database from 'better-sqlite3'
import type { MultiEpisodeService } from './services/multi-episode-service.js'
import type { NotificationService } from './services/notification-service.js'
import type { OriginalClipService } from './services/original-clip-service.js'
import type { TaskExecutor, TaskQueue } from './tasks/task-queue.js'

type Dependencies = {
  database: () => Database.Database
  queue: () => TaskQueue
  multiEpisode: () => MultiEpisodeService
  originalClip: () => OriginalClipService
  notification: () => NotificationService | null
}

export const createP0TaskRuntime = (dependencies: Dependencies) => {
  const requireTask = (taskId: string): { type: 'original_clip' | 'multi_episode' } => {
    const task = dependencies.database().prepare("SELECT type FROM production_tasks WHERE id = ? AND type IN ('original_clip', 'multi_episode')").get(taskId) as { type: 'original_clip' | 'multi_episode' } | undefined
    if (!task) throw new Error('该任务不属于当前 P0 候选版本，无法继续执行。')
    return task
  }

  const executor: TaskExecutor = async (item) => {
    const task = dependencies.database().prepare('SELECT type, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(item.taskId) as { type: string; configSnapshot: string } | undefined
    if (!task) throw new Error('任务不存在。')
    if (task.type !== 'original_clip') throw new Error('该任务类型尚未接入可恢复执行器，请回到生产工作区重新创建。')
    const config = JSON.parse(task.configSnapshot) as { outputDirectory?: string }
    if (!config.outputDirectory) throw new Error('任务缺少输出目录配置，请回到原剧切片工作区重新导出。')
    await dependencies.originalClip().retryFailedCandidate(item.id, config.outputDirectory)
    return { status: 'succeeded' as const }
  }

  const resume = async (taskId: string): Promise<void> => {
    const task = requireTask(taskId)
    try { dependencies.queue().resume(taskId); return } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Task is not running in this queue') throw error
    }
    if (task.type === 'multi_episode') await dependencies.multiEpisode().recover(taskId)
    else await dependencies.queue().recover(taskId, executor)
  }

  const recordCompletion = (taskId: string): void => {
    const notification = dependencies.notification()
    if (!notification) return
    const row = dependencies.database().prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId) as { status: string } | undefined
    if (!row) return
    const counts = dependencies.database().prepare('SELECT status, COUNT(*) AS count FROM task_items WHERE task_id = ? GROUP BY status').all(taskId) as Array<{ status: string; count: number }>
    const summary = counts.map(({ status, count }) => `${status} ${count} 项`).join('，') || '无任务项'
    const status = row.status === 'partial' || row.status === 'partially_completed' ? 'partial' : row.status
    const severity = status === 'completed' ? 'success' : status === 'partial' ? 'warning' : status === 'failed' ? 'error' : 'info'
    const title = status === 'completed' ? '生产任务已完成' : status === 'partial' ? '生产任务部分完成' : status === 'failed' ? '生产任务连续失败' : `生产任务${status}`
    notification.recordTaskEvent({ eventKey: `${taskId}:${status}`, taskId, severity, title, summary, actionTarget: `tasks/${taskId}` })
  }

  const stopForShutdown = (taskId: string): void => {
    const task = requireTask(taskId)
    if (task.type !== 'original_clip') { dependencies.queue().stopForShutdown(taskId); return }
    const row = dependencies.database().prepare('SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(taskId) as { configSnapshot: string } | undefined
    let intelligentGeneration = false
    try { const config: unknown = JSON.parse(row?.configSnapshot ?? '{}'); intelligentGeneration = Boolean(config && typeof config === 'object' && 'generation' in config) } catch { intelligentGeneration = true }
    if (intelligentGeneration) dependencies.originalClip().stopIntelligentGenerationForShutdown(taskId)
    else dependencies.queue().stopForShutdown(taskId)
  }

  return { executor, requireTask, resume, recordCompletion, stopForShutdown }
}
