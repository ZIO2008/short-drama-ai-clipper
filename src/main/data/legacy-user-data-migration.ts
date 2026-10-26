import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import Database from 'better-sqlite3'

type DataCounts = {
  dramas: number
  episodes: number
  subtitleTracks: number
  subtitleCues: number
  providerProfiles: number
  secretRecords: number
  schemaVersion: number
}

type Candidate = {
  channel: string
  directory: string
  databasePath: string
  counts: DataCounts
}

export type LegacyUserDataMigrationResult = {
  migrated: boolean
  sourceChannel: string | null
  destinationDatabasePath: string
}

type CoverPathRow = { drama_id: string; path: string }

const countRows = (database: Database.Database, table: string): number => {
  try {
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number }
    return Number(row.count ?? 0)
  } catch {
    return 0
  }
}

const inspectDatabase = (databasePath: string): DataCounts | null => {
  if (!existsSync(databasePath)) return null
  let database: Database.Database | null = null
  try {
    database = new Database(databasePath, { readonly: true, fileMustExist: true })
    const migration = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version?: number } | undefined
    return {
      dramas: countRows(database, 'dramas'),
      episodes: countRows(database, 'episodes'),
      subtitleTracks: countRows(database, 'subtitle_tracks'),
      subtitleCues: countRows(database, 'subtitle_cues'),
      providerProfiles: countRows(database, 'provider_profiles'),
      secretRecords: countRows(database, 'secret_records'),
      schemaVersion: Number(migration?.version ?? 0),
    }
  } catch {
    return null
  } finally {
    database?.close()
  }
}

const compareCandidates = (left: Candidate, right: Candidate): number => {
  const fields: Array<keyof DataCounts> = [
    'subtitleCues',
    'subtitleTracks',
    'secretRecords',
    'providerProfiles',
    'episodes',
    'dramas',
    'schemaVersion',
  ]
  for (const field of fields) {
    const difference = left.counts[field] - right.counts[field]
    if (difference !== 0) return difference
  }
  return left.channel === 'development' ? 1 : -1
}

const findBestLegacyCandidate = (userDataPath: string): Candidate | null => {
  const candidates = ['development', 'stable']
    .map((channel) => {
      const directory = join(userDataPath, channel)
      const databasePath = join(directory, 'data', 'material-studio.sqlite')
      const counts = inspectDatabase(databasePath)
      return counts ? { channel, directory, databasePath, counts } : null
    })
    .filter((candidate): candidate is Candidate => candidate !== null)
  return candidates.sort(compareCandidates).at(-1) ?? null
}

const migrateOwnedCache = (database: Database.Database, source: Candidate, userDataPath: string): void => {
  const sourceCache = resolve(join(source.directory, 'cache'))
  const destinationCache = resolve(join(userDataPath, 'cache'))
  if (existsSync(sourceCache)) {
    mkdirSync(destinationCache, { recursive: true })
    cpSync(sourceCache, destinationCache, { recursive: true, force: false, errorOnExist: false })
  }

  try {
    const rows = database.prepare('SELECT drama_id, path FROM drama_covers').all() as CoverPathRow[]
    const sourcePrefix = `${sourceCache}${process.platform === 'win32' ? '\\' : '/'}`
    const update = database.prepare('UPDATE drama_covers SET path = ?, updated_at = updated_at WHERE drama_id = ?')
    for (const row of rows) {
      const absolutePath = resolve(row.path)
      if (!absolutePath.startsWith(sourcePrefix)) continue
      const migratedPath = join(destinationCache, relative(sourceCache, absolutePath))
      update.run(migratedPath, row.drama_id)
    }
  } catch {
    // Older databases without drama_covers remain valid; no cache path rewrite is needed.
  }
}

export const migrateLegacyUserData = async (userDataPath: string): Promise<LegacyUserDataMigrationResult> => {
  const destinationDatabasePath = join(userDataPath, 'data', 'material-studio.sqlite')
  if (existsSync(destinationDatabasePath)) {
    const source = findBestLegacyCandidate(userDataPath)
    if (source) {
      const existingDatabase = new Database(destinationDatabasePath)
      try {
        migrateOwnedCache(existingDatabase, source, userDataPath)
      } finally {
        existingDatabase.close()
      }
    }
    return { migrated: false, sourceChannel: null, destinationDatabasePath }
  }

  const source = findBestLegacyCandidate(userDataPath)
  if (!source) return { migrated: false, sourceChannel: null, destinationDatabasePath }

  mkdirSync(join(userDataPath, 'data'), { recursive: true })
  const temporaryDatabasePath = `${destinationDatabasePath}.migrating`
  rmSync(temporaryDatabasePath, { force: true })
  const sourceDatabase = new Database(source.databasePath, { readonly: true, fileMustExist: true })
  try {
    await sourceDatabase.backup(temporaryDatabasePath)
  } finally {
    sourceDatabase.close()
  }
  const migratedDatabase = new Database(temporaryDatabasePath)
  try {
    migrateOwnedCache(migratedDatabase, source, userDataPath)
  } finally {
    migratedDatabase.close()
  }
  renameSync(temporaryDatabasePath, destinationDatabasePath)
  return { migrated: true, sourceChannel: source.channel, destinationDatabasePath }
}
