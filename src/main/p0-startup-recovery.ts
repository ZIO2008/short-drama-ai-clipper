import type Database from 'better-sqlite3'
import { TaskCheckpointService } from './tasks/task-checkpoint-service.js'

/** Provider calls are not replayable; isolate them before generic queue recovery. */
export const normalizeP0StartupState = (database: Database.Database): void => {
  const now = new Date().toISOString()
  database.prepare("UPDATE production_tasks SET status = 'interrupted', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'interrupted', '$.reason', '应用已关闭或重启，文本语义候选生成已中断。'), updated_at = ? WHERE type = 'original_clip' AND status IN ('running', 'cancelling') AND json_extract(config_snapshot, '$.generation') IS NOT NULL").run(now)
  new TaskCheckpointService(database).normalizeInterruptedTasks()
}
