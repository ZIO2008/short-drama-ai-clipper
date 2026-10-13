import Database from 'better-sqlite3'
import { OriginalClipService } from '../../src/main/services/original-clip-service.js'

// A separate application lifetime: no mocks, synthetic database state, or graceful shutdown.
const [databasePath, candidateId, outputDirectory] = process.argv.slice(2)
const database = new Database(databasePath!)
database.pragma('foreign_keys = ON')
const service = new OriginalClipService(database)
service.startExportCandidates('drama', {
  candidateIds: candidateId!.split(','), outputDirectory, namingPattern: 'same-name',
  encoding: 'h264-quality', outputSize: '1920x1080', subtitleStrategy: 'none',
  conflictStrategy: 'append', qualityMode: 'original'
})
// Parent waits for FFmpeg output bytes before killing this process and its children.
setInterval(() => undefined, 1000)
