import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { NotificationItem, NotificationSeverity, NotificationSnapshot } from '../../shared/contracts.js'

const notificationIdSchema = z.string().uuid()
const eventInputSchema = z.object({
  eventKey: z.string().trim().min(1).max(160),
  dramaId: z.string().trim().min(1).nullable().optional(),
  taskId: z.string().trim().min(1).nullable().optional(),
  taskItemId: z.string().trim().min(1).nullable().optional(),
  severity: z.enum(['info', 'success', 'warning', 'error', 'decision']),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  actionTarget: z.string().trim().min(1).max(300).nullable().optional()
})

type NotificationRow = {
  id: string
  drama_id: string | null
  drama_name: string | null
  task_id: string | null
  task_item_id: string | null
  task_type: string | null
  severity: NotificationSeverity
  title: string
  summary: string
  action_target: string | null
  read_at: string | null
  resolved_at: string | null
  occurred_at: string
}

export class NotificationService {
  constructor(private readonly database: Database.Database) {}

  list(): NotificationSnapshot {
    const rows = this.database.prepare(`
      SELECT n.id, n.drama_id, d.name AS drama_name, n.task_id, n.task_item_id, t.type AS task_type,
             n.severity, n.title, n.summary, n.action_target, n.read_at, n.resolved_at,
             COALESCE(n.occurred_at, n.created_at) AS occurred_at
      FROM notifications n
      LEFT JOIN production_tasks t ON t.id = n.task_id
      LEFT JOIN dramas d ON d.id = n.drama_id
      ORDER BY COALESCE(n.occurred_at, n.created_at) DESC, n.id DESC
    `).all() as NotificationRow[]
    const unread = this.database.prepare('SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL').get() as { count: number }
    return { items: rows.map(mapNotification), unreadCount: unread.count }
  }

  recordTaskEvent(input: unknown): NotificationItem {
    const event = eventInputSchema.parse(input)
    const id = randomUUID()
    const now = new Date().toISOString()
    const dramaId = event.dramaId ?? this.findTaskDramaId(event.taskId ?? null)
    this.database.prepare(`
      INSERT INTO notifications (
        id, event_key, drama_id, task_id, task_item_id, severity, title, summary,
        action_target, occurred_at, read_at, resolved_at, created_at, updated_at
      ) VALUES (
        @id, @eventKey, @dramaId, @taskId, @taskItemId, @severity, @title, @summary,
        @actionTarget, @occurredAt, NULL, NULL, @createdAt, @updatedAt
      )
      ON CONFLICT(event_key) DO UPDATE SET
        drama_id = excluded.drama_id,
        task_id = excluded.task_id,
        task_item_id = excluded.task_item_id,
        severity = excluded.severity,
        title = excluded.title,
        summary = excluded.summary,
        action_target = excluded.action_target,
        occurred_at = excluded.occurred_at,
        read_at = NULL,
        resolved_at = NULL,
        updated_at = excluded.updated_at
    `).run({
      id,
      eventKey: event.eventKey,
      dramaId,
      taskId: event.taskId ?? null,
      taskItemId: event.taskItemId ?? null,
      severity: event.severity,
      title: event.title,
      summary: event.summary,
      actionTarget: event.actionTarget ?? null,
      occurredAt: now,
      createdAt: now,
      updatedAt: now
    })
    return this.getByEventKey(event.eventKey)
  }

  markRead(notificationId: unknown): NotificationSnapshot {
    const id = notificationIdSchema.parse(notificationId)
    this.database.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?), updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), id)
    return this.list()
  }

  markAllRead(): NotificationSnapshot {
    const now = new Date().toISOString()
    this.database.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?), updated_at = ? WHERE read_at IS NULL').run(now, now)
    return this.list()
  }

  clearRead(): NotificationSnapshot {
    this.database.prepare(`
      DELETE FROM notifications
      WHERE read_at IS NOT NULL
        AND (severity <> 'decision' OR resolved_at IS NOT NULL)
    `).run()
    return this.list()
  }

  resolve(notificationId: unknown): NotificationSnapshot {
    const id = notificationIdSchema.parse(notificationId)
    const now = new Date().toISOString()
    this.database.prepare('UPDATE notifications SET resolved_at = ?, read_at = COALESCE(read_at, ?), updated_at = ? WHERE id = ?')
      .run(now, now, now, id)
    return this.list()
  }

  resolveEvent(eventKeyInput: unknown): void {
    const eventKey = z.string().trim().min(1).max(160).parse(eventKeyInput)
    const now = new Date().toISOString()
    this.database.prepare('UPDATE notifications SET resolved_at = ?, read_at = COALESCE(read_at, ?), updated_at = ? WHERE event_key = ?')
      .run(now, now, now, eventKey)
  }

  private getByEventKey(eventKey: string): NotificationItem {
    const row = this.database.prepare(`
      SELECT n.id, n.drama_id, d.name AS drama_name, n.task_id, n.task_item_id, t.type AS task_type,
             n.severity, n.title, n.summary, n.action_target, n.read_at, n.resolved_at,
             COALESCE(n.occurred_at, n.created_at) AS occurred_at
      FROM notifications n
      LEFT JOIN production_tasks t ON t.id = n.task_id
      LEFT JOIN dramas d ON d.id = n.drama_id
      WHERE n.event_key = ?
    `).get(eventKey) as NotificationRow | undefined
    if (!row) {
      throw new Error('通知事件写入失败。')
    }
    return mapNotification(row)
  }

  private findTaskDramaId(taskId: string | null): string | null {
    if (!taskId) {
      return null
    }
    const task = this.database.prepare('SELECT drama_id FROM production_tasks WHERE id = ?').get(taskId) as { drama_id: string } | undefined
    return task?.drama_id ?? null
  }
}

const mapNotification = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  dramaId: row.drama_id,
  dramaName: row.drama_name,
  taskId: row.task_id,
  taskItemId: row.task_item_id,
  taskType: row.task_type,
  severity: row.severity,
  title: row.title,
  summary: row.summary,
  actionTarget: row.action_target,
  readAt: row.read_at,
  resolvedAt: row.resolved_at,
  occurredAt: row.occurred_at
})
