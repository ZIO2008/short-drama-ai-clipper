import Database from 'better-sqlite3'
import {createHash} from 'node:crypto'
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
import {migrateDatabase} from '../src/main/db/migrate.js'
const live=join(process.env.APPDATA!, 'ShortDramaMaterialStudio','data','material-studio.sqlite')
const hash=(path:string)=>existsSync(path)?createHash('sha256').update(readFileSync(path)).digest('hex'):null
const before=[hash(live),hash(live+'-wal')]
const root=mkdtempSync(join(tmpdir(),'clip-numbering-migration-'))
const source=new Database(live,{readonly:true,fileMustExist:true})
await source.backup(join(root,'snapshot.sqlite'));source.close()
const db=new Database(join(root,'snapshot.sqlite'));db.pragma('foreign_keys=ON')
try {
 const counts=()=>Object.fromEntries(['episodes','task_items','subtitle_tracks','subtitle_cues','generated_materials','clip_export_batches'].map(t=>[t,(db.prepare('SELECT COUNT(*) AS n FROM '+t).get() as {n:number}).n]))
 const rangeHash=()=>createHash('sha256').update(JSON.stringify(db.prepare('SELECT id,planned_range FROM task_items ORDER BY id').all())).digest('hex')
 const oldCounts=counts(),oldRanges=rangeHash()
 migrateDatabase(db);migrateDatabase(db)
 const countsUnchanged=JSON.stringify(counts())===JSON.stringify(oldCounts),rangesUnchanged=rangeHash()===oldRanges
 const foreignKeys=db.pragma('foreign_key_check')
 if(!countsUnchanged||!rangesUnchanged||foreignKeys.length)throw Error('Isolated migration changed original records')
 console.log(JSON.stringify({countsUnchanged,rangesUnchanged,formalDatabaseUnchanged:JSON.stringify(before)===JSON.stringify([hash(live),hash(live+'-wal')]),schemaVersion:(db.prepare('SELECT MAX(version) AS n FROM schema_migrations').get() as {n:number}).n,numberedCandidates:(db.prepare('SELECT COUNT(*) AS n FROM clip_candidate_numbers').get() as {n:number}).n,targetNumbers:db.prepare("SELECT substr(candidate_id,1,8) AS candidate,sequence_number AS number FROM clip_candidate_numbers WHERE episode_id = (SELECT episode_id FROM clip_candidate_numbers WHERE substr(candidate_id,1,8) = 'dfa49083') ORDER BY sequence_number").all(),formalConnection:'read-only',externalModelCalls:0}))
} finally {db.close();if(!resolve(root).toLowerCase().startsWith((resolve(tmpdir())+sep).toLowerCase()))throw Error('Unsafe temp cleanup target');rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})}
