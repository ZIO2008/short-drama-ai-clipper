import hashlib
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path


def count_rows(database: sqlite3.Connection, table: str) -> int | None:
    if table not in {
        "dramas", "episodes", "subtitle_tracks", "subtitle_cues",
        "generated_materials", "clip_export_batches", "provider_profiles",
        "secret_records", "app_backups",
    }:
        raise ValueError("unexpected table")
    present = database.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
    ).fetchone()
    return database.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] if present else None


root = Path(os.environ["APPDATA"]) / "ShortDramaMaterialStudio"
database_file = root / "data" / "material-studio.sqlite"
if not database_file.is_file():
    raise SystemExit("Current material studio database is absent")

source = sqlite3.connect(database_file.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
source.execute("PRAGMA query_only = ON")
snapshot = sqlite3.connect(":memory:")
try:
    source.backup(snapshot, pages=512, sleep=0.05)
finally:
    source.close()

integrity = snapshot.execute("PRAGMA integrity_check").fetchone()[0]
if integrity != "ok":
    raise SystemExit("Consistent read-only snapshot failed integrity check")

counts = {table: count_rows(snapshot, table) for table in (
    "dramas", "episodes", "subtitle_tracks", "subtitle_cues",
    "generated_materials", "clip_export_batches", "provider_profiles",
    "secret_records", "app_backups",
)}
schema_version = snapshot.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
snapshot_digest = hashlib.sha256(snapshot.serialize()).hexdigest()

rehearsal = sqlite3.connect(":memory:")
snapshot.backup(rehearsal)
rehearsal.execute("CREATE TABLE _codex_rehearsal_marker (id INTEGER PRIMARY KEY)")
rehearsal.execute("INSERT INTO _codex_rehearsal_marker VALUES (1)")
rehearsal.commit()
mutated_digest = hashlib.sha256(rehearsal.serialize()).hexdigest()
restored = sqlite3.connect(":memory:")
snapshot.backup(restored)
restored_digest = hashlib.sha256(restored.serialize()).hexdigest()
restored_counts = {table: count_rows(restored, table) for table in counts}
restored_integrity = restored.execute("PRAGMA integrity_check").fetchone()[0]
marker_absent_after_restore = restored.execute(
    "SELECT 1 FROM sqlite_master WHERE name = '_codex_rehearsal_marker'"
).fetchone() is None

backup_directory = root / "backups"
backups = sorted(
    backup_directory.glob("material-studio-*.sqlite") if backup_directory.is_dir() else [],
    key=lambda path: path.stat().st_mtime,
    reverse=True,
)
latest_backup = None
if backups:
    backup = sqlite3.connect(backups[0].resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
    try:
        latest_backup = {
            "modifiedLocal": datetime.fromtimestamp(backups[0].stat().st_mtime).isoformat(timespec="seconds"),
            "integrity": backup.execute("PRAGMA integrity_check").fetchone()[0],
            "episodes": count_rows(backup, "episodes"),
            "redactedEpisodePaths": backup.execute(
                "SELECT COUNT(*) FROM episodes WHERE source_path = '[redacted]'"
            ).fetchone()[0],
        }
    finally:
        backup.close()

result = {
    "mode": "read-only source, in-memory SQLite backup and restore",
    "sourceMainBytes": database_file.stat().st_size,
    "sourceWalBytes": (database_file.parent / (database_file.name + "-wal")).stat().st_size
    if (database_file.parent / (database_file.name + "-wal")).exists() else 0,
    "schemaVersion": schema_version,
    "counts": counts,
    "snapshotIntegrity": integrity,
    "snapshotDigest": snapshot_digest,
    "isolatedMutationChangedDigest": mutated_digest != snapshot_digest,
    "restoredDigestMatches": restored_digest == snapshot_digest,
    "restoredCountsMatch": restored_counts == counts,
    "restoredIntegrity": restored_integrity,
    "markerAbsentAfterRestore": marker_absent_after_restore,
    "managedBackupCount": len(backups),
    "latestManagedBackup": latest_backup,
}
print(json.dumps(result, ensure_ascii=False))
restored.close()
rehearsal.close()
snapshot.close()
