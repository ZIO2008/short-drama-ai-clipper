import hashlib
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


root = Path(sys.argv[1]).resolve()
controlled = (Path(__file__).resolve().parents[5] / "05_material_studio_backups").resolve()
if root.parent != controlled or not root.name.startswith("v0.1.95-before-parallel-") or not root.is_dir():
    raise SystemExit("Backup target is not the precreated controlled directory")
if list(root.iterdir()):
    raise SystemExit("Backup target must start empty")

source_path = Path(os.environ["APPDATA"]) / "ShortDramaMaterialStudio" / "data" / "material-studio.sqlite"
source = sqlite3.connect(source_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
source.execute("PRAGMA query_only = ON")
temporary = root / "material-studio.sqlite.partial"
target = root / "material-studio.sqlite"
destination = sqlite3.connect(temporary)
try:
    source.backup(destination, pages=512, sleep=0.05)
finally:
    destination.close()
    source.close()

snapshot = sqlite3.connect(temporary.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
snapshot.execute("PRAGMA query_only = ON")
try:
    integrity = snapshot.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise SystemExit("SQLite backup integrity check failed")
    schema_version = snapshot.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
    tables = ("dramas", "episodes", "subtitle_tracks", "subtitle_cues", "generated_materials", "clip_export_batches")
    counts = {table: snapshot.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in tables}
    source_paths = [row[0] for row in snapshot.execute("SELECT source_path FROM episodes")]
    source_paths_present = sum(bool(path) and path != "[redacted]" for path in source_paths)
    source_files_reachable = sum(bool(path) and path != "[redacted]" and Path(path).is_file() for path in source_paths)
finally:
    snapshot.close()

if source_paths_present != counts["episodes"]:
    raise SystemExit("Full backup unexpectedly lost episode source references")
temporary.rename(target)
manifest = {
    "schemaVersion": 1,
    "createdAtUtc": datetime.now(timezone.utc).isoformat(),
    "purpose": "reversible local parallel activation of material studio 0.1.95",
    "sourceMode": "read-only SQLite backup API, WAL-consistent",
    "databaseFilename": target.name,
    "databaseSha256": sha256(target),
    "databaseBytes": target.stat().st_size,
    "sqliteIntegrity": integrity,
    "databaseSchemaVersion": schema_version,
    "counts": counts,
    "episodeSourceReferencesPresent": source_paths_present,
    "episodeSourceFilesReachableAtBackup": source_files_reachable,
    "includesMediaBytes": False,
    "includesUnredactedDatabasePaths": True,
    "note": "Sensitive local backup. Keep outside Git and outside application-managed redacted backup rotation.",
}
manifest_file = root / "backup-manifest.json"
manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"backupDirectory": str(root), "manifestSha256": sha256(manifest_file), "databaseSha256": manifest["databaseSha256"], "counts": counts, "episodeSourceReferencesPresent": source_paths_present, "episodeSourceFilesReachableAtBackup": source_files_reachable}, ensure_ascii=False))
