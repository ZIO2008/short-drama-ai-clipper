import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path


mode, root_argument = sys.argv[1:3]
root = Path(root_argument).resolve()
if not root.is_dir() or not root.name.startswith("shortdrama-cutover-"):
    raise SystemExit("Unexpected isolated rehearsal directory")
if os.path.commonpath((str(Path(os.environ["TEMP"]).resolve()), str(root))) != str(Path(os.environ["TEMP"]).resolve()):
    raise SystemExit("Isolated directory is outside system temp")

original = root / "preflight.sqlite"
upgrade_data = root / "upgrade-user-data" / "data" / "material-studio.sqlite"
rollback_data = root / "rollback-user-data" / "data" / "material-studio.sqlite"


def inspect(path: Path) -> dict[str, object]:
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
    try:
        connection.execute("PRAGMA query_only = ON")
        return {
            "integrity": connection.execute("PRAGMA integrity_check").fetchone()[0],
            "schemaVersion": connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0],
            "dramas": connection.execute("SELECT COUNT(*) FROM dramas").fetchone()[0],
            "episodes": connection.execute("SELECT COUNT(*) FROM episodes").fetchone()[0],
            "materials": connection.execute("SELECT COUNT(*) FROM generated_materials").fetchone()[0],
        }
    finally:
        connection.close()


def backup(source_path: Path, destination_path: Path) -> None:
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    source = sqlite3.connect(source_path.resolve().as_uri() + "?mode=ro", uri=True, timeout=30)
    source.execute("PRAGMA query_only = ON")
    destination = sqlite3.connect(destination_path)
    try:
        source.backup(destination, pages=512, sleep=0.05)
    finally:
        destination.close()
        source.close()


if mode == "prepare":
    live = Path(os.environ["APPDATA"]) / "ShortDramaMaterialStudio" / "data" / "material-studio.sqlite"
    backup(live, original)
    backup(original, upgrade_data)
    print(json.dumps({"snapshot": inspect(original), "isolatedCopy": inspect(upgrade_data), "snapshotSha256": hashlib.sha256(original.read_bytes()).hexdigest()}))
elif mode == "restore":
    backup(original, rollback_data)
    print(json.dumps({"snapshot": inspect(original), "restored": inspect(rollback_data), "snapshotSha256": hashlib.sha256(original.read_bytes()).hexdigest(), "restoredSha256": hashlib.sha256(rollback_data.read_bytes()).hexdigest()}))
else:
    raise SystemExit("Unknown rehearsal mode")
