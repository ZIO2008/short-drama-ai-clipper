#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import csv
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIAGNOSTICS_DIR = ROOT / "diagnostics"


def load_json(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return default


def port_open(host, port, timeout=0.8):
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def get_url(url, timeout=2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def post_json(url, payload=None, timeout=2.0):
    try:
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def get_json_url(url, timeout=2.0):
    status_code, body = get_url(url, timeout)
    if status_code != 200:
        return status_code, body, {}
    try:
        return status_code, body, json.loads(body)
    except Exception:
        return status_code, body, {}


def build_status(port=8788, host="127.0.0.1"):
    running = port_open(host, port)
    version = load_json(ROOT / "VERSION.json", {})
    state = load_json(ROOT / "review_state.json", {})
    settings = load_json(ROOT / "settings.json", {})
    api_status, api_body = get_url(f"http://{host}:{port}/api/version") if running else (0, "server not running")
    if running:
        state_status, _, api_state = get_json_url(f"http://{host}:{port}/api/state", timeout=3.0)
        if state_status == 200 and api_state:
            state = api_state
    return {
        "running": running,
        "host": host,
        "port": port,
        "url": f"http://{host}:{port}",
        "api_status": api_status,
        "api_version_response": api_body[:500],
        "version": version.get("version", "unknown"),
        "project_name": state.get("project_name", "none"),
        "clips": len(state.get("clips", [])),
        "confirmed": len([clip for clip in state.get("clips", []) if clip.get("status") == "confirmed"]),
        "settings_provider": (settings.get("model") or {}).get("provider", "unknown"),
        "python": sys.executable,
    }


def status(port=8788, host="127.0.0.1"):
    result = build_status(port, host)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def start(port=8788, host="127.0.0.1", wait_seconds=5.0):
    if port_open(host, port):
        result = build_status(port, host)
        result["ok"] = True
        result["message"] = "server already running"
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return result
    log_dir = Path(tempfile.gettempdir()) / "shortdrama-ai-clipping-tool"
    log_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = log_dir / f"review_server_{port}.out.log"
    stderr_path = log_dir / f"review_server_{port}.err.log"
    with stdout_path.open("ab") as stdout, stderr_path.open("ab") as stderr:
        subprocess.Popen(
            [sys.executable, str(ROOT / "review_server.py"), "--host", host, "--port", str(port)],
            cwd=str(ROOT),
            stdout=stdout,
            stderr=stderr,
            stdin=subprocess.DEVNULL,
            close_fds=True,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        if port_open(host, port):
            result = build_status(port, host)
            result["ok"] = True
            result["message"] = "server started"
            result["stdout_log"] = str(stdout_path)
            result["stderr_log"] = str(stderr_path)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return result
        time.sleep(0.2)
    result = {
        "ok": False,
        "running": False,
        "host": host,
        "port": port,
        "url": f"http://{host}:{port}",
        "message": "server did not start before timeout",
        "stdout_log": str(stdout_path),
        "stderr_log": str(stderr_path),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def stop(port=8788, host="127.0.0.1"):
    if port_open(host, port):
        shutdown_status, shutdown_body = post_json(f"http://{host}:{port}/api/dev/shutdown", {})
        if shutdown_status == 200:
            for _ in range(20):
                time.sleep(0.2)
                if not port_open(host, port):
                    result = {
                        "ok": True,
                        "port": int(port),
                        "host": host,
                        "message": "server stopped by local shutdown endpoint",
                        "shutdown_response": shutdown_body[:500],
                    }
                    print(json.dumps(result, ensure_ascii=False, indent=2))
                    return result
            result = {
                "ok": False,
                "port": int(port),
                "host": host,
                "message": "shutdown endpoint responded but server is still running",
                "shutdown_response": shutdown_body[:500],
            }
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return result
    if os.name != "nt":
        print("stop is currently implemented for Windows netstat/taskkill only")
        return {"ok": False, "message": "unsupported platform"}
    netstat = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    pids = set()
    port_marker = f":{int(port)}"
    for line in (netstat.stdout or "").splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        local_address = parts[1]
        state = parts[3] if len(parts) >= 5 else ""
        pid = parts[-1]
        if local_address.endswith(port_marker) and state.upper() == "LISTENING" and pid.isdigit():
            pids.add(pid)
    results = []
    for pid in sorted(pids, key=int):
        completed = subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        results.append({
            "pid": pid,
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        })
    ok = bool(pids) and all(item["returncode"] == 0 for item in results)
    result = {
        "ok": ok,
        "port": int(port),
        "pids": sorted(pids, key=int),
        "results": results,
        "message": "server stopped" if ok else ("stop failed; permission may be required" if pids else "no listening server found"),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_state_summary(path):
    state = load_json(ROOT / "review_state.json", {})
    clips = state.get("clips", [])
    rows = []
    for clip in clips:
        rows.append({
            "id": clip.get("id", ""),
            "episode": clip.get("episode", ""),
            "status": clip.get("status", ""),
            "review_status": clip.get("review_status", "pending"),
            "start": clip.get("start", ""),
            "end": clip.get("end", ""),
            "source_video": clip.get("source_video", ""),
        })
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["id", "episode", "status", "review_status", "start", "end", "source_video"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def diagnostics():
    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bundle_dir = DIAGNOSTICS_DIR / f"diagnostics_{stamp}"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "platform": platform.platform(),
        "python": sys.executable,
        "cwd": str(ROOT),
        "status": status(),
    }
    write_json(bundle_dir / "environment.json", snapshot)
    for filename in ["VERSION.json", "settings.json", "review_state.json", "PROJECT_EXECUTION_PLAN.md", "CHANGELOG.md"]:
        src = ROOT / filename
        if src.exists():
            shutil.copy2(src, bundle_dir / filename)
    write_state_summary(bundle_dir / "clip_state_summary.csv")
    if (ROOT / "logs").exists():
        target_logs = bundle_dir / "logs"
        target_logs.mkdir(exist_ok=True)
        for log_file in (ROOT / "logs").glob("*"):
            if log_file.is_file():
                shutil.copy2(log_file, target_logs / log_file.name)
    zip_path = DIAGNOSTICS_DIR / f"diagnostics_{stamp}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in bundle_dir.rglob("*"):
            archive.write(item, item.relative_to(bundle_dir.parent))
    result = {"ok": True, "folder": str(bundle_dir), "zip": str(zip_path)}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description="Short Drama AI Review Studio local app control")
    sub = parser.add_subparsers(dest="command", required=True)
    status_parser = sub.add_parser("status")
    status_parser.add_argument("--host", default="127.0.0.1")
    status_parser.add_argument("--port", type=int, default=8788)
    start_parser = sub.add_parser("start")
    start_parser.add_argument("--host", default="127.0.0.1")
    start_parser.add_argument("--port", type=int, default=8788)
    start_parser.add_argument("--wait-seconds", type=float, default=5.0)
    stop_parser = sub.add_parser("stop")
    stop_parser.add_argument("--host", default="127.0.0.1")
    stop_parser.add_argument("--port", type=int, default=8788)
    sub.add_parser("diagnostics")
    args = parser.parse_args()
    if args.command == "status":
        status(args.port, args.host)
    elif args.command == "start":
        start(args.port, args.host, args.wait_seconds)
    elif args.command == "stop":
        stop(args.port, args.host)
    elif args.command == "diagnostics":
        diagnostics()


if __name__ == "__main__":
    main()
