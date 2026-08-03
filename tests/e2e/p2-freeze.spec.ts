import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, expect, test } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const projectRoot = resolve(import.meta.dirname, '../..')
const frozenDraftId = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'

const seedFrozenNarrationDraft = (userData: string): void => {
  const database = new DatabaseSync(join(userData, 'data', 'material-studio.sqlite'))
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('p2-drama', 'P2 历史剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('p2-episode', 'p2-drama', 1, 1, 'p2-history.mp4', 'ready', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('p2-task', 'p2-drama', 'ai_narration', '{}', 'completed', 0, 1, now, now)
    database.prepare('INSERT INTO ai_evidence (id, drama_id, episode_id, source_type, start_seconds, end_seconds, confidence, summary, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('p2-evidence', 'p2-drama', 'p2-episode', 'subtitle', 1, 4, 0.9, '历史旁白证据', '{}', now, now)
    database.prepare('INSERT INTO ai_drafts (id, task_id, evidence_id, summary, start_seconds, end_seconds, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(frozenDraftId, 'p2-task', 'p2-evidence', '历史旁白草稿', 1, 4, 0.9, 'pending_review', now, now)
  } finally {
    database.close()
  }
}

test('P2 narration has no production card, renderer, preload, provider, or execution surface', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'short-drama-p2-freeze-'))
  const app = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'p2-freeze', SHORTDRAMA_MATERIAL_USER_DATA: userData } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const surface = await page.evaluate(() => ({ apiKeys: Object.keys(window.desktopApi).filter((key) => /narration|tts|voice|commentary/i.test(key)), navigation: Array.from(document.querySelectorAll('nav button')).map((button) => button.textContent?.trim()) }))
    expect(surface.apiKeys).toEqual([])
    expect(surface.navigation).not.toContain('AI 短剧解说')
    seedFrozenNarrationDraft(userData)
    const timelineSurface = await page.evaluate(async (draftId) => {
      const timeline = { version: 1, snapEnabled: true, video: [{ id: 'clip', sourcePath: 'p2-history.mp4', sourceStartSeconds: 1, sourceEndSeconds: 4, positionSeconds: 0, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'source' }], music: [[], []], sfx: [[], []] }
      const outcomes = await Promise.allSettled([
        window.desktopApi.getTimelineProject(draftId),
        window.desktopApi.saveTimelineProject(draftId, timeline),
        window.desktopApi.addTimelineAudio(draftId, { kind: 'music', trackIndex: 0, sourcePath: 'music.wav', durationSeconds: 1, positionSeconds: 0 }),
        window.desktopApi.confirmTimelineDraft(draftId),
      ])
      return outcomes.map((outcome) => outcome.status)
    }, frozenDraftId)
    expect(timelineSurface).toEqual(['rejected', 'rejected', 'rejected', 'rejected'])
    const providerSurface = await page.evaluate(async () => {
      try {
        await window.desktopApi.saveProviderProfile({ capability: 'tts', region: 'cn', provider: 'Frozen TTS', endpoint: null, model: null, secretRef: null, timeoutMs: null, pricing: null })
        return { saveRejected: false, profiles: await window.desktopApi.listProviderProfiles() }
      } catch {
        return { saveRejected: true, profiles: await window.desktopApi.listProviderProfiles() }
      }
    })
    expect(providerSurface.saveRejected).toBe(true)
    expect(providerSurface.profiles).not.toEqual(expect.arrayContaining([expect.objectContaining({ capability: 'tts' })]))
    await page.getByRole('button', { name: '创建剧目' }).first().click()
    const dialog = page.getByRole('dialog', { name: '创建剧目' })
    await dialog.getByLabel('剧名').fill('P2 冻结验证剧目')
    await dialog.getByRole('button', { name: '保存并整理资产' }).click()
    const editorDialog = page.getByRole('dialog', { name: '编辑剧目' })
    await expect(editorDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(editorDialog).toBeHidden()
    await expect(page.getByRole('tab', { name: '素材生产' })).toBeVisible()
    await page.getByRole('tab', { name: '素材生产' }).click()
    await expect(page.getByText('AI 短剧解说')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '开发中，暂不可用' })).toHaveCount(0)
    expect(await page.locator('[data-route*="narration"], [data-route*="tts"], [href*="narration"], [href*="tts"]').count()).toBe(0)
  } finally {
    const pid = app.process()?.pid
    await app.close()
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await rm(userData, { recursive: true, force: true })
  }
})
