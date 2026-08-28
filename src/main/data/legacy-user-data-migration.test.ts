import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateLegacyUserData } from './legacy-user-data-migration.js'

const temporaryDirectories: string[] = []

const createLegacyDatabase = (databasePath: string, cueCount: number, secretCount: number): void => {
  mkdirSync(join(databasePath, '..'), { recursive: true })
  const database = new Database(databasePath)
  database.pragma('journal_mode = WAL')
  database.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (28, '2026-08-08T00:00:00.000Z');
    CREATE TABLE dramas (id TEXT PRIMARY KEY);
    CREATE TABLE episodes (id TEXT PRIMARY KEY);
    CREATE TABLE subtitle_tracks (id TEXT PRIMARY KEY);
    CREATE TABLE subtitle_cues (id TEXT PRIMARY KEY);
    CREATE TABLE provider_profiles (id TEXT PRIMARY KEY);
    CREATE TABLE secret_records (id TEXT PRIMARY KEY);
    INSERT INTO dramas VALUES ('drama-1');
    INSERT INTO episodes VALUES ('episode-1');
    INSERT INTO subtitle_tracks VALUES ('track-1');
    INSERT INTO provider_profiles VALUES ('provider-1');
  `)
  const cueInsert = database.prepare('INSERT INTO subtitle_cues VALUES (?)')
  const secretInsert = database.prepare('INSERT INTO secret_records VALUES (?)')
  for (let index = 0; index < cueCount; index += 1) cueInsert.run(`cue-${index}`)
  for (let index = 0; index < secretCount; index += 1) secretInsert.run(`secret-${index}`)
  database.close()
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('migrateLegacyUserData', () => {
  it('migrates the most complete legacy database including WAL data and does not overwrite it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'short-drama-user-data-'))
    temporaryDirectories.push(root)
    createLegacyDatabase(join(root, 'stable', 'data', 'material-studio.sqlite'), 1, 0)
    createLegacyDatabase(join(root, 'development', 'data', 'material-studio.sqlite'), 3, 2)

    const result = await migrateLegacyUserData(root)
    expect(result.migrated).toBe(true)
    expect(result.sourceChannel).toBe('development')

    const migrated = new Database(result.destinationDatabasePath, { readonly: true })
    expect(migrated.prepare('SELECT COUNT(*) AS count FROM subtitle_cues').get()).toEqual({ count: 3 })
    expect(migrated.prepare('SELECT COUNT(*) AS count FROM secret_records').get()).toEqual({ count: 2 })
    migrated.close()

    const secondRun = await migrateLegacyUserData(root)
    expect(secondRun.migrated).toBe(false)
    expect(secondRun.sourceChannel).toBeNull()
  })

  it('moves application-owned cover files and rewrites their paths with the database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'short-drama-user-data-cover-'))
    temporaryDirectories.push(root)
    const databasePath = join(root, 'development', 'data', 'material-studio.sqlite')
    createLegacyDatabase(databasePath, 1, 0)
    const legacyCoverPath = join(root, 'development', 'cache', 'drama-1', 'cover', 'cover-upload.png')
    mkdirSync(join(legacyCoverPath, '..'), { recursive: true })
    writeFileSync(legacyCoverPath, 'cover')
    const legacyDatabase = new Database(databasePath)
    legacyDatabase.exec('CREATE TABLE drama_covers (drama_id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    legacyDatabase.prepare('INSERT INTO drama_covers VALUES (?, ?, ?, ?, ?)').run('drama-1', 'uploaded', legacyCoverPath, 'now', 'now')
    legacyDatabase.close()

    const result = await migrateLegacyUserData(root)
    const destinationCoverPath = join(root, 'cache', 'drama-1', 'cover', 'cover-upload.png')
    expect(existsSync(destinationCoverPath)).toBe(true)
    expect(readFileSync(destinationCoverPath, 'utf8')).toBe('cover')
    const migrated = new Database(result.destinationDatabasePath, { readonly: true })
    expect(migrated.prepare('SELECT path FROM drama_covers WHERE drama_id = ?').get('drama-1')).toEqual({ path: destinationCoverPath })
    migrated.close()
  })

  it('repairs cache files and cover paths when an older migration already published the database', async () => {
    const root = mkdtempSync(join(tmpdir(), 'short-drama-user-data-repair-'))
    temporaryDirectories.push(root)
    const legacyDatabasePath = join(root, 'development', 'data', 'material-studio.sqlite')
    createLegacyDatabase(legacyDatabasePath, 1, 0)
    const legacyCoverPath = join(root, 'development', 'cache', 'drama-1', 'cover', 'cover-upload.png')
    mkdirSync(join(legacyCoverPath, '..'), { recursive: true })
    writeFileSync(legacyCoverPath, 'cover')
    const legacyDatabase = new Database(legacyDatabasePath)
    legacyDatabase.exec('CREATE TABLE drama_covers (drama_id TEXT PRIMARY KEY, source_kind TEXT NOT NULL, path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    legacyDatabase.prepare('INSERT INTO drama_covers VALUES (?, ?, ?, ?, ?)').run('drama-1', 'uploaded', legacyCoverPath, 'now', 'now')
    legacyDatabase.close()

    const destinationDatabasePath = join(root, 'data', 'material-studio.sqlite')
    mkdirSync(join(destinationDatabasePath, '..'), { recursive: true })
    const incompleteMigration = new Database(legacyDatabasePath, { readonly: true })
    await incompleteMigration.backup(destinationDatabasePath)
    incompleteMigration.close()
    const result = await migrateLegacyUserData(root)
    const destinationCoverPath = join(root, 'cache', 'drama-1', 'cover', 'cover-upload.png')
    expect(result.migrated).toBe(false)
    expect(existsSync(destinationCoverPath)).toBe(true)
    const repaired = new Database(destinationDatabasePath, { readonly: true })
    expect(repaired.prepare('SELECT path FROM drama_covers WHERE drama_id = ?').get('drama-1')).toEqual({ path: destinationCoverPath })
    repaired.close()
  })
})
