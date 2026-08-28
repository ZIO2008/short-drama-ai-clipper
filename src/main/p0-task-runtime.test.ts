import { describe, expect, it, vi } from 'vitest'
import { createP0TaskRuntime } from './p0-task-runtime.js'

const setup = (options: { resumeError?: Error; taskType?: 'original_clip' | 'multi_episode'; taskStatus?: string; taskExists?: boolean; intelligentGeneration?: boolean } = {}) => {
  const retryFailedCandidate = vi.fn().mockResolvedValue(undefined)
  const queueRecover = vi.fn().mockResolvedValue(undefined)
  const multiEpisodeRecover = vi.fn().mockResolvedValue(undefined)
  const queueStopForShutdown = vi.fn()
  const originalClipStopForShutdown = vi.fn()
  const resume = options.resumeError ? vi.fn(() => { throw options.resumeError }) : vi.fn()
  const database = {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn(() => {
        if (options.taskExists === false) return undefined
        if (sql.includes('config_snapshot')) return { type: 'original_clip', configSnapshot: JSON.stringify(options.intelligentGeneration ? { generation: { episodeIds: ['e'] } } : { outputDirectory: 'D:\\output' }) }
        if (sql.includes('SELECT status')) return { status: options.taskStatus ?? 'completed' }
        return { type: options.taskType ?? 'original_clip' }
      }),
      all: vi.fn(() => [{ status: 'succeeded', count: 1 }])
    }))
  }
  const recordTaskEvent = vi.fn()
  const runtime = createP0TaskRuntime({ database: () => database as never, queue: () => ({ resume, recover: queueRecover, stopForShutdown: queueStopForShutdown }) as never, multiEpisode: () => ({ recover: multiEpisodeRecover }) as never, originalClip: () => ({ retryFailedCandidate, stopIntelligentGenerationForShutdown: originalClipStopForShutdown }) as never, notification: () => ({ recordTaskEvent }) as never })
  return { runtime, resume, queueRecover, multiEpisodeRecover, retryFailedCandidate, recordTaskEvent, queueStopForShutdown, originalClipStopForShutdown }
}

describe('createP0TaskRuntime', () => {
  it('resumes a task already owned by the queue', async () => {
    const { runtime, resume, queueRecover } = setup()
    await runtime.resume('task-1')
    expect(resume).toHaveBeenCalledWith('task-1'); expect(queueRecover).not.toHaveBeenCalled()
  })

  it('recovers an original-clip task only after the queue reports it is not running', async () => {
    const { runtime, queueRecover, multiEpisodeRecover } = setup({ resumeError: new Error('Task is not running in this queue') })
    await runtime.resume('task-1')
    expect(queueRecover).toHaveBeenCalledWith('task-1', runtime.executor)
    expect(multiEpisodeRecover).not.toHaveBeenCalled()
  })

  it('delegates persisted multi-episode recovery to the multi-episode service', async () => {
    const { runtime, queueRecover, multiEpisodeRecover } = setup({ resumeError: new Error('Task is not running in this queue'), taskType: 'multi_episode' })
    await runtime.resume('task-1')
    expect(multiEpisodeRecover).toHaveBeenCalledWith('task-1')
    expect(queueRecover).not.toHaveBeenCalled()
  })

  it('does not reinterpret unrelated queue failures as recoverable state', async () => {
    const failure = new Error('database unavailable')
    const { runtime, queueRecover, multiEpisodeRecover } = setup({ resumeError: failure })
    await expect(runtime.resume('task-1')).rejects.toBe(failure)
    expect(queueRecover).not.toHaveBeenCalled()
    expect(multiEpisodeRecover).not.toHaveBeenCalled()
  })

  it('executes a failed candidate only with its persisted output directory', async () => {
    const { runtime, retryFailedCandidate } = setup()
    await expect(runtime.executor(
      { id: 'candidate-1', taskId: 'task-1' } as never,
      { signal: new AbortController().signal, attempt: 1, mode: 'background', checkpoint: null }
    )).resolves.toEqual({ status: 'succeeded' })
    expect(retryFailedCandidate).toHaveBeenCalledWith('candidate-1', 'D:\\output')
  })

  it('records the persisted task outcome without inventing task items', () => {
    const { runtime, recordTaskEvent } = setup()
    runtime.recordCompletion('task-1')
    expect(recordTaskEvent).toHaveBeenCalledWith({ eventKey: 'task-1:completed', taskId: 'task-1', severity: 'success', title: '生产任务已完成', summary: 'succeeded 1 项', actionTarget: 'tasks/task-1' })
  })

  it('normalizes a partially-completed persisted status for notification severity', () => {
    const { runtime, recordTaskEvent } = setup({ taskStatus: 'partially_completed' })
    runtime.recordCompletion('task-1')
    expect(recordTaskEvent).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'task-1:partial', severity: 'warning', title: '生产任务部分完成' }))
  })

  it('rejects tasks outside the persisted P0 task set', async () => {
    const { runtime } = setup({ taskExists: false })
    await expect(runtime.resume('task-1')).rejects.toThrow('该任务不属于当前 P0 候选版本')
  })

  it('routes intelligent generation shutdown through its dedicated lifecycle', () => {
    const { runtime, queueStopForShutdown, originalClipStopForShutdown } = setup({ intelligentGeneration: true })
    runtime.stopForShutdown('task-1')
    expect(originalClipStopForShutdown).toHaveBeenCalledWith('task-1')
    expect(queueStopForShutdown).not.toHaveBeenCalled()
  })

  it('keeps non-generation P0 shutdown on the task queue', () => {
    const { runtime, queueStopForShutdown, originalClipStopForShutdown } = setup()
    runtime.stopForShutdown('task-1')
    expect(queueStopForShutdown).toHaveBeenCalledWith('task-1')
    expect(originalClipStopForShutdown).not.toHaveBeenCalled()
  })
})
