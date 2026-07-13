#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import base64
import copy
import csv
import hashlib
import hmac
import io
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
import urllib.parse
import urllib.request
import zipfile
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

try:
    import cgi
except ModuleNotFoundError:
    cgi = None

ROOT = Path(__file__).resolve().parent
RUNTIME_ROOT = Path(os.environ.get("SHORTDRAMA_RUNTIME_ROOT") or ROOT).resolve()
USER_CONFIG_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "ShortDramaAIClippingTool"
OUTPUT_ROOT = USER_CONFIG_DIR / "output"
FFMPEG = RUNTIME_ROOT / "models" / "ffmpeg.exe"
LEGACY_STATE_PATH = ROOT / "review_state.json"
STATE_PATH = USER_CONFIG_DIR / "review_state.json"
VERSION_PATH = ROOT / "VERSION.json"
DEFAULT_APP_VERSION = "8.38.1"
LEGACY_SETTINGS_PATH = ROOT / "settings.json"
SETTINGS_PATH = USER_CONFIG_DIR / "settings.json"
LEGACY_ENV_PATH = ROOT / "settings.local.env"
RUNTIME_STATE_PATH = USER_CONFIG_DIR / "review_state.json"
USER_ENV_PATH = USER_CONFIG_DIR / "settings.local.env"
LOCAL_ENV_PATH = USER_ENV_PATH
ROOT_INSTANCE_ID = hashlib.sha1(str(ROOT).encode("utf-8")).hexdigest()[:12]
RUNTIME_FALLBACK_DIR = Path(tempfile.gettempdir()) / "short_drama_ai_clipping_tool" / ROOT_INSTANCE_ID
RUNTIME_ENV_FALLBACK_PATH = RUNTIME_FALLBACK_DIR / "settings.local.env"
RUNTIME_STATE_FALLBACK_PATH = RUNTIME_FALLBACK_DIR / "review_state.json"
RUNTIME_SETTINGS_OVERRIDE = {}
RUNTIME_ACTIVE_STATE = None
LOG_DIR = USER_CONFIG_DIR / "logs"
DIAGNOSTICS_DIR = USER_CONFIG_DIR / "diagnostics"
RULE_PROFILES_DIR = USER_CONFIG_DIR / "rule_profiles"
TMP_DIR = USER_CONFIG_DIR / "tmp"
LEGACY_PROJECTS_ROOT = ROOT / "review_projects"
RUNTIME_PROJECTS_ROOT = USER_CONFIG_DIR / "review_projects"
PROJECTS_ROOT = Path(os.environ.get("SHORTDRAMA_PROJECTS_ROOT") or RUNTIME_PROJECTS_ROOT).resolve()
ASSETS_DIR = "originals"
PROXIES_DIR = "proxies"
TRASH_DIR = "_trash"
HISTORY_DIR = "history"
MAX_HISTORY_SNAPSHOTS = 80
TASK_DEFS = [("create_project", "\u65b0\u5efa\u9879\u76ee"), ("import_assets", "\u5bfc\u5165\u7d20\u6750"), ("start_clipping", "\u5f00\u59cb\u5207\u7247"), ("review_clips", "\u5ba1\u7247\u786e\u8ba4"), ("export_clips", "\u5bfc\u51fa\u6210\u7247")]
for _runtime_dir in [OUTPUT_ROOT, LOG_DIR, DIAGNOSTICS_DIR, RULE_PROFILES_DIR, TMP_DIR, PROJECTS_ROOT]:
    try:
        _runtime_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
PROJECT_TEMPLATES = [
    {
        "id": "custom",
        "name": "Custom manual plan",
        "description": "Operator sets episode scope and clip counts manually.",
        "episode_scope": "",
        "default_clip_count": 3,
        "episode_counts": {},
        "prompt_preset": "commercial_complete_scene",
    },
    {
        "id": "first_3",
        "name": "First 3 episodes",
        "description": "Fast test delivery: EP1 has more information density, EP2-EP3 keep standard volume.",
        "episode_scope": "\u524d3\u96c6",
        "default_clip_count": 3,
        "episode_counts": {"1": 5, "2": 3, "3": 3},
        "prompt_preset": "commercial_complete_scene",
    },
    {
        "id": "first_5",
        "name": "First 5 episodes",
        "description": "Common small delivery batch for early paid traffic testing.",
        "episode_scope": "\u524d5\u96c6",
        "default_clip_count": 3,
        "episode_counts": {"1": 5, "2": 3, "3": 3, "4": 3, "5": 3},
        "prompt_preset": "commercial_complete_scene",
    },
    {
        "id": "first_10",
        "name": "First 10 episodes",
        "description": "Commercial default: enough volume for delivery while staying focused on high-density early episodes.",
        "episode_scope": "\u524d10\u96c6",
        "default_clip_count": 3,
        "episode_counts": {"1": 5, "2": 3, "3": 3, "4": 3, "5": 3, "6": 3, "7": 3, "8": 3, "9": 3, "10": 3},
        "prompt_preset": "commercial_complete_scene",
    },
]
AI_JOBS = {}
AI_JOBS_LOCK = threading.Lock()
MEDIA_PRECOMPUTE_JOBS = {}
MEDIA_PRECOMPUTE_JOBS_LOCK = threading.Lock()
PREVIEW_PREPARE_JOBS = {}
PREVIEW_PREPARE_JOBS_LOCK = threading.Lock()
VIDEO_CODEC_CACHE = {}
VIDEO_CODEC_CACHE_LOCK = threading.Lock()
TRANSCRIPT_JOBS = {}
TRANSCRIPT_JOBS_LOCK = threading.Lock()
CLIPPING_JOBS = {}
CLIPPING_JOBS_LOCK = threading.Lock()



def load_env_file(env_path, override=False):
    env_path = Path(env_path)
    if not env_path.exists():
        return {}
    loaded = {}
    try:
        for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and (override or key not in os.environ):
                os.environ[key] = value
                loaded[key] = value
    except Exception:
        return loaded
    return loaded


def load_local_env():
    load_env_file(ROOT / ".env", override=False)
    load_env_file(LEGACY_ENV_PATH, override=True)
    load_env_file(USER_ENV_PATH, override=True)
    load_env_file(RUNTIME_ENV_FALLBACK_PATH, override=True)


load_local_env()



def json_response(handler, data, status=200):
    body = json.dumps(sanitize_json_value(data), ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def sanitize_json_value(value):
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {key: sanitize_json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_json_value(item) for item in value]
    return value


def text_response(handler, text, status=200, content_type="text/plain; charset=utf-8"):
    body = text.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def redirect_response(handler, location, status=302):
    handler.send_response(status)
    handler.send_header("Location", location)
    handler.send_header("Content-Length", "0")
    handler.end_headers()


CLIENT_DISCONNECT_ERRORS = (BrokenPipeError, ConnectionAbortedError, ConnectionResetError)


def is_client_disconnect(exc):
    return isinstance(exc, CLIENT_DISCONNECT_ERRORS)


def send_file_response(handler, file_path, content_type=None, chunk_size=1024 * 1024):
    file_path = Path(file_path)
    size = file_path.stat().st_size
    range_header = handler.headers.get("Range")
    content_type = content_type or mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    start = 0
    end = size - 1
    status = 200
    if range_header:
        try:
            raw_start, raw_end = range_header.replace("bytes=", "", 1).split("-", 1)
            start = int(raw_start or 0)
            end = int(raw_end or size - 1)
        except Exception:
            start = 0
            end = size - 1
        start = max(0, min(start, max(0, size - 1)))
        end = max(start, min(end, max(0, size - 1)))
        status = 206
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Accept-Ranges", "bytes")
    if status == 206:
        handler.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        handler.send_header("Content-Length", str(end - start + 1))
    else:
        handler.send_header("Content-Length", str(size))
    handler.end_headers()
    remaining = end - start + 1
    with open(file_path, "rb") as source:
        source.seek(start)
        while remaining > 0:
            data = source.read(min(chunk_size, remaining))
            if not data:
                break
            handler.wfile.write(data)
            remaining -= len(data)


class MultipartItem:
    def __init__(self, filename="", value=b""):
        self.filename = filename
        self.file = io.BytesIO(value)
        self.value = value


class MultipartForm(dict):
    def getfirst(self, key, default=""):
        value = self.get(key, default)
        if isinstance(value, list):
            value = value[0] if value else default
        if isinstance(value, MultipartItem):
            try:
                return value.value.decode("utf-8")
            except UnicodeDecodeError:
                return default
        return value


def parse_content_disposition(value):
    result = {}
    for part in str(value or "").split(";"):
        if "=" not in part:
            continue
        key, raw = part.strip().split("=", 1)
        result[key.lower()] = raw.strip().strip('"')
    return result


def parse_multipart_form(handler):
    if cgi is not None:
        return cgi.FieldStorage(fp=handler.rfile, headers=handler.headers, environ={"REQUEST_METHOD": "POST", "CONTENT_TYPE": handler.headers.get("Content-Type")})
    content_type = handler.headers.get("Content-Type", "")
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not match:
        return MultipartForm()
    boundary = match.group("boundary").strip().strip('"').encode("utf-8")
    length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(length)
    delimiter = b"--" + boundary
    form = MultipartForm()
    for chunk in raw_body.split(delimiter):
        chunk = chunk.strip()
        if not chunk or chunk == b"--":
            continue
        if chunk.endswith(b"--"):
            chunk = chunk[:-2].strip()
        if b"\r\n\r\n" not in chunk:
            continue
        raw_headers, value = chunk.split(b"\r\n\r\n", 1)
        if value.endswith(b"\r\n"):
            value = value[:-2]
        headers = {}
        for line in raw_headers.decode("utf-8", "replace").split("\r\n"):
            if ":" in line:
                key, header_value = line.split(":", 1)
                headers[key.lower()] = header_value.strip()
        disposition = parse_content_disposition(headers.get("content-disposition", ""))
        name = disposition.get("name", "")
        if not name:
            continue
        filename = disposition.get("filename", "")
        item = MultipartItem(filename, value) if filename else value.decode("utf-8", "replace")
        if name in form:
            current = form[name]
            if isinstance(current, list):
                current.append(item)
            else:
                form[name] = [current, item]
        else:
            form[name] = item
    return form


def latest_delivery_base():
    candidates = [p for p in OUTPUT_ROOT.iterdir() if (p / "delivery_30").is_dir()]
    if not candidates:
        candidates = [p for p in OUTPUT_ROOT.iterdir() if (p / "candidate_workflow").is_dir()]
    if not candidates:
        raise FileNotFoundError("未找到可用的 output 目录")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def load_source_videos(base):
    summary = base / "candidate_workflow" / "production_summary.json"
    by_ep = {}
    if summary.exists():
        data = json.loads(summary.read_text(encoding="utf-8"))
        for item in data.get("summary", []):
            by_ep[int(item["episode"])] = item["video"]
    return by_ep


def load_version():
    if VERSION_PATH.exists():
        return json.loads(VERSION_PATH.read_text(encoding="utf-8-sig"))
    return {"name": "短剧AI切片审片台", "version": DEFAULT_APP_VERSION}



def default_settings():
    return {
        "app": {"host": "127.0.0.1", "port": 8788, "open_browser": True},
        "model": {
            "provider": "deepseek",
            "display_name": "DeepSeek",
            "base_url": "",
            "api_key_env": "DEEPSEEK_API_KEY",
            "model_name": "deepseek-chat",
            "proxy_url": "",
        },
        "asr": {
            "provider": "",
            "display_name": "",
            "base_url": "",
            "api_key_env": "",
            "model_name": "",
            "proxy_url": "",
            "secret_env": "",
            "app_id_env": "",
            "mode": "",
        },
        "prompts": {
            "clip_selection": "Find complete, high-conflict short-drama scenes. Do not burn subtitles or watermarks.",
            "quality_check": "Check whether a clip cuts dialogue, leaks into the next scene, or lacks a clear hook.",
            "reselect_complete": "Prefer full-scene completeness and protect the first and last dialogue lines.",
            "reselect_hook": "Prefer a stronger hook while keeping the scene understandable.",
        },
        "export": {"burn_subtitles": False, "default_only_ready": False},
    }


def load_settings():
    settings = default_settings()
    settings_source = SETTINGS_PATH if SETTINGS_PATH.exists() else LEGACY_SETTINGS_PATH
    if settings_source.exists():
        try:
            saved = json.loads(settings_source.read_text(encoding="utf-8-sig"))
            for section, values in saved.items():
                if isinstance(values, dict) and isinstance(settings.get(section), dict):
                    settings[section].update(values)
                else:
                    settings[section] = values
        except Exception as exc:
            settings["_load_error"] = str(exc)
    for section, values in RUNTIME_SETTINGS_OVERRIDE.items():
        if isinstance(values, dict) and isinstance(settings.get(section), dict):
            settings[section].update(values)
        else:
            settings[section] = values
    return settings


def write_json_atomic(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        os.replace(str(temp_path), str(path))
    except PermissionError:
        temp_path.unlink(missing_ok=True)
        raise


def save_settings(payload):
    global RUNTIME_SETTINGS_OVERRIDE
    settings = load_settings()
    for section, values in (payload or {}).items():
        if str(section).startswith("_"):
            continue
        if isinstance(values, dict) and isinstance(settings.get(section), dict):
            settings[section].update(values)
        else:
            settings[section] = values
    try:
        write_json_atomic(SETTINGS_PATH, settings)
    except PermissionError as exc:
        RUNTIME_SETTINGS_OVERRIDE = settings
        settings["_save_warning"] = f"设置已在本次运行中生效，但写入 settings.json 失败：{exc}"
    return settings


SAFE_ENV_KEYS = {
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
    "XFYUN_ASR_APP_ID",
    "XFYUN_ASR_API_KEY",
    "XFYUN_ASR_API_SECRET",
    "TENCENT_ASR_SECRET_ID",
    "TENCENT_ASR_SECRET_KEY",
    "HTTPS_PROXY",
    "HTTP_PROXY",
}


def mask_secret(value):
    value = str(value or "")
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}…{value[-4:]}"


def env_status_payload():
    keys = sorted(SAFE_ENV_KEYS)
    return {
        "ok": True,
        "keys": {key: {"configured": bool(os.environ.get(key, "")), "masked": mask_secret(os.environ.get(key, ""))} for key in keys},
        "settings": load_settings(),
        "asr_catalog": asr_provider_catalog(),
        "env_store": env_store_status(),
    }


def read_env_key_values(env_path):
    env_path = Path(env_path)
    existing = {}
    order = []
    if not env_path.exists():
        return existing, order
    for raw_line in env_path.read_text(encoding="utf-8-sig", errors="replace").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in existing:
            order.append(key)
        existing[key] = value.strip()
    return existing, order


def write_env_key_values(env_path, values):
    env_path = Path(env_path)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    existing, order = read_env_key_values(env_path)
    for key, value in values.items():
        if key not in existing:
            order.append(key)
        existing[key] = value
    lines = [f"{key}={existing[key]}" for key in order if key in existing and existing[key]]
    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return env_path


def env_store_status():
    stores = []
    for label, env_path in (("project_env", ROOT / ".env"), ("legacy_env", LEGACY_ENV_PATH), ("user_env", USER_ENV_PATH), ("runtime_env", RUNTIME_ENV_FALLBACK_PATH)):
        env_path = Path(env_path)
        stores.append({"id": label, "path": str(env_path), "exists": env_path.exists()})
    return stores


def save_env_settings(payload):
    values = {}
    for key, value in (payload or {}).items():
        key = str(key or "").strip()
        if key not in SAFE_ENV_KEYS:
            continue
        value = str(value or "").strip()
        if value:
            values[key] = value
    if not values:
        return env_status_payload()

    for key, value in values.items():
        os.environ[key] = value
    errors = []
    saved_path = None
    for env_path in (USER_ENV_PATH, RUNTIME_ENV_FALLBACK_PATH):
        try:
            saved_path = write_env_key_values(env_path, values)
            break
        except PermissionError as exc:
            errors.append(f"{env_path}: {exc}")
        except OSError as exc:
            errors.append(f"{env_path}: {exc}")
    if not saved_path:
        raise PermissionError("无法写入任何本地配置文件：" + "；".join(errors))
    payload = env_status_payload()
    payload["saved_to"] = str(saved_path)
    if errors:
        payload["warning"] = "主配置文件不可写，已改存到本地配置文件。"
        payload["write_errors"] = errors
    return payload


def asr_required_env_names(provider):
    names = []
    api_key_env = provider.get("api_key_env") or ""
    secret_env = provider.get("secret_env") or ""
    app_id_env = provider.get("app_id_env") or ""
    if api_key_env:
        names.append(api_key_env)
    if provider.get("requires_secret") and secret_env:
        names.append(secret_env)
    if provider.get("requires_app_id") and app_id_env:
        names.append(app_id_env)
    return names


def asr_missing_env_names(provider):
    return [name for name in asr_required_env_names(provider) if not os.environ.get(name, "")]


def infer_default_asr_provider():
    for provider_id in ("tencent", "xfyun", "openai"):
        preset = ASR_PROVIDER_PRESETS.get(provider_id, {})
        if preset and not asr_missing_env_names(preset):
            return provider_id
    return "openai"


def asr_provider_catalog():
    settings = load_settings()
    current = (settings.get("asr", {}).get("provider") or infer_default_asr_provider()).lower()
    providers = []
    for provider_id, preset in ASR_PROVIDER_PRESETS.items():
        item = dict(preset)
        missing = asr_missing_env_names(item)
        item["id"] = provider_id
        item["selected"] = provider_id == current
        item["has_api_key"] = bool(os.environ.get(item.get("api_key_env") or "", ""))
        item["has_secret"] = bool(os.environ.get(item.get("secret_env") or "", "")) if item.get("secret_env") else True
        item["has_app_id"] = bool(os.environ.get(item.get("app_id_env") or "", "")) if item.get("app_id_env") else True
        item["missing_env"] = missing
        item["ready_for_single_asset"] = not missing and item.get("implementation") == "single_asset_transcription_ready"
        providers.append(item)
    return {"ok": True, "current": current, "providers": providers, "local_asr": {"ready": bool(transcript_engine_status().get("available")), "engine": transcript_engine_status()}}


def apply_asr_provider(provider_id):
    global RUNTIME_SETTINGS_OVERRIDE
    provider = (provider_id or "").lower().strip()
    if provider not in ASR_PROVIDER_PRESETS:
        raise ValueError(f"未知 ASR 服务商：{provider_id}")
    settings = load_settings()
    previous = dict(settings.get("asr", {}))
    preset = dict(ASR_PROVIDER_PRESETS[provider])
    settings["asr"] = {
        **previous,
        "provider": preset["provider"],
        "display_name": preset["display_name"],
        "base_url": preset.get("base_url", ""),
        "api_key_env": preset.get("api_key_env", ""),
        "secret_env": preset.get("secret_env", ""),
        "app_id_env": preset.get("app_id_env", ""),
        "model_name": preset.get("model_name", ""),
        "mode": preset.get("mode", ""),
    }
    warning = ""
    try:
        write_json_atomic(SETTINGS_PATH, settings)
    except PermissionError as exc:
        RUNTIME_SETTINGS_OVERRIDE = settings
        warning = f"设置已在本次运行中生效，但写入 settings.json 失败：{exc}"
    return {"ok": True, "settings": settings, "provider": preset, "catalog": asr_provider_catalog(), "warning": warning}


def asr_current_provider(settings=None):
    settings = settings or load_settings()
    asr = settings.get("asr", {})
    provider = (asr.get("provider") or infer_default_asr_provider()).lower()
    preset = dict(ASR_PROVIDER_PRESETS.get(provider, {}))
    preset.update({key: value for key, value in asr.items() if value not in (None, "")})
    preset.setdefault("provider", provider)
    preset.setdefault("display_name", provider.upper())
    preset.setdefault("implementation", "custom_config")
    return preset


def check_domestic_asr_config(provider):
    api_key_env = provider.get("api_key_env") or "ASR_API_KEY"
    secret_env = provider.get("secret_env") or ""
    app_id_env = provider.get("app_id_env") or ""
    missing = []
    if not os.environ.get(api_key_env, ""):
        missing.append(api_key_env)
    if provider.get("requires_secret") and secret_env and not os.environ.get(secret_env, ""):
        missing.append(secret_env)
    if provider.get("requires_app_id") and app_id_env and not os.environ.get(app_id_env, ""):
        missing.append(app_id_env)
    if missing:
        return {
            "ok": False,
            "stage": "api_key",
            "provider": provider.get("provider"),
            "display_name": provider.get("display_name"),
            "detail": "缺少国内 ASR 服务商配置：" + ", ".join(missing),
            "fix": "请先在 .env 或系统环境变量中配置服务商密钥；配置后重启工具再检测。",
            "missing": missing,
            "implementation": provider.get("implementation"),
            "next_step": "当前版本先做配置检测，不会上传视频；真实转写要等官方接口签名与轮询流程确认后再接。",
        }
    endpoint = (provider.get("base_url") or "").strip()
    if not endpoint:
        return {
            "ok": True,
            "stage": "credential_only",
            "provider": provider.get("provider"),
            "display_name": provider.get("display_name"),
            "detail": "密钥变量已存在，但该服务商还没有配置可安全探测的 endpoint。",
            "fix": "下一步需要按官方文档补齐 endpoint、签名、提交任务、轮询结果和时间戳解析。",
            "implementation": provider.get("implementation"),
            "network_checked": False,
        }
    parsed = urlparse(endpoint)
    if not parsed.scheme or not parsed.netloc:
        return {
            "ok": False,
            "stage": "endpoint",
            "provider": provider.get("provider"),
            "display_name": provider.get("display_name"),
            "detail": f"endpoint 格式不正确：{endpoint}",
            "fix": "请检查 settings.json 中 asr.base_url。",
            "implementation": provider.get("implementation"),
        }
    return {
        "ok": True,
        "stage": "endpoint_configured",
        "provider": provider.get("provider"),
        "display_name": provider.get("display_name"),
        "detail": "密钥与 endpoint 已配置，但真实连通性需按服务商签名规则发起专用检测。",
        "fix": "下一步实现该服务商专用签名检测；不要用通用 OPTIONS 冒充成功。",
        "implementation": provider.get("implementation"),
        "network_checked": False,
    }


def export_diagnostics_bundle():
    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    bundle_dir = DIAGNOSTICS_DIR / f"diagnostics_{stamp}"
    bundle_dir.mkdir(parents=True, exist_ok=True)
    report = diagnostic_report()
    state = load_review_state() if STATE_PATH.exists() else {}
    (bundle_dir / "diagnostic_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    for filename in ["VERSION.json", "settings.json", "review_state.json", "PROJECT_EXECUTION_PLAN.md", "CHANGELOG.md"]:
        src = ROOT / filename
        if src.exists():
            shutil.copy2(src, bundle_dir / filename)
    with (bundle_dir / "clip_state_summary.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["id", "episode", "status", "review_status", "start", "end", "duration", "source_video"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for clip in state.get("clips", []):
            writer.writerow({
                "id": clip.get("id", ""),
                "episode": clip.get("episode", ""),
                "status": clip.get("status", ""),
                "review_status": clip.get("review_status", "pending"),
                "start": clip.get("start", ""),
                "end": clip.get("end", ""),
                "duration": round(clip_duration_value(clip), 3),
                "source_video": clip.get("source_video", ""),
            })
    if LOG_DIR.exists():
        target_logs = bundle_dir / "logs"
        target_logs.mkdir(exist_ok=True)
        for item in LOG_DIR.glob("*"):
            if item.is_file():
                shutil.copy2(item, target_logs / item.name)
    zip_path = DIAGNOSTICS_DIR / f"diagnostics_{stamp}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in bundle_dir.rglob("*"):
            archive.write(item, item.relative_to(bundle_dir.parent))
    return {"ok": True, "folder": str(bundle_dir), "zip": str(zip_path), "report": report}


def model_endpoint_url(settings=None):
    settings = settings or load_settings()
    model = settings.get("model", {})
    provider = (model.get("provider") or "deepseek").lower()
    base_url = (model.get("base_url") or "").strip()
    if not base_url:
        base_url = "https://api.openai.com/v1" if provider == "openai" else "https://api.deepseek.com"
    return base_url.rstrip("/") + "/chat/completions"


def urllib_opener_for_model(model):
    if "proxy_url" in model:
        proxy_url = (model.get("proxy_url") or "").strip()
    else:
        proxy_url = (os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or "").strip()
    if proxy_url:
        return urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})), proxy_url
    return urllib.request.build_opener(), ""


def urllib_opener_for_proxy_config(config):
    proxy_url = (config.get("proxy_url") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or "").strip()
    if proxy_url:
        return urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url})), proxy_url
    return urllib.request.build_opener(), ""


def asr_endpoint_url(settings=None):
    settings = settings or load_settings()
    asr = asr_current_provider(settings)
    provider = (asr.get("provider") or "openai").lower()
    base_url = (asr.get("base_url") or "").strip()
    endpoint_path = asr.get("endpoint_path") or "/audio/transcriptions"
    if not base_url:
        base_url = "https://api.openai.com/v1" if provider == "openai" else ""
    if not base_url:
        return ""
    return base_url.rstrip("/") + endpoint_path


def test_asr_connection(settings=None, timeout=12):
    settings = settings or load_settings()
    asr = asr_current_provider(settings)
    provider = (asr.get("provider") or "openai").lower()
    if provider == "xfyun":
        try:
            xfyun_config(asr)
            return {
                "ok": True,
                "stage": "credential",
                "provider": provider,
                "display_name": asr.get("display_name"),
                "detail": "科大讯飞密钥变量已配置；真实连通性会在单素材转写时通过 prepare/upload 流程验证。",
                "implementation": asr.get("implementation"),
                "network_checked": False,
            }
        except Exception as exc:
            return {
                "ok": False,
                "stage": "api_key",
                "provider": provider,
                "display_name": asr.get("display_name"),
                "detail": str(exc),
                "fix": "请检查 .env 中 XFYUN_ASR_APP_ID、XFYUN_ASR_API_KEY、XFYUN_ASR_API_SECRET，并重启工具。",
                "implementation": asr.get("implementation"),
            }
    if provider == "tencent":
        try:
            tencent_config(asr)
            return {
                "ok": True,
                "stage": "credential",
                "provider": provider,
                "display_name": asr.get("display_name"),
                "detail": "腾讯云密钥变量已配置；真实连通性会在单素材转写时通过 SentenceRecognition 验证。",
                "implementation": asr.get("implementation"),
                "network_checked": False,
            }
        except Exception as exc:
            return {
                "ok": False,
                "stage": "api_key",
                "provider": provider,
                "display_name": asr.get("display_name"),
                "detail": str(exc),
                "fix": "请检查 .env 中 TENCENT_ASR_SECRET_ID、TENCENT_ASR_SECRET_KEY，并重启工具。",
                "implementation": asr.get("implementation"),
            }
    if provider != "openai":
        return check_domestic_asr_config(asr)
    api_key_env = asr.get("api_key_env") or ("OPENAI_API_KEY" if provider == "openai" else "ASR_API_KEY")
    api_key = os.environ.get(api_key_env, "")
    endpoint = asr_endpoint_url(settings)
    if not endpoint:
        return {"ok": False, "stage": "endpoint", "detail": "missing ASR endpoint", "provider": provider}
    if not api_key:
        return {
            "ok": False,
            "stage": "api_key",
            "detail": f"missing API key env: {api_key_env}",
            "provider": provider,
            "fix": "在 .env 中配置对应 API key，或改用本地 ASR。若已配置但仍失败，请重启工具。",
        }
    opener, proxy_url = urllib_opener_for_proxy_config(asr)
    request = urllib.request.Request(endpoint, method="OPTIONS", headers={"Authorization": f"Bearer {api_key}"})
    try:
        with opener.open(request, timeout=timeout) as response:
            response.read(512)
        return {"ok": True, "stage": "endpoint", "detail": "ASR endpoint reachable", "provider": provider, "proxy_url": proxy_url}
    except urllib.error.HTTPError as exc:
        if exc.code in (200, 204, 400, 405, 415):
            return {"ok": True, "stage": "endpoint", "detail": f"ASR endpoint responded: HTTP {exc.code}", "provider": provider, "proxy_url": proxy_url}
        return {"ok": False, "stage": "endpoint", "detail": f"HTTP {exc.code}: {exc.reason}", "provider": provider, "proxy_url": proxy_url, "fix": "检查 API key、余额、接口地址；如果网络不通，请检查代理或梯子是否掉线。"}
    except Exception as exc:
        return {"ok": False, "stage": "network", "detail": str(exc), "provider": provider, "proxy_url": proxy_url, "fix": "检查网络、代理或梯子；如果刚切换网络，建议重试。"}


def cloud_transcript_preview(asset_path):
    if not asset_path:
        state = load_review_state()
        assets = effective_assets_for_state(state)
        if not assets:
            raise ValueError("没有可预览的素材")
        asset_path = assets[0].get("path")
    video_path = safe_path(asset_path)
    size = video_path.stat().st_size
    duration = ffprobe_duration(video_path)
    duration_minutes = round(float(duration or 0) / 60.0, 2)
    settings = load_settings()
    asr = asr_current_provider(settings)
    api_key_env = asr.get("api_key_env") or "OPENAI_API_KEY"
    missing_env = asr_missing_env_names(asr)
    has_key = not missing_env
    provider_name = asr.get("display_name") or asr.get("provider", "ASR")
    estimated_upload = "较慢" if size >= 500 * 1024 * 1024 else ("中等" if size >= 100 * 1024 * 1024 else "较快")
    warnings = []
    if missing_env:
        warnings.append(f"{provider_name} 缺少配置：{', '.join(missing_env)}，当前不会上传成功。")
    if size >= 500 * 1024 * 1024:
        warnings.append("文件较大，上传耗时和失败概率会增加。")
    if duration_minutes >= 20:
        warnings.append("视频较长，转写耗时和费用可能明显增加。")
    warnings.append("上传前请确认 API 余额、网络、代理或梯子稳定。")
    return {
        "ok": True,
        "asset": {"filename": video_path.name, "path": str(video_path), "size": size, "size_label": f"{size / 1024 / 1024:.1f} MB", "duration": round(float(duration or 0), 3), "duration_minutes": duration_minutes},
        "asr": {"provider": asr.get("provider", "openai"), "display_name": provider_name, "model": asr.get("model_name", "whisper-1"), "api_key_env": api_key_env, "missing_env": missing_env, "has_key": has_key},
        "estimate": {"upload_speed": estimated_upload, "cost_note": "实际费用以 ASR 服务商计费为准；建议先转写单个素材验证质量。", "time_note": "耗时取决于文件大小、视频时长、网络和服务商排队。"},
        "warnings": warnings,
        "can_start": has_key and asr.get("provider") in ("openai", "xfyun", "tencent"),
    }


ASR_PROVIDER_PRESETS = {
    "local": {
        "provider": "local",
        "display_name": "本地字幕模型",
        "base_url": "",
        "endpoint_path": "",
        "api_key_env": "",
        "model_name": "small",
        "mode": "local_asr",
        "requires_secret": False,
        "requires_app_id": False,
        "requires_object_storage": False,
        "implementation": "local_transcription_ready_when_installed",
        "mainland_note": "无需 API Key，但需要本机安装 whisper/torch 和本地模型。",
    },
    "openai": {
        "provider": "openai",
        "display_name": "OpenAI Whisper API",
        "base_url": "https://api.openai.com/v1",
        "endpoint_path": "/audio/transcriptions",
        "api_key_env": "OPENAI_API_KEY",
        "model_name": "whisper-1",
        "mode": "sync_upload",
        "requires_secret": False,
        "requires_app_id": False,
        "requires_object_storage": False,
        "implementation": "single_asset_transcription_ready",
        "mainland_note": "海外服务，国内网络可能需要代理或梯子；当前用户未配置 OPENAI_API_KEY 时不作为主路径。",
    },
    "volcengine": {
        "provider": "volcengine",
        "display_name": "火山引擎语音识别",
        "base_url": "",
        "endpoint_path": "",
        "api_key_env": "VOLCENGINE_ASR_ACCESS_KEY",
        "secret_env": "VOLCENGINE_ASR_SECRET_KEY",
        "app_id_env": "VOLCENGINE_ASR_APP_ID",
        "model_name": "volcengine-asr",
        "mode": "provider_adapter_pending",
        "requires_secret": True,
        "requires_app_id": False,
        "requires_object_storage": "depends_on_api",
        "implementation": "config_validation_only",
        "mainland_note": "建议优先评估，适合中文视频场景；真实转写需按官方接口确认签名、提交与轮询流程。",
    },
    "xfyun": {
        "provider": "xfyun",
        "display_name": "科大讯飞语音识别",
        "base_url": "https://office-api-ist-dx.iflyaisol.com",
        "endpoint_path": "",
        "api_key_env": "XFYUN_ASR_API_KEY",
        "secret_env": "XFYUN_ASR_API_SECRET",
        "app_id_env": "XFYUN_ASR_APP_ID",
        "model_name": "xfyun-asr-llm",
        "mode": "async_llm_file_transcription",
        "requires_secret": True,
        "requires_app_id": True,
        "requires_object_storage": "depends_on_api",
        "implementation": "single_asset_transcription_ready",
        "mainland_note": "中文语音识别成熟候选；v7.28 使用录音文件转写大模型 WebAPI，上传前仍需二次确认。",
    },
    "aliyun": {
        "provider": "aliyun",
        "display_name": "阿里云智能语音交互",
        "base_url": "",
        "endpoint_path": "",
        "api_key_env": "ALIYUN_ASR_ACCESS_KEY_ID",
        "secret_env": "ALIYUN_ASR_ACCESS_KEY_SECRET",
        "app_id_env": "",
        "model_name": "aliyun-asr",
        "mode": "provider_adapter_pending",
        "requires_secret": True,
        "requires_app_id": False,
        "requires_object_storage": True,
        "implementation": "config_validation_only",
        "mainland_note": "稳定云厂商候选；长视频通常要考虑 OSS/文件 URL、异步任务与轮询。",
    },
    "tencent": {
        "provider": "tencent",
        "display_name": "腾讯云语音识别",
        "base_url": "https://asr.tencentcloudapi.com",
        "endpoint_path": "",
        "api_key_env": "TENCENT_ASR_SECRET_ID",
        "secret_env": "TENCENT_ASR_SECRET_KEY",
        "app_id_env": "",
        "model_name": "tencent-sentence-recognition",
        "mode": "sync_audio_data",
        "requires_secret": True,
        "requires_app_id": False,
        "requires_object_storage": "depends_on_api",
        "implementation": "single_asset_transcription_ready",
        "mainland_note": "国内稳定候选；v7.30 先用短音频同步识别验证，长素材后续接异步录音文件识别或 COS。",
    },
    "baidu": {
        "provider": "baidu",
        "display_name": "百度智能云语音识别",
        "base_url": "",
        "endpoint_path": "",
        "api_key_env": "BAIDU_ASR_API_KEY",
        "secret_env": "BAIDU_ASR_SECRET_KEY",
        "app_id_env": "",
        "model_name": "baidu-asr",
        "mode": "provider_adapter_pending",
        "requires_secret": True,
        "requires_app_id": False,
        "requires_object_storage": "depends_on_api",
        "implementation": "config_validation_only",
        "mainland_note": "国内可替代候选；真实转写需确认 token 获取、长音频限制与时间戳粒度。",
    },
}


def test_model_connection(settings=None, timeout=12):
    settings = settings or load_settings()
    model = settings.get("model", {})
    provider = (model.get("provider") or "deepseek").lower()
    api_key_env = model.get("api_key_env") or ("OPENAI_API_KEY" if provider == "openai" else "DEEPSEEK_API_KEY")
    api_key = os.environ.get(api_key_env, "")
    if not api_key:
        return {"ok": False, "stage": "api_key", "detail": f"missing API key env: {api_key_env}"}
    body = {
        "model": model.get("model_name") or ("gpt-4.1-mini" if provider == "openai" else "deepseek-chat"),
        "messages": [{"role": "user", "content": "Return JSON: {\"ok\": true}"}],
        "temperature": 0,
        "max_tokens": 20,
    }
    opener, proxy_url = urllib_opener_for_model(model)
    request = urllib.request.Request(
        model_endpoint_url(settings),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            response.read(4096)
        return {"ok": True, "stage": "chat_completions", "detail": "model endpoint reachable", "proxy_url": proxy_url}
    except Exception as exc:
        return {"ok": False, "stage": "chat_completions", "detail": str(exc), "proxy_url": proxy_url}


def autodetect_model_proxy(save=False):
    settings = load_settings()
    model = dict(settings.get("model", {}))
    candidates = []
    existing = (model.get("proxy_url") or "").strip()
    env_https = (os.environ.get("HTTPS_PROXY") or "").strip()
    env_http = (os.environ.get("HTTP_PROXY") or "").strip()
    for candidate in (existing, env_https, env_http):
        if candidate:
            candidates.append(candidate)
    candidates.extend([
        "",
        "http://127.0.0.1:7890",
        "http://127.0.0.1:7891",
        "http://127.0.0.1:7892",
        "http://127.0.0.1:7897",
        "http://127.0.0.1:10809",
        "http://127.0.0.1:1080",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:33210",
    ])
    seen = set()
    results = []
    selected = None
    for proxy_url in candidates:
        if proxy_url in seen:
            continue
        seen.add(proxy_url)
        test_settings = json.loads(json.dumps(settings, ensure_ascii=False))
        test_settings.setdefault("model", {})["proxy_url"] = proxy_url
        result = test_model_connection(test_settings, timeout=6)
        result["candidate"] = proxy_url or "direct"
        results.append(result)
        if result.get("ok"):
            selected = proxy_url
            break
    if save and selected is not None:
        settings.setdefault("model", {})["proxy_url"] = selected
        save_settings({"model": settings["model"]})
    return {
        "ok": selected is not None,
        "selected_proxy_url": selected if selected is not None else "",
        "saved": bool(save and selected is not None),
        "results": results,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def diagnostic_report():
    settings = load_settings()
    checks = []
    def add(name, ok, detail=""):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})
    add("root", ROOT.exists(), str(ROOT))
    add("ffmpeg", Path(ffmpeg_bin()).exists() or ffmpeg_bin() == "ffmpeg", ffmpeg_bin())
    add("state", STATE_PATH.exists(), str(STATE_PATH))
    add("settings", SETTINGS_PATH.exists(), str(SETTINGS_PATH))
    add("projects_dir", PROJECTS_ROOT.exists(), str(PROJECTS_ROOT))
    add("logs_dir", LOG_DIR.exists(), str(LOG_DIR))
    model = settings.get("model", {})
    api_key_env = model.get("api_key_env", "")
    add("model_provider", bool(model.get("provider")), model.get("provider", ""))
    add("api_key_env", bool(os.environ.get(api_key_env)) if api_key_env else False, api_key_env or "not configured")
    add("model_endpoint", bool(model_endpoint_url(settings)), model_endpoint_url(settings))
    add("proxy_url", bool(model.get("proxy_url") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")), model.get("proxy_url") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or "not configured")
    model_test = test_model_connection(settings, timeout=12)
    add("model_connection", model_test.get("ok"), model_test.get("detail", ""))
    state = load_review_state() if STATE_PATH.exists() else {}
    add("active_project", bool(state.get("project_name")), state.get("project_name", "none"))
    required = [item for item in checks if item["name"] not in ("api_key_env", "logs_dir", "settings", "proxy_url", "model_connection")]
    analytics = {}
    try:
        analytics = analytics_summary(state) if state else {}
    except Exception as exc:
        analytics = {"error": str(exc)}
    return {"ok": all(item["ok"] for item in required), "checks": checks, "settings": settings, "version": load_version(), "analytics": analytics, "model_test": model_test}


def default_tasks():
    return [{"key": key, "label": label, "status": "pending", "progress": 0, "message": ""} for key, label in TASK_DEFS]


def task_map(state):
    tasks = {item["key"]: item for item in default_tasks()}
    for item in state.get("tasks", []):
        key = item.get("key")
        if key in tasks:
            tasks[key].update(item)
    return tasks


def set_task(state, key, status, progress=None, message=""):
    tasks = task_map(state)
    if key not in tasks:
        return None
    tasks[key]["status"] = status
    if progress is not None:
        tasks[key]["progress"] = int(progress)
    if message:
        tasks[key]["message"] = message
    tasks[key]["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    state["tasks"] = [tasks[key] for key, _ in TASK_DEFS]
    return tasks[key]


def source_identity_from_filename(filename, fallback_episode=1):
    stem = Path(filename or "").stem.strip()
    match = re.match(r"^第\s*0*(\d{1,3})\s*集\s*(.*)$", stem, re.IGNORECASE)
    if not match:
        match = re.match(r"^EP\s*0*(\d{1,3})(?:\s*集)?\s*(.*)$", stem, re.IGNORECASE)
    if not match:
        match = re.match(r"^0*(\d{1,3})(?=$|[\s._\-—（(【\[])(.*)$", stem)
    source_episode = int(fallback_episode or 1)
    variant = ""
    if match:
        parsed_episode = int(match.group(1) or 0)
        if 1 <= parsed_episode <= 999:
            source_episode = parsed_episode
            variant = str(match.group(2) or "").strip(" \t._-—()（）[]【】")
    label = f"第{source_episode:02d}集"
    if variant:
        label += f" · {variant}"
    export_prefix = f"第{source_episode:02d}集"
    if variant:
        export_prefix += f"_{safe_project_name(variant)}"
    return {
        "source_episode": source_episode,
        "source_variant": variant,
        "source_label": label,
        "source_export_prefix": export_prefix,
    }


def enrich_asset_source_identity(asset):
    identity = source_identity_from_filename(
        asset.get("filename") or Path(asset.get("path") or "").name,
        asset.get("episode") or 1,
    )
    asset.update(identity)
    return asset


def source_identity_for_clip(state, clip):
    source_path = str(Path(clip.get("source_video") or "").resolve()).lower() if clip.get("source_video") else ""
    asset = next((
        item for item in state.get("assets", [])
        if source_path and str(Path(item.get("path") or "").resolve()).lower() == source_path
    ), None)
    if asset is None:
        asset = next((item for item in state.get("assets", []) if int(item.get("episode") or 0) == int(clip.get("episode") or 0)), None)
    if asset:
        return source_identity_from_filename(asset.get("filename") or Path(asset.get("path") or "").name, clip.get("episode") or 1)
    return {
        "source_episode": int(clip.get("source_episode") or clip.get("episode") or 1),
        "source_variant": str(clip.get("source_variant") or ""),
        "source_label": str(clip.get("source_label") or f"第{int(clip.get('episode') or 1):02d}集"),
        "source_export_prefix": str(clip.get("source_export_prefix") or f"第{int(clip.get('episode') or 1):02d}集"),
    }


def export_filename_for_clip(state, clip):
    identity = source_identity_for_clip(state, clip)
    clip_index = int(clip.get("clip_index") or 0) + 1
    return f"{identity['source_export_prefix']}_切片{clip_index:02d}.mp4"


def infer_tasks(state):
    tasks = task_map(state)
    if state.get("project_name"):
        tasks["create_project"].update({"status": "done", "progress": 100, "message": "\u9879\u76ee\u5df2\u521b\u5efa"})
    assets = state.get("assets") or []
    if assets:
        tasks["import_assets"].update({"status": "done", "progress": 100, "message": f"\u5df2\u5bfc\u5165 {len(assets)} \u4e2a\u7d20\u6750"})
    clips = state.get("clips") or []
    if clips:
        tasks["start_clipping"].update({"status": "done", "progress": 100, "message": f"\u5df2\u751f\u6210 {len(clips)} \u6761\u5019\u9009"})
    confirmed = len([clip for clip in clips if clip.get("status") == "confirmed"])
    if clips and confirmed:
        tasks["review_clips"].update({"status": "done" if confirmed == len(clips) else "running", "progress": round(confirmed / len(clips) * 100), "message": f"\u5df2\u786e\u8ba4 {confirmed}/{len(clips)} \u6761"})
    if state.get("last_export"):
        tasks["export_clips"].update({"status": "done", "progress": 100, "message": state["last_export"].get("output_dir", "\u5df2\u5bfc\u51fa")})
    state["tasks"] = [tasks[key] for key, _ in TASK_DEFS]
    return state["tasks"]


def ensure_state_defaults(state):
    state.setdefault("clips", [])
    state.setdefault("assets", [])
    for asset in state.get("assets", []):
        enrich_asset_source_identity(asset)
    for clip in state.get("clips", []):
        if clip.get("review_status") == "approved" and clip.get("status") not in ("confirmed", "discarded"):
            clip["status"] = "confirmed"
    state.setdefault("workflow_status", "loaded")
    state.setdefault("transcript_queue", {
        "id": "",
        "status": "idle",
        "message": "暂无多集字幕队列",
        "items": [],
        "created_at": "",
        "updated_at": "",
    })
    infer_tasks(state)
    return state


def load_review_state(base=None):
    if RUNTIME_ACTIVE_STATE:
        return ensure_state_defaults(json.loads(json.dumps(RUNTIME_ACTIVE_STATE, ensure_ascii=False)))
    if STATE_PATH.exists():
        return ensure_state_defaults(json.loads(STATE_PATH.read_text(encoding="utf-8-sig")))
    if RUNTIME_STATE_FALLBACK_PATH.exists():
        return ensure_state_defaults(json.loads(RUNTIME_STATE_FALLBACK_PATH.read_text(encoding="utf-8-sig")))
    if LEGACY_STATE_PATH.exists():
        return ensure_state_defaults(json.loads(LEGACY_STATE_PATH.read_text(encoding="utf-8-sig")))
    try:
        base = base or latest_delivery_base()
    except FileNotFoundError:
        return ensure_state_defaults({
            "project_name": "",
            "project_kind": "empty",
            "source_root": "",
            "base_dir": "",
            "output_dir": str((OUTPUT_ROOT / "review_exports").resolve()),
            "assets": [],
            "clips": [],
            "workflow_status": "empty",
        })
    return build_initial_state(base)


def build_initial_state(base):
    videos = load_source_videos(base)
    clips = []
    delivery_dir = base / "delivery_30"
    for path in sorted(delivery_dir.glob("*_delivery_30.json"), key=lambda p: int(p.name.split("_")[0])):
        data = json.loads(path.read_text(encoding="utf-8"))
        ep = int(data.get("episode") or path.name.split("_")[0])
        source = videos.get(ep) or str((base / f"{ep}.mp4").resolve())
        for clip in data.get("recommendations", []):
            start = float(clip["start_time"])
            end = float(clip["end_time"])
            clip_id = f"{ep}_{int(clip['clip_index']):02d}"
            clips.append({
                "id": clip_id,
                "episode": ep,
                "clip_index": int(clip["clip_index"]),
                "source_video": source,
                "suggested_start": start,
                "suggested_end": end,
                "start": start,
                "end": end,
                "duration": round(end - start, 3),
                "score": clip.get("score"),
                "status": "pending",
                "note": clip.get("delivery_status", ""),
            })
    source_root = ""
    if clips:
        try:
            source_root = str(Path(clips[0]["source_video"]).resolve().parent)
        except Exception:
            source_root = ""
    state = {
        "project_name": base.name,
        "project_kind": "delivery",
        "source_root": source_root,
        "base_dir": str(base.resolve()),
        "output_dir": str((base / "review_exports").resolve()),
        "clips": clips,
    }
    save_state(state)
    return state


def safe_project_name(value):
    name = (value or "review_project").replace("?", "").replace("?", "")[:60]
    name = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "_", name).strip("_")
    return name or "review_project"


def project_dir_for(project_name):
    return PROJECTS_ROOT / safe_project_name(project_name)


def can_write_dir(path):
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / f".write_probe_{uuid.uuid4().hex}"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


def writable_projects_root():
    if can_write_dir(PROJECTS_ROOT):
        return PROJECTS_ROOT
    RUNTIME_PROJECTS_ROOT.mkdir(parents=True, exist_ok=True)
    return RUNTIME_PROJECTS_ROOT


def managed_project_roots():
    roots = [PROJECTS_ROOT]
    if LEGACY_PROJECTS_ROOT.resolve() != PROJECTS_ROOT.resolve() and LEGACY_PROJECTS_ROOT.exists():
        roots.append(LEGACY_PROJECTS_ROOT)
    if RUNTIME_PROJECTS_ROOT.exists() or not can_write_dir(PROJECTS_ROOT):
        roots.append(RUNTIME_PROJECTS_ROOT)
    unique_roots = []
    seen = set()
    for root in roots:
        resolved = root.resolve()
        if str(resolved) not in seen:
            unique_roots.append(root)
            seen.add(str(resolved))
    return unique_roots


def project_dir_for_write(project_name):
    return writable_projects_root() / safe_project_name(project_name)


def get_project_template(template_id):
    template_id = template_id or "custom"
    for template in PROJECT_TEMPLATES:
        if template["id"] == template_id:
            return json.loads(json.dumps(template, ensure_ascii=False))
    return json.loads(json.dumps(PROJECT_TEMPLATES[0], ensure_ascii=False))


def project_templates_payload():
    return {"templates": [json.loads(json.dumps(template, ensure_ascii=False)) for template in PROJECT_TEMPLATES]}


def format_episode_counts(counts):
    return ", ".join(f"EP{episode}:{count}" for episode, count in counts.items())


def create_empty_project(project_name, drama_name="", episode_scope="", template_id="custom"):
    template = get_project_template(template_id)
    if template.get("episode_scope") and not episode_scope:
        episode_scope = template.get("episode_scope", "")
    if not project_name:
        date = datetime.now().strftime("%Y%m%d")
        project_name = f"{drama_name or '\u77ed\u5267\u9879\u76ee'}_{episode_scope or '\u5207\u7247'}_{date}"
    safe_name = safe_project_name(project_name)
    project_dir = project_dir_for_write(safe_name)
    originals_dir = project_dir / ASSETS_DIR
    proxies_dir = project_dir / PROXIES_DIR
    exports_dir = project_dir / "exports"
    originals_dir.mkdir(parents=True, exist_ok=True)
    proxies_dir.mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)
    state = {
        "project_name": safe_name,
        "project_kind": "managed_project",
        "drama_name": drama_name,
        "episode_scope": episode_scope,
        "source_root": str(originals_dir.resolve()),
        "base_dir": str(project_dir.resolve()),
        "output_dir": str(exports_dir.resolve()),
        "clips": [],
        "assets": [],
        "workflow_status": "created",
        "project_template": template,
        "clip_count_plan": {
            "default": template.get("default_clip_count", 3),
            "episode_counts": template.get("episode_counts", {}),
            "source": "project_template",
        },
        "prompt_preset": template.get("prompt_preset", "commercial_complete_scene"),
        "tasks": default_tasks(),
    }
    if project_dir.parent.resolve() != PROJECTS_ROOT.resolve():
        state["storage_note"] = "项目库目录不可写，本项目已自动保存到系统临时工作区。"
        state["storage_root"] = str(project_dir.parent.resolve())
    set_task(state, "create_project", "done", 100, "\u9879\u76ee\u5df2\u521b\u5efa")
    (project_dir / "review_state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    save_state(state)
    return state


def load_project_state_from_base(base_dir):
    state_file = Path(base_dir) / "review_state.json"
    if not state_file.exists():
        raise FileNotFoundError(str(state_file))
    return json.loads(state_file.read_text(encoding="utf-8-sig"))


def runtime_project_dir_for_state(state):
    name = safe_project_name(state.get("project_name") or Path(state.get("base_dir") or "review_project").name)
    return RUNTIME_PROJECTS_ROOT / name


def sync_state_storage_paths(state, fallback_dir, original_dir=None):
    fallback_dir = Path(fallback_dir)
    state["base_dir"] = str(fallback_dir.resolve())
    state["runtime_state_path"] = str((fallback_dir / "review_state.json").resolve())
    if original_dir:
        original_dir = Path(original_dir)
        state["original_base_dir"] = str(original_dir.resolve())
        if not state.get("source_root"):
            source_root = original_dir / ASSETS_DIR
            if source_root.exists():
                state["source_root"] = str(source_root.resolve())
    if state.get("output_dir"):
        try:
            output_dir = Path(state["output_dir"]).resolve()
            original_resolved = Path(original_dir).resolve() if original_dir else None
            if original_resolved and (output_dir == original_resolved or original_resolved in output_dir.parents):
                state["output_dir"] = str((fallback_dir / "exports").resolve())
        except Exception:
            pass
    else:
        state["output_dir"] = str((fallback_dir / "exports").resolve())
    return state


def save_project_state(state):
    original_dir = Path(state["base_dir"])
    try:
        original_dir.mkdir(parents=True, exist_ok=True)
        write_json_atomic(original_dir / "review_state.json", state)
    except (PermissionError, OSError):
        fallback_dir = runtime_project_dir_for_state(state)
        fallback_dir.mkdir(parents=True, exist_ok=True)
        sync_state_storage_paths(state, fallback_dir, original_dir)
        write_json_atomic(fallback_dir / "review_state.json", state)
        state["_save_warning"] = "项目目录暂时不可写，已自动保存到可写运行目录。"
    save_state(state)


def safe_save_project_state(state):
    warning = ""
    try:
        save_project_state(state)
        warning = state.get("_save_warning", "")
    except (PermissionError, OSError):
        save_state(state)
        warning = "项目状态已在本次运行中保留，但暂时无法写入磁盘。"
        state["_save_warning"] = warning
    return warning


def unique_child_path(parent, filename):
    name = Path(filename).name
    target = parent / name
    if not target.exists():
        return target
    stem = target.stem
    suffix = target.suffix
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    for index in range(1, 1000):
        candidate = parent / f"{stem}_{stamp}_{index:03d}{suffix}"
        if not candidate.exists():
            return candidate
    return parent / f"{stem}_{stamp}_{uuid.uuid4().hex[:8]}{suffix}"


def writable_upload_dir_for_state(state, preferred):
    candidates = [
        Path(preferred),
        Path(state.get("base_dir") or ROOT) / "uploaded_assets",
        TMP_DIR / "uploaded_assets" / safe_project_name(state.get("project_name") or "active_project"),
        Path(tempfile.gettempdir()) / "shortdrama-ai-clipping-tool" / "uploaded_assets" / safe_project_name(state.get("project_name") or "active_project"),
    ]
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            probe = candidate / f".write_probe_{uuid.uuid4().hex}.tmp"
            probe.write_bytes(b"ok")
            probe.unlink(missing_ok=True)
            return candidate
        except Exception:
            continue
    raise PermissionError("没有可写入的素材目录")


def path_parent_writable(path):
    parent = Path(path).parent
    try:
        parent.mkdir(parents=True, exist_ok=True)
        probe = parent / f".write_probe_{uuid.uuid4().hex}.tmp"
        probe.write_bytes(b"ok")
        probe.unlink(missing_ok=True)
        return True
    except Exception:
        return False


def update_project_output_dir(output_dir):
    state = load_review_state()
    if not state.get("base_dir"):
        raise ValueError("No active project")
    raw = str(output_dir or "").strip()
    if not raw:
        raise ValueError("导出目录不能为空")
    target = Path(raw).expanduser()
    if not target.is_absolute():
        target = Path(state.get("output_dir") or (Path(state["base_dir"]) / "exports")) / target
    try:
        target.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise PermissionError(f"没有权限创建导出目录：{target}") from exc
    state["output_dir"] = str(target.resolve())
    append_task_record(state, "output_dir", "done", "Updated export directory", meta={"output_dir": state["output_dir"]})
    warning = safe_save_project_state(state)
    return {"ok": True, "output_dir": state["output_dir"], "state": state, "warning": warning}


def choose_project_output_dir():
    state = load_review_state()
    if not state.get("base_dir"):
        raise ValueError("No active project")
    initial_dir = state.get("output_dir") or str(Path(state["base_dir"]) / "exports")
    try:
        Path(initial_dir).expanduser().mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    ps_path = Path(tempfile.gettempdir()) / f"shortdrama_choose_output_{uuid.uuid4().hex}.ps1"
    powershell_script = "\n".join([
        "Add-Type -AssemblyName System.Windows.Forms",
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "$form = New-Object System.Windows.Forms.Form",
        "$form.TopMost = $true",
        "$form.StartPosition = 'CenterScreen'",
        "$form.Width = 0",
        "$form.Height = 0",
        "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$dialog.Description = '请选择导出路径'",
        "$dialog.ShowNewFolderButton = $true",
        f"$dialog.SelectedPath = {json.dumps(str(Path(initial_dir).expanduser()), ensure_ascii=False)}",
        "$result = $dialog.ShowDialog($form)",
        "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
        "$form.Dispose()",
    ])
    try:
        ps_path.write_text(powershell_script, encoding="utf-8-sig")
        powershell = shutil.which("powershell.exe") or shutil.which("powershell") or "powershell.exe"
        result = subprocess.run(
            [powershell, "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", str(ps_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
    except Exception as exc:
        raise RuntimeError(f"无法打开文件夹选择窗口：{exc}") from exc
    finally:
        try:
            ps_path.unlink(missing_ok=True)
        except Exception:
            pass
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(f"无法打开文件夹选择窗口：{detail or result.returncode}")
    selected = (result.stdout or "").strip().splitlines()[-1].strip() if (result.stdout or "").strip() else ""
    if not selected:
        return {"ok": False, "cancelled": True, "output_dir": state.get("output_dir") or "", "state": state}
    result = update_project_output_dir(selected)
    result["selected"] = True
    return result


def open_project_output_dir(dry_run=False):
    state = load_review_state()
    raw = (state.get("last_export") or {}).get("output_dir") or state.get("output_dir")
    if not raw:
        raise ValueError("No output directory configured")
    target = Path(raw).expanduser()
    if not target.exists():
        target.mkdir(parents=True, exist_ok=True)
    resolved = target.resolve()
    allowed_roots = [Path(state.get("output_dir") or "").resolve(), Path(state.get("base_dir") or ROOT).resolve(), OUTPUT_ROOT.resolve()]
    if not any(str(resolved).lower().startswith(str(root).lower()) for root in allowed_roots if str(root)):
        raise PermissionError("Output directory is outside the current project")
    opened = False
    warning = ""
    if dry_run:
        warning = "已验证导出目录可用，验收模式不会打开资源管理器窗口。"
    else:
        opened = True
        try:
            if sys.platform.startswith("win"):
                subprocess.Popen(["explorer", str(resolved)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(resolved)])
            else:
                subprocess.Popen(["xdg-open", str(resolved)])
        except Exception as exc:
            opened = False
            warning = f"目录已准备好，但系统没有打开窗口：{exc}"
    append_task_record(state, "open_output_dir", "done" if opened else "verified", "Opened export directory" if opened else warning, meta={"output_dir": str(resolved), "opened": opened, "dry_run": bool(dry_run)})
    save_warning = safe_save_project_state(state)
    if save_warning and not warning:
        warning = save_warning
    return {"ok": True, "output_dir": str(resolved), "opened": opened, "dry_run": bool(dry_run), "warning": warning}


def history_dir_for_state(state):
    base_dir = Path(state.get("base_dir") or ROOT)
    history_dir = base_dir / HISTORY_DIR
    history_dir.mkdir(parents=True, exist_ok=True)
    return history_dir


def compact_clip_snapshot(clip):
    return {
        "id": clip.get("id"),
        "episode": clip.get("episode"),
        "start": clip.get("start"),
        "end": clip.get("end"),
        "duration": clip.get("duration"),
        "status": clip.get("status"),
        "note": clip.get("note", ""),
        "ai_reselect_intent": clip.get("ai_reselect_intent", ""),
    }


def create_history_snapshot(state, action="state_saved", clip_id=""):
    try:
        history_dir = history_dir_for_state(state)
        now = datetime.now()
        snapshot = {
            "id": now.strftime("%Y%m%d_%H%M%S_%f"),
            "action": action,
            "clip_id": clip_id,
            "created_at": now.strftime("%Y-%m-%d %H:%M:%S"),
            "project_name": state.get("project_name", ""),
            "clips": state.get("clips", []),
            "summary": [compact_clip_snapshot(clip) for clip in state.get("clips", [])],
        }
        target = history_dir / f"{snapshot['id']}.json"
        target.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
        snapshots = sorted(history_dir.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        for stale in snapshots[MAX_HISTORY_SNAPSHOTS:]:
            try:
                stale.unlink()
            except Exception:
                pass
        state["last_history_snapshot"] = {"id": snapshot["id"], "action": action, "clip_id": clip_id, "created_at": snapshot["created_at"]}
        return state["last_history_snapshot"]
    except Exception as exc:
        state["_history_warning"] = str(exc)
        return None


def list_history_snapshots(state):
    try:
        history_dir = history_dir_for_state(state)
        rows = []
        for item in sorted(history_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)[:MAX_HISTORY_SNAPSHOTS]:
            try:
                data = json.loads(item.read_text(encoding="utf-8-sig"))
                rows.append({
                    "id": data.get("id") or item.stem,
                    "action": data.get("action", "state_saved"),
                    "clip_id": data.get("clip_id", ""),
                    "created_at": data.get("created_at", ""),
                    "clip_count": len(data.get("clips", [])),
                })
            except Exception:
                rows.append({"id": item.stem, "action": "unreadable", "clip_id": "", "created_at": "", "clip_count": 0})
        return rows
    except Exception:
        return []


def restore_history_snapshot(state, snapshot_id):
    if not snapshot_id:
        raise ValueError("missing snapshot id")
    history_dir = history_dir_for_state(state)
    snapshot_file = history_dir / f"{safe_project_name(snapshot_id)}.json"
    if not snapshot_file.exists():
        raise FileNotFoundError(f"history snapshot not found: {snapshot_id}")
    current_state = json.loads(json.dumps(state, ensure_ascii=False))
    create_history_snapshot(current_state, "before_undo", "")
    snapshot = json.loads(snapshot_file.read_text(encoding="utf-8-sig"))
    state["clips"] = snapshot.get("clips", [])
    state["workflow_status"] = "history_restored"
    state["last_undo"] = {"snapshot_id": snapshot_id, "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    persist_review_state(state)
    return {"ok": True, "state": state, "restored": {"id": snapshot_id, "action": snapshot.get("action", "")}}

def clips_for_asset_path(state, asset_path):
    resolved = str(safe_path(asset_path))
    return [clip for clip in state.get("clips", []) if str(clip.get("source_video", "")) == resolved or str(clip.get("preview_video", "")) == resolved]


def asset_is_registered(state, target):
    resolved = str(Path(target).resolve())
    return any(str(Path(asset.get("path", "")).resolve()) == resolved for asset in state.get("assets", []) if asset.get("path"))


def delete_asset_from_project(state, asset_path):
    if not asset_path:
        raise ValueError("missing asset path")
    target = safe_path(asset_path)
    try:
        source_root = safe_path(state.get("source_root") or "")
    except Exception:
        source_root = Path(state.get("source_root") or state.get("base_dir") or ROOT).resolve()
    if source_root not in target.parents and not asset_is_registered(state, target):
        raise PermissionError("asset must be inside current project material library")
    if not target.exists() or target.suffix.lower() != ".mp4":
        raise FileNotFoundError("asset not found")
    affected = clips_for_asset_path(state, str(target))
    trash = writable_upload_dir_for_state(state, Path(state.get("base_dir") or source_root.parent) / ".deleted_assets")
    moved = trash / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{target.name}"
    shutil.move(str(target), str(moved))
    deleted_item = {
        "filename": target.name,
        "trash_path": str(moved.resolve()),
        "original_path": str(target.resolve()),
        "deleted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "affected_clips": len(affected),
    }
    for clip in affected:
        clip["asset_deleted_previous_status"] = clip.get("status", "")
        clip["status"] = "needs_edit"
        clip["asset_deleted"] = True
        clip["deleted_asset_path"] = str(moved.resolve())
        clip["deleted_asset_original_path"] = str(target.resolve())
    state["assets"] = [
        asset for asset in state.get("assets", [])
        if str(Path(asset.get("path", "")).resolve()) != str(target.resolve())
    ]
    state.setdefault("deleted_assets", []).append(deleted_item)
    state["deleted_assets"] = state["deleted_assets"][-80:]
    state["workflow_status"] = "assets_updated"
    append_task_record(state, "asset_deleted", "done", f"Deleted asset {target.name}", meta={"affected_clips": len(affected), "trash_path": str(moved.resolve())})
    safe_save_project_state(state)
    return {"ok": True, "deleted": str(target), "trash_path": str(moved.resolve()), "original_path": str(target.resolve()), "affected_clips": len(affected), "deleted_asset": deleted_item, "state": state}


def restore_deleted_asset_to_project(state, trash_path, original_path):
    if not trash_path or not original_path:
        raise ValueError("missing restore path")
    trash = safe_path(trash_path)
    target = Path(original_path).resolve()
    base_dir = safe_path(state.get("base_dir") or "")
    source_root = safe_path(state.get("source_root") or "")
    deleted_root = base_dir / ".deleted_assets"
    known_deleted = next((item for item in state.get("deleted_assets", []) if str(Path(item.get("trash_path", "")).resolve()) == str(trash)), None)
    if deleted_root not in trash.parents and not known_deleted:
        raise PermissionError("deleted asset must be inside current project recycle area")
    if source_root not in target.parents and not path_parent_writable(target):
        target = unique_child_path(writable_upload_dir_for_state(state, source_root), target.name)
    if source_root not in target.parents and not path_parent_writable(target):
        raise PermissionError("restore target must be inside current project material library")
    if not trash.exists() or trash.suffix.lower() != ".mp4":
        raise FileNotFoundError("deleted asset not found")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError("素材库中已有同名素材，请先处理同名文件")
    shutil.move(str(trash), str(target))
    for clip in state.get("clips", []):
        if str(clip.get("deleted_asset_path", "")) == str(trash):
            previous = clip.pop("asset_deleted_previous_status", "")
            if previous:
                clip["status"] = previous
            clip.pop("asset_deleted", None)
            clip.pop("deleted_asset_path", None)
            clip.pop("deleted_asset_original_path", None)
    state["deleted_assets"] = [
        item for item in state.get("deleted_assets", [])
        if str(item.get("trash_path", "")) != str(trash)
    ]
    if not asset_is_registered(state, target):
        next_episode = max([int(asset.get("episode") or 0) for asset in state.get("assets", [])] + [0]) + 1
        state.setdefault("assets", []).append({"episode": next_episode, "path": str(target.resolve()), "filename": target.name, "size": target.stat().st_size})
    state["workflow_status"] = "assets_updated"
    append_task_record(state, "asset_restored", "done", f"Restored asset {target.name}", meta={"restored": str(target.resolve())})
    safe_save_project_state(state)
    return {"ok": True, "restored": str(target.resolve()), "filename": target.name, "state": state}


def import_subtitle_for_asset(state, asset_path, upload_item):
    if not asset_path:
        raise ValueError("missing asset path")
    if not getattr(upload_item, "filename", ""):
        raise ValueError("missing subtitle file")
    asset = safe_path(asset_path)
    try:
        source_root = safe_path(state.get("source_root") or "")
    except Exception:
        source_root = Path(state.get("source_root") or state.get("base_dir") or ROOT).resolve()
    if source_root not in asset.parents:
        raise PermissionError("asset must be inside current project material library")
    if not asset.exists() or asset.suffix.lower() != ".mp4":
        raise FileNotFoundError("asset not found")
    filename = Path(upload_item.filename).name
    suffix = Path(filename).suffix.lower()
    if suffix not in (".srt", ".vtt", ".ass", ".ssa"):
        raise ValueError("只支持 .srt/.vtt/.ass/.ssa 字幕文件")
    raw = upload_item.file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    segments = parse_ass_or_ssa(text) if suffix in (".ass", ".ssa") else parse_srt_or_vtt(text)
    if not segments:
        raise ValueError("字幕文件没有解析到时间轴")
    target = writable_subtitle_path_for_video(asset, suffix)
    target.write_text(text, encoding="utf-8")
    episode = next((item.get("episode") for item in state.get("assets", []) if str(Path(item.get("path") or "").resolve()).lower() == str(asset.resolve()).lower()), None)
    state.setdefault("manual_subtitles", {})[str(asset.resolve())] = {
        "episode": episode,
        "asset": str(asset.resolve()),
        "subtitle": str(target.resolve()),
        "segments": len(segments),
        "imported_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    state["workflow_status"] = "subtitle_imported"
    state["transcript_status"] = transcript_project_summary(state)
    append_task_record(state, "subtitle_imported", "done", f"Imported subtitle {target.name}", meta={"asset": str(asset), "subtitle": str(target), "segments": len(segments)})
    safe_save_project_state(state)
    return {"ok": True, "asset": str(asset), "subtitle": str(target.resolve()), "segments": len(segments), "state": state}


def refresh_assets(state):
    originals = Path(state["source_root"])
    existing_by_path = {}
    existing_by_name = {}
    used_episodes = set()
    for asset in state.get("assets") or []:
        try:
            episode = int(asset.get("episode") or 0)
        except Exception:
            episode = 0
        if episode <= 0:
            continue
        path_key = str(Path(asset.get("path") or "").resolve()).lower() if asset.get("path") else ""
        name_key = (asset.get("filename") or Path(asset.get("path") or "").name or "").lower()
        if path_key:
            existing_by_path[path_key] = episode
        if name_key:
            existing_by_name[name_key] = episode
        used_episodes.add(episode)

    def next_available_episode():
        episode = 1
        while episode in used_episodes:
            episode += 1
        used_episodes.add(episode)
        return episode

    assets = []
    for video in sorted(originals.glob("*.mp4"), key=lambda p: int(p.stem) if p.stem.isdigit() else 9999):
        path_key = str(video.resolve()).lower()
        name_key = video.name.lower()
        if path_key in existing_by_path:
            episode = existing_by_path[path_key]
            used_episodes.add(episode)
        elif name_key in existing_by_name:
            episode = existing_by_name[name_key]
            used_episodes.add(episode)
        elif video.stem.isdigit():
            episode = int(video.stem)
            used_episodes.add(episode)
        else:
            episode = next_available_episode()
        assets.append(enrich_asset_source_identity({"episode": episode, "path": str(video.resolve()), "filename": video.name, "size": video.stat().st_size}))
    assets.sort(key=lambda asset: int(asset.get("episode") or 0))
    state["assets"] = assets
    return assets


def effective_assets_for_state(state):
    assets = state.get("assets") or []
    if assets:
        return assets
    try:
        return refresh_assets(state)
    except Exception:
        return []



def unique_boundaries(points, duration):
    boundaries = [0.0]
    last = 0.0
    for point in sorted(float(item) for item in points if 0.0 < float(item) < duration):
        if point - last >= 1.2 and duration - point >= 1.2:
            boundaries.append(round(point, 3))
            last = point
    if duration > boundaries[-1] + 1.0:
        boundaries.append(round(duration, 3))
    return boundaries


def episode_clip_target(episode, per_episode):
    base = max(1, int(per_episode or 3))
    if int(episode) == 1:
        return max(base + 2, 5)
    return base


def parse_clip_count_overrides(value):
    if not value:
        return {}
    if isinstance(value, dict):
        source = value
    else:
        source = {}
        for part in str(value).replace("?", ",").split(","):
            if not part.strip():
                continue
            if ":" in part:
                key, count = part.split(":", 1)
            elif "=" in part:
                key, count = part.split("=", 1)
            else:
                continue
            source[key.strip()] = count.strip()
    overrides = {}
    for key, count in source.items():
        try:
            episode = int(str(key).lower().replace("ep", "").strip())
            target = max(1, min(20, int(count)))
            overrides[episode] = target
        except Exception:
            continue
    return overrides


def clip_target_for_asset(asset, default_per_episode, overrides):
    episode = int(asset.get("episode") or 1)
    return int(overrides.get(episode) or overrides.get(str(episode)) or episode_clip_target(episode, default_per_episode))


def parse_episode_selection(episodes=None):
    if episodes is None:
        return []
    if isinstance(episodes, (list, tuple, set)):
        raw_items = episodes
    else:
        raw_items = str(episodes).split(",")
    selected = []
    for item in raw_items:
        try:
            episode = int(str(item).strip())
            if episode > 0 and episode not in selected:
                selected.append(episode)
        except Exception:
            continue
    return sorted(selected)


def filter_assets_by_episode_selection(assets, episode_start=None, episode_end=None, episodes=None):
    selected = set(parse_episode_selection(episodes))
    if selected:
        return [asset for asset in assets if int(asset.get("episode") or 0) in selected]
    if episode_start is not None or episode_end is not None:
        start = int(episode_start or 1)
        end = int(episode_end or 999999)
        return [asset for asset in assets if start <= int(asset.get("episode") or 0) <= end]
    return assets


def estimate_clipping_plan(state=None, per_episode=3, episode_counts=None, episode_start=None, episode_end=None, episodes=None):
    state = state or load_review_state()
    assets = refresh_assets(state)
    assets = filter_assets_by_episode_selection(assets, episode_start, episode_end, episodes)
    overrides = parse_clip_count_overrides(episode_counts)
    rows = []
    totals = {"requested": 0, "estimated": 0, "subtitle_ready": 0, "episodes": len(assets)}
    for asset in assets:
        episode = int(asset.get("episode") or 0)
        video_path = safe_path(asset.get("path"))
        duration = float(asset.get("duration") or asset.get("source_duration") or asset.get("episode_duration") or 0)
        if duration <= 0:
            duration = ffprobe_duration(video_path)
        subtitle_ready = any(path.exists() for path in subtitle_candidates_for_video(str(video_path)))
        requested = clip_target_for_asset(asset, per_episode, overrides)
        average_scene_seconds = 38 if episode == 1 else 45
        duration_capacity = max(1, round(duration / average_scene_seconds)) if duration else requested
        first_episode_bonus = 1 if episode == 1 else 0
        estimate = max(1, min(requested + first_episode_bonus, duration_capacity + first_episode_bonus))
        reason = "按剧集时长快速预估"
        if not subtitle_ready:
            reason = "缺少字幕，预估可信度较低；建议先生成 ASR 字幕"
        if episode == 1 and estimate < requested:
            reason += "；第 1 集信息量通常更高，但仍受完整场景数量限制"
        totals["requested"] += requested
        totals["estimated"] += estimate
        totals["subtitle_ready"] += 1 if subtitle_ready else 0
        rows.append({
            "episode": episode,
            "filename": asset.get("filename") or video_path.name,
            "duration": round(duration, 1),
            "requested": requested,
            "estimated": estimate,
            "subtitle_ready": subtitle_ready,
            "confidence": "高" if subtitle_ready else "低",
            "reason": reason,
        })
    if not rows:
        summary = "请先导入素材。"
        note = ""
    else:
        summary = f"已选 {totals['episodes']} 集，预计 {totals['estimated']} 条切片"
        note = ""
    return {"ok": True, "summary": summary, "note": note, "totals": totals, "episodes": rows}


def episode_duration_profile(episode):
    if int(episode) == 1:
        return {"min": 38.0, "preferred": 70.0, "max": 110.0}
    return {"min": 30.0, "preferred": 58.0, "max": 92.0}


def overlap_ratio(a_start, a_end, b_start, b_end):
    overlap = max(0.0, min(a_end, b_end) - max(a_start, b_start))
    span = max(0.1, min(a_end - a_start, b_end - b_start))
    return overlap / span


MAX_SELECTED_CLIP_OVERLAP = 0.30
MAX_REDUNDANT_CLIP_OVERLAP = 0.78


def fallback_windows(duration, target, profile):
    if duration <= 0:
        return []
    target = max(1, int(target or 1))
    if duration <= profile["min"] + 6:
        return [(0.0, round(duration, 3), 1.0, "full_episode_fallback")]
    preferred = min(profile["preferred"], max(profile["min"], duration / target * 0.9))
    min_length = max(8.0, min(profile["min"], duration / max(1, target) * 0.72))
    preferred = max(min_length, min(preferred, profile["max"], duration))
    usable = max(0.0, duration - preferred)
    windows = []
    for idx in range(target):
        anchor = 0.0 if target == 1 else usable * idx / max(1, target - 1)
        start = max(0.0, min(anchor, duration - min_length))
        end = min(duration, start + preferred)
        if end - start >= min_length:
            windows.append((round(start, 3), round(end, 3), 0.1, "count_target_fallback"))
    return windows


TRAFFIC_MATERIAL_RULES = {
    "conflict_hook": {
        "label": "强冲突开场",
        "keywords": ["打", "滚", "跪", "贱", "死", "休", "罚", "杀", "欺", "辱", "笑话", "放肆", "不要脸", "狗屁", "老子", "小白脸", "猎物", "勾引", "殉情"],
    },
    "identity_hook": {
        "label": "身份关系钩子",
        "keywords": ["系统", "绑定", "王府", "后妈", "王爷", "夫人", "身份", "千金", "替嫁", "重生", "穿越", "娘亲"],
    },
    "payoff": {
        "label": "爽点兑现",
        "keywords": ["报仇", "反击", "打脸", "揭穿", "真相", "惩罚", "后悔", "求饶", "掌握", "赢"],
    },
    "suspense": {
        "label": "悬念续看",
        "keywords": ["为什么", "怎么会", "竟然", "难道", "原来", "秘密", "等一下", "你是谁", "真的是"],
    },
    "emotion": {
        "label": "人物情绪",
        "keywords": ["哭", "求", "愿意", "恨", "怕", "疯", "救", "疼", "滚开", "别走", "对不起"],
    },
}


def subtitle_text_for_window(subtitle_segments, start, end):
    texts = []
    for segment in subtitle_segments or []:
        try:
            segment_start = float(segment.get("start", 0))
            segment_end = float(segment.get("end", 0))
        except Exception:
            continue
        if segment_end <= start or segment_start >= end:
            continue
        text = str(segment.get("text") or "").strip()
        if text:
            texts.append(text)
    return " ".join(texts)


def candidate_similarity_redundant(item, kept):
    """Treat only near-identical timeline choices as duplicates; same-scene variants are allowed."""
    item_start = float(item.get("start", 0) or 0)
    item_end = float(item.get("end", item_start) or item_start)
    kept_start = float(kept.get("start", 0) or 0)
    kept_end = float(kept.get("end", kept_start) or kept_start)
    overlap = overlap_ratio(item_start, item_end, kept_start, kept_end)
    same_entry = abs(item_start - kept_start) <= 1.0
    if same_entry and overlap >= 0.70:
        return True
    if overlap >= MAX_REDUNDANT_CLIP_OVERLAP:
        same_entry = abs(item_start - kept_start) <= 3.5
        same_exit = abs(item_end - kept_end) <= 4.5
        nearly_same_duration = abs((item_end - item_start) - (kept_end - kept_start)) <= 4.0
        if same_entry and same_exit:
            return True
        if (same_entry or same_exit) and nearly_same_duration:
            return True
    item_key = (item.get("traffic_material") or {}).get("duplicate_group_key")
    kept_key = (kept.get("traffic_material") or {}).get("duplicate_group_key")
    return bool(item_key and kept_key and item_key == kept_key and abs(item_start - kept_start) <= 3.5 and abs(item_end - kept_end) <= 4.5)


def any_redundant_candidate(item, selected):
    return any(candidate_similarity_redundant(item, kept) for kept in selected)


def candidate_selection_strategy(item):
    traffic = item.get("traffic_material") or {}
    reason = str(item.get("reason") or "")
    duration = max(0.1, float(item.get("end", 0) or 0) - float(item.get("start", 0) or 0))
    rule_score = min(35.0, max(0.0, float(item.get("score") or 0) * 0.22))
    commercial_score = min(24.0, max(0.0, float(traffic.get("commercial_score") or 0) * 0.34))
    semantic_score = 0.0
    if reason.startswith("subtitle_"):
        semantic_score += 10.0
    if item.get("subtitle_boundary_protected"):
        semantic_score += 5.0
    if item.get("semantic_unit_protected"):
        semantic_score += 7.0
    if item.get("subtitle_line_count"):
        semantic_score += min(6.0, int(item.get("subtitle_line_count") or 0) * 0.6)
    if item.get("variant") and item.get("variant") != "complete_scene":
        semantic_score += 8.0
    if candidate_has_hook_evidence(item):
        semantic_score += 10.0
    if traffic.get("material_types") or traffic.get("keyword_hits"):
        semantic_score += 6.0
    semantic_score = min(32.0, semantic_score)
    model_score_value = 0.0
    model_score = item.get("model_score")
    if model_score is not None:
        try:
            model_score_value += min(26.0, max(0.0, float(model_score)) * 0.26)
        except Exception:
            pass
    if item.get("model_decision") == "reject":
        model_score_value -= 60.0
    elif item.get("model_decision") == "keep":
        model_score_value += 5.0
    if item.get("model_reason"):
        model_score_value += 3.0
    audio_visual_score = min(10.0, float(item.get("audio_dynamic_range") or 0) * 0.22)
    audio_visual_score += min(8.0, float(item.get("audio_tension_score") or 0) * 0.08)
    audio_visual_score += min(4.0, float(item.get("voice_activity_ratio") or 0) * 4.0)
    audio_visual_score += min(4.0, float(item.get("pause_transition_rate") or 0) * 20.0)
    audio_visual_score += min(6.0, int(item.get("shot_count") or 0) * 1.2)
    penalty = 0.0
    if duration > 95:
        penalty += min(18.0, (duration - 95) * 0.5)
    if reason == "visual_scene_group" and int(item.get("subtitle_segments") or 0) > 0 and not traffic.get("material_types"):
        penalty += 10.0
    if reason == "visual_scene_group" and int(item.get("subtitle_segments") or 0) > 0 and duration > 70:
        penalty += min(18.0, (duration - 70) * 0.45)
    if reason == "visual_scene_group" and item.get("semantic_unit_protected"):
        penalty += 6.0
    if reason == "subtitle_scene_group" and not candidate_has_hook_evidence(item) and not item.get("model_reason"):
        penalty += 5.0
    total = rule_score + commercial_score + semantic_score + model_score_value + audio_visual_score - penalty
    strategy = {
        "total": round(total, 2),
        "rule": round(rule_score, 2),
        "commercial": round(commercial_score, 2),
        "semantic": round(semantic_score, 2),
        "model": round(model_score_value, 2),
        "audio_visual": round(audio_visual_score, 2),
        "penalty": round(penalty, 2),
    }
    item["selection_strategy"] = strategy
    return strategy


def candidate_value_score(item):
    return candidate_selection_strategy(item)["total"]


def candidate_has_hook_evidence(item):
    traffic = item.get("traffic_material") or {}
    return bool(
        item.get("variant") and item.get("variant") != "complete_scene"
        or traffic.get("material_types")
        or traffic.get("keyword_hits")
        or float(traffic.get("hook_score") or 0) >= 18
        or item.get("reason") in ("subtitle_hook_variant", "subtitle_scene_variant", "subtitle_conflict_entry_variant")
    )


def candidate_is_effective_test_material(item):
    traffic = item.get("traffic_material") or {}
    try:
        start = float(item.get("start", 0) or 0)
        end = float(item.get("end", start) or start)
    except Exception:
        return False
    duration = max(0.0, end - start)
    reason = str(item.get("reason") or "")
    commercial_score = float(traffic.get("commercial_score") or 0)
    completeness_score = float(traffic.get("completeness_score") or 0)
    has_subtitle = bool(traffic.get("subtitle_text_available") or int(item.get("subtitle_segments") or 0) > 0)
    subtitle_material = reason.startswith("subtitle_")
    valid_duration = 22.0 <= duration <= 115.0
    complete_enough = completeness_score >= 28 or int(item.get("subtitle_line_count") or 0) >= 4
    return bool(has_subtitle and subtitle_material and valid_duration and complete_enough and commercial_score >= 36)


def candidate_model_rejected(item):
    if item.get("model_decision") != "reject":
        return False
    traffic = item.get("traffic_material") or {}
    commercial_score = float(traffic.get("commercial_score") or 0)
    reject_text = " ".join([
        str(item.get("model_reason") or ""),
        " ".join(str(risk) for risk in (item.get("model_risks") or [])),
        str((item.get("model_review") or {}).get("summary") or ""),
    ])
    duplicate_only = any(word in reject_text.lower() for word in ["重复", "相似", "同场", "duplicate", "similar"])
    strong_entry_variant = bool(item.get("semantic_entry_allowed") and candidate_has_hook_evidence(item) and commercial_score >= 48)
    if strong_entry_variant and duplicate_only:
        item["model_reject_overridden"] = "same_scene_strong_entry_variant"
        return False
    hard_reject_terms = ["语义断裂", "切半", "半句", "边界", "硬伤", "无效", "不可用", "过短", "过长", "字幕缺失"]
    if candidate_is_effective_test_material(item) and not any(term in reject_text for term in hard_reject_terms):
        item["model_reject_overridden"] = "effective_test_material"
        return False
    return True


def candidate_is_strong_entry_variant(item):
    traffic = item.get("traffic_material") or {}
    commercial_score = float(traffic.get("commercial_score") or 0)
    return bool(
        (item.get("semantic_entry_allowed") or item.get("reason") == "subtitle_conflict_entry_variant")
        and candidate_has_hook_evidence(item)
        and commercial_score >= 48
    )


def candidate_quality_acceptable(item):
    if candidate_model_rejected(item):
        return False
    strategy = item.get("selection_strategy") or candidate_selection_strategy(item)
    traffic = item.get("traffic_material") or {}
    total = float(strategy.get("total") or 0)
    commercial_score = float(traffic.get("commercial_score") or 0)
    model_score = item.get("model_score")
    has_model_support = False
    if model_score is not None:
        try:
            has_model_support = float(model_score) >= 70
        except Exception:
            has_model_support = False
    return bool(
        total >= 72
        or has_model_support
        or candidate_is_effective_test_material(item)
        or (item.get("semantic_entry_allowed") and candidate_has_hook_evidence(item) and commercial_score >= 48)
        or (candidate_has_hook_evidence(item) and commercial_score >= 58)
    )


def promote_strong_entry_variants(selected, ranked_candidates, target):
    if target < 3:
        return selected
    strong_entries = [
        item for item in ranked_candidates
        if candidate_is_strong_entry_variant(item)
        and not candidate_model_rejected(item)
        and candidate_quality_acceptable(item)
    ]
    if len(strong_entries) < 2:
        return selected
    desired = min(len(strong_entries), 3 if target >= 5 else 2, target)
    result = list(selected)
    current = [item for item in result if candidate_is_strong_entry_variant(item)]
    for item in sorted(strong_entries, key=candidate_value_score, reverse=True):
        if len(current) >= desired:
            break
        if item in result:
            continue
        if any(candidate_similarity_redundant(item, kept) and not same_scene_intent_variant(item, kept) for kept in result):
            continue
        result.append(item)
        current.append(item)
    if len(result) > target:
        removable = sorted(
            [item for item in result if not candidate_is_strong_entry_variant(item)],
            key=candidate_value_score,
        )
        for item in removable:
            if len(result) <= target:
                break
            result.remove(item)
    return sorted(result[:target], key=lambda item: item["start"])


def candidate_timeline_bucket(item, duration):
    try:
        center = (float(item.get("start", 0) or 0) + float(item.get("end", 0) or 0)) / 2.0
        duration = max(1.0, float(duration or 1.0))
    except Exception:
        return "unknown"
    if center < duration / 3.0:
        return "front"
    if center < duration * 2.0 / 3.0:
        return "middle"
    return "back"


def promote_effective_material_exploration(selected, ranked_candidates, target, duration):
    if target < 5:
        return selected
    result = list(selected)
    if not result:
        return selected
    bucket_counts = {bucket: 0 for bucket in ("front", "middle", "back")}
    for item in result:
        bucket_counts[candidate_timeline_bucket(item, duration)] = bucket_counts.get(candidate_timeline_bucket(item, duration), 0) + 1
    weakest_score = min(candidate_value_score(item) for item in result)
    exploration_pool = [
        item for item in ranked_candidates
        if candidate_is_effective_test_material(item)
        and not candidate_model_rejected(item)
        and item not in result
        and not any(candidate_similarity_redundant(item, kept) and not same_scene_intent_variant(item, kept) for kept in result)
    ]
    for candidate in sorted(exploration_pool, key=candidate_value_score, reverse=True):
        bucket = candidate_timeline_bucket(candidate, duration)
        score = candidate_value_score(candidate)
        if len(result) < target:
            result.append(candidate)
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            continue
        if score < weakest_score - 4.0:
            continue
        removable = sorted(
            [
                item for item in result
                if not candidate_is_strong_entry_variant(item)
                and candidate_value_score(item) <= score + 1.0
                and bucket_counts.get(candidate_timeline_bucket(item, duration), 0) > 1
            ],
            key=candidate_value_score,
        )
        if removable:
            removed = removable[0]
            result.remove(removed)
            bucket_counts[candidate_timeline_bucket(removed, duration)] = max(0, bucket_counts.get(candidate_timeline_bucket(removed, duration), 0) - 1)
            result.append(candidate)
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            weakest_score = min(candidate_value_score(item) for item in result)
    return sorted(result[:target], key=lambda item: item["start"])


def promote_declarative_endpoint_variants(selected, ranked_candidates, target, subtitle_segments, duration):
    result = list(selected)
    if len(result) >= target:
        return result
    pool = [
        item for item in ranked_candidates
        if item.get("reason") == "subtitle_declarative_endpoint_variant"
        and is_declarative_beat_endpoint_time(item.get("end"), subtitle_segments)
    ]
    for item in sorted(pool, key=candidate_value_score, reverse=True):
        if len(result) >= target:
            break
        fixed = internal_clip_validation(item, subtitle_segments, duration)
        if fixed is None:
            continue
        if any(abs(float(fixed.get("start", 0)) - float(kept.get("start", 0))) < 0.2 and abs(float(fixed.get("end", 0)) - float(kept.get("end", 0))) < 0.2 for kept in result):
            continue
        fixed["model_boundary_review"] = fixed.get("model_boundary_review") or {
            "source": "rule_declarative_endpoint",
            "decision": "keep",
            "reason": "陈述句出点可作为独立剪辑节点，不因后续说明类内容强制延长。",
            "risks": [],
        }
        result.append(fixed)
    return sorted(result[:target], key=lambda item: item["start"])


MATERIAL_POOL_ENTRY_WORDS = [
    "给我站住", "臭小子", "我要杀", "我就是疯子", "快接电话", "文我被",
    "为师所有", "帝女花", "那生离死别", "希望你嫁人", "臭婊子", "看你往哪儿跑",
    "你唱什么", "我杀了你", "我自从", "你就是我的猎物",
]
MATERIAL_POOL_EXIT_WORDS = [
    "你在哪里", "不要报警", "跟他殉情", "你就是我的猎物", "我让你去", "啊", "你。",
]


def material_pool_tier(item):
    value = float(item.get("pool_value") or candidate_value_score(item))
    duration = max(0.0, float(item.get("end", 0) or 0) - float(item.get("start", 0) or 0))
    if duration < 20 or duration > 90:
        return "C"
    if value >= 68:
        return "A"
    if value >= 52:
        return "B"
    return "C"


def material_pool_candidate_allowed(item, selected, max_sameish=2):
    for kept in selected:
        if abs(float(item.get("start", 0) or 0) - float(kept.get("start", 0) or 0)) < 0.2 and abs(float(item.get("end", 0) or 0) - float(kept.get("end", 0) or 0)) < 0.2:
            return False
    sameish = 0
    for kept in selected:
        try:
            ratio = overlap_ratio(item["start"], item["end"], kept["start"], kept["end"])
        except Exception:
            ratio = 0.0
        if ratio >= 0.86:
            sameish += 1
    return sameish < max_sameish


def generate_material_pool_candidates_for_asset(asset, target_pool=18):
    video_path = safe_path(asset["path"])
    duration = ffprobe_duration(video_path)
    subtitle_segments = subtitle_segments_for_video(video_path)
    profile = episode_duration_profile(asset.get("episode", 1))
    entry_points = sorted(set(
        [0.0]
        + [
            float(segment["start"])
            for segment in subtitle_segments
            if any(word in subtitle_plain_text(segment.get("text", "")) for word in MATERIAL_POOL_ENTRY_WORDS)
        ]
    ))
    exit_points = sorted(set(
        [
            float(segment["end"])
            for segment in subtitle_segments
            if any(word in subtitle_plain_text(segment.get("text", "")) for word in MATERIAL_POOL_EXIT_WORDS)
        ]
        + [duration]
    ))
    raw = []
    for start in entry_points:
        for end in exit_points:
            if end <= start:
                continue
            clip_duration = end - start
            if clip_duration < 18 or clip_duration > 90:
                continue
            item = {
                "start": round(start, 3),
                "end": round(end, 3),
                "reason": "material_pool_combo",
                "variant": "entry_exit_matrix",
                "shot_count": 0,
                "score": 0,
                "semantic_entry_allowed": True,
                "material_pool_layer": "加量素材",
            }
            fixed = internal_clip_validation(item, subtitle_segments, duration)
            if fixed is None:
                continue
            fixed["traffic_material"] = traffic_material_profile(fixed, subtitle_segments, duration, target_pool)
            enrich_candidate_intent(fixed)
            fixed["pool_value"] = candidate_value_score(fixed)
            raw.append(fixed)
    for item in subtitle_scene_candidates(subtitle_segments, duration, profile):
        fixed = internal_clip_validation(dict(item), subtitle_segments, duration)
        if fixed is None:
            continue
        fixed["traffic_material"] = traffic_material_profile(fixed, subtitle_segments, duration, target_pool)
        enrich_candidate_intent(fixed)
        fixed["pool_value"] = candidate_value_score(fixed) + 4.0
        fixed["material_pool_layer"] = "主推荐" if fixed.get("reason") != "material_pool_combo" else "加量素材"
        raw.append(fixed)
    by_window = {}
    for item in raw:
        key = (round(float(item.get("start", 0) or 0), 1), round(float(item.get("end", 0) or 0), 1))
        if key not in by_window or float(item.get("pool_value") or 0) > float(by_window[key].get("pool_value") or 0):
            by_window[key] = item
    selected = []
    tier_rank = {"A": 0, "B": 1, "C": 2}
    for item in sorted(by_window.values(), key=lambda value: (tier_rank.get(material_pool_tier(value), 9), -float(value.get("pool_value") or 0), float(value.get("start", 0) or 0), float(value.get("end", 0) or 0))):
        if len(selected) >= int(target_pool or 18):
            break
        item["material_pool_tier"] = material_pool_tier(item)
        item["material_pool_layer"] = "主推荐" if item["material_pool_tier"] == "A" else "加量素材"
        item["model_boundary_review"] = item.get("model_boundary_review") or {
            "source": "rule_material_pool",
            "decision": "keep",
            "reason": f"{item['material_pool_layer']}候选，用于多批次投流加量。",
            "risks": [],
        }
        if not material_pool_candidate_allowed(item, selected):
            continue
        selected.append(item)
    return sorted(selected, key=lambda item: (float(item.get("start", 0) or 0), float(item.get("end", 0) or 0)))


def candidate_clip_intent(item):
    traffic = item.get("traffic_material") or {}
    material_types = set(traffic.get("material_types") or [])
    variant = item.get("variant") or ""
    reason = item.get("reason") or ""
    if "payoff" in material_types:
        return "payoff"
    if "suspense" in material_types:
        return "suspense"
    if "emotion" in material_types:
        return "emotion_peak"
    if "conflict_hook" in material_types or "identity_hook" in material_types:
        return "hook"
    if reason == "subtitle_hook_variant" or variant == "hook_to_next_beat":
        return "scene_bridge"
    if reason == "subtitle_scene_variant" or variant == "mid_hook_to_scene_end":
        return "hook"
    if reason == "subtitle_conflict_entry_variant" or variant == "conflict_entry_to_scene_end":
        return "hook"
    if reason == "visual_scene_group":
        return "visual_action"
    if reason == "subtitle_scene_group":
        return "complete_scene"
    return "candidate"


def candidate_selection_reason(item):
    traffic = item.get("traffic_material") or {}
    labels = traffic.get("material_labels") or []
    intent = item.get("clip_intent") or candidate_clip_intent(item)
    duration = max(0.1, float(item.get("end", 0) or 0) - float(item.get("start", 0) or 0))
    parts = []
    if labels:
        parts.append("、".join(str(label) for label in labels[:2]))
    if item.get("variant") and item.get("variant") != "complete_scene":
        parts.append("同场不同入点/出点")
    if item.get("subtitle_line_count"):
        parts.append(f"{int(item.get('subtitle_line_count') or 0)} 句对白")
    if float(traffic.get("hook_score") or 0) >= 18:
        parts.append("存在钩子信号")
    if not parts:
        parts.append("完整场景候选")
    return f"{intent}：{round(duration, 1)} 秒，" + "，".join(parts)


def enrich_candidate_intent(item):
    item["clip_intent"] = candidate_clip_intent(item)
    item["selection_reason"] = candidate_selection_reason(item)
    return item


def same_scene_intent_variant(item, kept):
    item_anchor = candidate_anchor_key(item)
    kept_anchor = candidate_anchor_key(kept)
    item_intent = item.get("clip_intent") or candidate_clip_intent(item)
    kept_intent = kept.get("clip_intent") or candidate_clip_intent(kept)
    start_delta = abs(float(item.get("start", 0) or 0) - float(kept.get("start", 0) or 0))
    end_delta = abs(float(item.get("end", 0) or 0) - float(kept.get("end", 0) or 0))
    try:
        overlap = overlap_ratio(
            float(item.get("start", 0) or 0),
            float(item.get("end", 0) or 0),
            float(kept.get("start", 0) or 0),
            float(kept.get("end", 0) or 0),
        )
    except Exception:
        overlap = 0.0
    if start_delta <= 1.0 and overlap >= 0.70:
        return False
    if item_anchor and kept_anchor and item_anchor != kept_anchor:
        strong_entry_overlap_variant = (
            overlap >= 0.7
            and start_delta >= 4.0
            and bool(item.get("semantic_entry_allowed") or kept.get("semantic_entry_allowed"))
            and (candidate_has_hook_evidence(item) or candidate_has_hook_evidence(kept))
        )
        if not strong_entry_overlap_variant:
            return False
    if item_intent == kept_intent:
        same_scene_entry_variant = bool(item.get("semantic_entry_allowed") or kept.get("semantic_entry_allowed"))
        return same_scene_entry_variant and start_delta >= 4.0 and candidate_has_hook_evidence(item) and candidate_has_hook_evidence(kept)
    return start_delta >= 3.0 and (candidate_has_hook_evidence(item) or candidate_has_hook_evidence(kept))


def mechanical_adjacent_split(item, kept, duration):
    item_start = float(item.get("start", 0) or 0)
    item_end = float(item.get("end", item_start) or item_start)
    kept_start = float(kept.get("start", 0) or 0)
    kept_end = float(kept.get("end", kept_start) or kept_start)
    adjacent_gap = min(abs(item_start - kept_end), abs(kept_start - item_end))
    covers_clean_sequence = adjacent_gap <= 0.35
    starts_or_ends_episode = min(item_start, kept_start) <= 0.5 or max(item_end, kept_end) >= max(0.0, float(duration or 0) - 1.5)
    subtitle_only_pair = item.get("reason") == "subtitle_scene_group" and kept.get("reason") == "subtitle_scene_group"
    weak_subtitle_pair = subtitle_only_pair and not candidate_has_hook_evidence(item) and not candidate_has_hook_evidence(kept)
    return covers_clean_sequence and starts_or_ends_episode and weak_subtitle_pair


def filter_mechanical_adjacent_splits(selected, target, duration):
    filtered = []
    for item in sorted(selected, key=candidate_value_score, reverse=True):
        if any(mechanical_adjacent_split(item, kept, duration) for kept in filtered):
            continue
        filtered.append(item)
    if not filtered and selected:
        filtered = [max(selected, key=candidate_value_score)]
    return sorted(filtered[:target], key=lambda item: item["start"])


def fill_quality_candidates_after_filter(filtered, ranked_candidates, target, duration):
    filled = list(filtered)
    quality_filter_active = any(candidate_quality_acceptable(item) for item in ranked_candidates)
    for item in sorted(ranked_candidates, key=candidate_value_score, reverse=True):
        if item in filled:
            continue
        if candidate_model_rejected(item):
            continue
        if quality_filter_active and not candidate_quality_acceptable(item):
            continue
        if any(mechanical_adjacent_split(item, kept, duration) for kept in filled):
            continue
        if any(overlap_ratio(item["start"], item["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(item, kept) for kept in filled):
            continue
        if any(candidate_similarity_redundant(item, kept) and not same_scene_intent_variant(item, kept) for kept in filled):
            continue
        filled.append(item)
        if len(filled) >= target:
            break
    return sorted(filled[:target], key=lambda item: item["start"])


def candidate_anchor_key(item):
    traffic = item.get("traffic_material") or {}
    return str(
        item.get("narrative_anchor")
        or traffic.get("duplicate_group_key")
        or item.get("reason")
        or "unanchored"
    )


def balance_anchor_diversity(selected, ranked_candidates, target):
    if target <= 2:
        return selected[:target]
    max_per_anchor = 3 if target >= 5 else 2
    balanced = []
    anchor_counts = {}
    for item in sorted(selected, key=candidate_value_score, reverse=True):
        anchor = candidate_anchor_key(item)
        if anchor_counts.get(anchor, 0) >= max_per_anchor:
            continue
        balanced.append(item)
        anchor_counts[anchor] = anchor_counts.get(anchor, 0) + 1
        if len(balanced) >= target:
            break
    if len(balanced) < min(target, len(selected)):
        for item in sorted(ranked_candidates, key=candidate_value_score, reverse=True):
            if item in balanced:
                continue
            if candidate_model_rejected(item) or not candidate_quality_acceptable(item):
                continue
            anchor = candidate_anchor_key(item)
            if anchor_counts.get(anchor, 0) >= max_per_anchor:
                continue
            if any(candidate_similarity_redundant(item, kept) and not same_scene_intent_variant(item, kept) for kept in balanced):
                continue
            balanced.append(item)
            anchor_counts[anchor] = anchor_counts.get(anchor, 0) + 1
            if len(balanced) >= target:
                break
    return sorted(balanced[:target], key=lambda item: item["start"])


def balance_selected_candidates(selected, target):
    balanced = []
    for item in sorted(selected, key=candidate_value_score, reverse=True):
        if any(overlap_ratio(item["start"], item["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(item, kept) for kept in balanced):
            continue
        balanced.append(item)
        if len(balanced) >= target:
            break
    if len(balanced) < target:
        for item in sorted(selected, key=candidate_value_score, reverse=True):
            if item in balanced:
                continue
            if any(overlap_ratio(item["start"], item["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(item, kept) for kept in balanced):
                continue
            if any_redundant_candidate(item, balanced):
                continue
            balanced.append(item)
            if len(balanced) >= target:
                break
    return balanced


def clip_from_candidate(asset, ep, clip_index, candidate, note=None, engine=None):
    start = max(0.0, float(candidate["start"]))
    end = max(start + 0.1, float(candidate["end"]))
    traffic_material = candidate.get("traffic_material") or {}
    source_identity = source_identity_from_filename(asset.get("filename") or Path(asset.get("path") or "").name, ep)
    return {
        "id": f"{ep}_{clip_index:02d}",
        "episode": ep,
        "clip_index": clip_index,
        "source_video": asset["path"],
        "preview_video": asset["path"],
        **source_identity,
        "suggested_start": start,
        "suggested_end": end,
        "start": start,
        "end": end,
        "duration": round(end - start, 3),
        "score": candidate.get("score"),
        "status": "pending",
        "note": note or "Commercial material pick: scene completeness + traffic hook score + duplicate control; review before export.",
        "selection_engine": engine or "v8.33.2 multi_source_material_picker",
        "reason": candidate.get("reason", ""),
        "variant": candidate.get("variant", ""),
        "narrative_anchor": candidate.get("narrative_anchor", ""),
        "semantic_entry_allowed": bool(candidate.get("semantic_entry_allowed")),
        "internal_validation": candidate.get("internal_validation") or {},
        "model_decision": candidate.get("model_decision", ""),
        "model_reject_overridden": candidate.get("model_reject_overridden", ""),
        "clip_intent": candidate.get("clip_intent") or candidate_clip_intent(candidate),
        "selection_reason": candidate.get("selection_reason") or candidate_selection_reason(candidate),
        "traffic_material": traffic_material,
        "initial_model_review": candidate.get("initial_model_review") or {},
        "model_score": candidate.get("model_score"),
        "model_reason": candidate.get("model_reason", ""),
        "model_risks": candidate.get("model_risks", []),
        "media_features_summary": {
            "scene_group_shots": candidate.get("shot_count", 0),
            "audio_dynamic_range": candidate.get("audio_dynamic_range", 0),
            "audio_samples": candidate.get("audio_samples", 0),
            "audio_tension_score": candidate.get("audio_tension_score", 0),
            "voice_activity_ratio": candidate.get("voice_activity_ratio", 0),
            "quiet_ratio": candidate.get("quiet_ratio", 0),
            "pause_transition_rate": candidate.get("pause_transition_rate", 0),
            "tension_peak": candidate.get("tension_peak", 0),
            "reason": candidate.get("reason", "smart_scene"),
            "variant": candidate.get("variant", ""),
            "clip_intent": candidate.get("clip_intent") or candidate_clip_intent(candidate),
            "selection_reason": candidate.get("selection_reason") or candidate_selection_reason(candidate),
            "narrative_anchor": candidate.get("narrative_anchor", ""),
            "semantic_unit_protected": bool(candidate.get("semantic_unit_protected")),
            "material_labels": traffic_material.get("material_labels", []),
            "commercial_score": traffic_material.get("commercial_score", 0),
            "hook_score": traffic_material.get("hook_score", 0),
            "completeness_score": traffic_material.get("completeness_score", 0),
            "requested_target": candidate.get("requested_target"),
            "recommended_target": candidate.get("recommended_target"),
            "capacity_limited": bool(candidate.get("capacity_limited")),
            "initial_model_source": (candidate.get("initial_model_review") or {}).get("source", ""),
            "initial_model": (candidate.get("initial_model_review") or {}).get("model", ""),
            "selection_strategy": candidate.get("selection_strategy") or candidate_selection_strategy(candidate),
        },
    }


def clip_candidate_redundant_with_existing(candidate, existing_clips):
    candidate_item = {
        "start": float(candidate.get("start") or 0),
        "end": float(candidate.get("end") or 0),
        "traffic_material": candidate.get("traffic_material") or {},
        "reason": candidate.get("reason", ""),
        "variant": candidate.get("variant", ""),
        "semantic_entry_allowed": bool(candidate.get("semantic_entry_allowed")),
        "clip_intent": candidate.get("clip_intent") or candidate_clip_intent(candidate),
        "narrative_anchor": candidate.get("narrative_anchor", ""),
    }
    for clip in existing_clips:
        existing_item = {
            "start": float(clip.get("start") or 0),
            "end": float(clip.get("end") or 0),
            "traffic_material": clip.get("traffic_material") or {},
            "reason": clip.get("reason", ""),
            "variant": clip.get("variant", ""),
            "semantic_entry_allowed": bool(clip.get("semantic_entry_allowed")),
            "clip_intent": clip.get("clip_intent") or candidate_clip_intent(clip),
            "narrative_anchor": clip.get("narrative_anchor", ""),
        }
        same_scene_variant = same_scene_intent_variant(candidate_item, existing_item)
        if candidate_similarity_redundant(candidate_item, existing_item) and not same_scene_variant:
            return True
        if overlap_ratio(candidate_item["start"], candidate_item["end"], existing_item["start"], existing_item["end"]) >= 0.82 and not same_scene_variant:
            return True
    return False


def material_pool_candidate_exists(candidate, existing_clips):
    candidate_start = float(candidate.get("start") or 0)
    candidate_end = float(candidate.get("end") or 0)
    for clip in existing_clips:
        if abs(candidate_start - float(clip.get("start") or 0)) < 0.2 and abs(candidate_end - float(clip.get("end") or 0)) < 0.2:
            return True
    return False


def traffic_material_profile(item, subtitle_segments, duration, target):
    start = float(item.get("start", 0) or 0)
    end = float(item.get("end", start) or start)
    clip_duration = max(0.1, end - start)
    text = subtitle_text_for_window(subtitle_segments, start, end)
    matched_types = []
    keyword_hits = {}
    for key, rule in TRAFFIC_MATERIAL_RULES.items():
        hits = [word for word in rule["keywords"] if word and word in text]
        if hits:
            matched_types.append(key)
            keyword_hits[key] = hits[:6]
    dynamic_range = float(item.get("audio_dynamic_range") or 0)
    shot_count = int(item.get("shot_count") or 0)
    completeness = 0.0
    if 25 <= clip_duration <= 150:
        completeness += 18.0
    if item.get("subtitle_boundary_protected"):
        completeness += 8.0
    if item.get("reason") == "subtitle_scene_group":
        completeness += 10.0
    if item.get("subtitle_line_count"):
        completeness += min(8.0, int(item.get("subtitle_line_count") or 0) * 0.8)
    if shot_count:
        completeness += min(12.0, shot_count * 2.0)
    hook_score = 0.0
    hook_score += min(24.0, len(matched_types) * 7.0)
    hook_score += min(16.0, sum(len(values) for values in keyword_hits.values()) * 1.4)
    hook_score += min(18.0, dynamic_range * 0.45)
    early_bonus = max(0.0, 8.0 * (1.0 - start / max(duration, 1.0)))
    diversity_bonus = min(10.0, len(matched_types) * 2.0)
    capacity_score = completeness + hook_score + early_bonus + diversity_bonus
    labels = [TRAFFIC_MATERIAL_RULES[key]["label"] for key in matched_types]
    if not labels:
        labels = ["完整场景素材" if completeness >= 20 else "低证据素材"]
    recommended = max(1, min(int(target or 1), int(max(1, duration // max(35.0, min(75.0, clip_duration)))) + 1))
    return {
        "material_types": matched_types,
        "material_labels": labels,
        "keyword_hits": keyword_hits,
        "commercial_score": round(capacity_score, 2),
        "hook_score": round(hook_score, 2),
        "completeness_score": round(completeness, 2),
        "duplicate_group_key": f"{round(start / 8) * 8:.0f}-{round(end / 8) * 8:.0f}",
        "episode_capacity_hint": recommended,
        "subtitle_text_available": bool(text),
    }


def episode_material_capacity(scored, duration, requested_target):
    if not scored:
        return 0
    strong = [item for item in scored if (item.get("traffic_material") or {}).get("commercial_score", 0) >= 42]
    medium = [item for item in scored if (item.get("traffic_material") or {}).get("commercial_score", 0) >= 28]
    subtitle_available = any(int(item.get("subtitle_segments") or 0) > 0 for item in scored)
    visual_scene_count = len([item for item in scored if item.get("reason") == "visual_scene_group"])
    narrative_anchor_count = len(set(item.get("narrative_anchor") for item in scored if item.get("narrative_anchor")))
    useful_variant_count = len([item for item in scored if item.get("variant") and (item.get("traffic_material") or {}).get("commercial_score", 0) >= 24])
    if subtitle_available:
        variant_capacity = max(narrative_anchor_count, useful_variant_count, len(strong), len(medium))
        scene_capacity = variant_capacity or max(1, int(duration // 70))
    else:
        scene_capacity = max(len(strong), min(len(medium), max(1, visual_scene_count)), max(1, int(duration // 55)))
    duration_capacity = max(1, int(duration // 45)) if duration else requested_target
    return max(1, min(int(requested_target or 1), scene_capacity, duration_capacity))


def candidate_selection_target(scored, duration, requested_target):
    requested_target = max(1, int(requested_target or 1))
    base_target = episode_material_capacity(scored, duration, requested_target)
    hook_anchor_count = len(set(
        item.get("narrative_anchor")
        for item in scored
        if item.get("narrative_anchor") and candidate_has_hook_evidence(item)
    ))
    if hook_anchor_count:
        return max(base_target, min(requested_target, 1 + hook_anchor_count))
    return base_target


def subtitle_segments_for_video(video_path):
    probe_clip = {"source_video": str(video_path), "start": 0, "end": max(1.0, ffprobe_duration(video_path))}
    subtitles = subtitle_segments_for_clip(probe_clip)
    return subtitles.get("segments") or []


SEMANTIC_CONNECTOR_TEXTS = {"啊", "嗯", "哦", "对", "是", "是啊", "对啊", "好", "好啊", "不是", "等等"}
SEMANTIC_VOCATIVE_WORDS = ["站住", "臭", "贱", "疯子", "你", "我"]
SEMANTIC_COMPLETION_WORDS = ["多好", "才对", "就好", "算了", "罢了", "而已", "啊", "呀", "呢", "吧", "吗", "嘛"]
SEMANTIC_SHORT_QUESTION_WORDS = ["哪里", "在哪", "是谁", "什么", "怎么", "为何", "为什么"]
CLIMAX_CONTINUATION_WORDS = [
    "猎物", "殉情", "杀", "死", "打", "勾引", "狗屁", "老子", "小白脸", "地盘",
    "嫁给", "之后", "机会", "不珍惜", "给你", "你要", "我让", "你就是",
]
DECLARATIVE_BEAT_WORDS = ["看你往哪儿跑", "跟他殉情", "你就是我的猎物", "我的猎物"]
EXPLANATION_BEAT_START_WORDS = ["我自从", "给你", "你要", "你唱什么", "在老子的地盘"]


def subtitle_plain_text(value):
    return re.sub(r"\s+", "", str(value or "").strip())


def text_has_traffic_keywords(text):
    return any(
        word and word in text
        for rule in TRAFFIC_MATERIAL_RULES.values()
        for word in rule["keywords"]
    )


def text_has_climax_continuation(text):
    cleaned = subtitle_plain_text(text)
    return bool(cleaned and any(word in cleaned for word in CLIMAX_CONTINUATION_WORDS))


def declarative_beat_endpoint(prev_text, next_text=""):
    prev_cleaned = subtitle_plain_text(prev_text)
    next_cleaned = subtitle_plain_text(next_text)
    if not prev_cleaned:
        return False
    if any(word in prev_cleaned for word in DECLARATIVE_BEAT_WORDS):
        return True
    if "殉情" in prev_cleaned and any(word in next_cleaned for word in EXPLANATION_BEAT_START_WORDS):
        return True
    if "猎物" in prev_cleaned and any(word in next_cleaned for word in EXPLANATION_BEAT_START_WORDS):
        return True
    return False


def declarative_beat_endpoints(segments):
    endpoints = []
    for index, segment in enumerate(segments or []):
        next_segment = segments[index + 1] if index + 1 < len(segments) else None
        next_text = next_segment.get("text", "") if next_segment else ""
        if declarative_beat_endpoint(segment.get("text", ""), next_text):
            try:
                endpoints.append(float(segment.get("end", 0)))
            except Exception:
                pass
    return sorted(set(round(value, 3) for value in endpoints if value > 0))


def is_declarative_beat_endpoint_time(end, subtitle_segments, tolerance=0.22):
    segments = normalized_subtitle_segments(subtitle_segments, float(end or 0) + 1.0)
    try:
        end = float(end)
    except Exception:
        return False
    for index, segment in enumerate(segments):
        try:
            segment_end = float(segment.get("end", 0))
        except Exception:
            continue
        if abs(segment_end - end) > tolerance:
            continue
        next_segment = segments[index + 1] if index + 1 < len(segments) else None
        next_text = next_segment.get("text", "") if next_segment else ""
        return declarative_beat_endpoint(segment.get("text", ""), next_text)
    return False


def short_semantic_connector(text):
    cleaned = subtitle_plain_text(text).strip("，。！？、,.!? ")
    return bool(cleaned and (cleaned in SEMANTIC_CONNECTOR_TEXTS or (len(cleaned) <= 3 and any(word in cleaned for word in SEMANTIC_VOCATIVE_WORDS))))


def semantic_completion_text(text):
    cleaned = subtitle_plain_text(text)
    return bool(cleaned and any(word in cleaned for word in SEMANTIC_COMPLETION_WORDS))


def semantic_short_question(text):
    cleaned = subtitle_plain_text(text).strip("，。！？、,.!? ")
    return bool(cleaned and len(cleaned) <= 8 and any(word in cleaned for word in SEMANTIC_SHORT_QUESTION_WORDS))


def semantic_continuation(prev_segment, next_segment, current_start=None, max_duration=45.0):
    try:
        gap = float(next_segment.get("start", 0)) - float(prev_segment.get("end", 0))
        group_start = float(current_start if current_start is not None else prev_segment.get("start", 0))
        next_end = float(next_segment.get("end", 0))
    except Exception:
        return False
    if gap > 1.25:
        return False
    projected_duration = next_end - group_start
    prev_text = subtitle_plain_text(prev_segment.get("text", ""))
    next_text = subtitle_plain_text(next_segment.get("text", ""))
    if not prev_text or not next_text:
        return False
    prev_hook = text_has_traffic_keywords(prev_text)
    next_hook = text_has_traffic_keywords(next_text)
    if prev_hook and next_hook and projected_duration <= max_duration + 8:
        return True
    if (short_semantic_connector(prev_text) or short_semantic_connector(next_text)) and projected_duration <= max_duration:
        return True
    if semantic_short_question(next_text) and projected_duration <= max_duration:
        return True
    if semantic_completion_text(next_text) and projected_duration <= max_duration:
        return True
    return False


def semantic_unit_span_for_segment(segments, index, max_duration=45.0):
    if index is None or index < 0 or index >= len(segments):
        return index, index
    unit_start = index
    unit_end = index
    while unit_start > 0 and semantic_continuation(segments[unit_start - 1], segments[unit_start], segments[unit_start - 1].get("start", 0), max_duration=max_duration):
        unit_start -= 1
    while unit_end + 1 < len(segments) and semantic_continuation(segments[unit_end], segments[unit_end + 1], segments[unit_start].get("start", 0), max_duration=max_duration):
        unit_end += 1
    return unit_start, unit_end


def semantic_entry_tail_risk(start, subtitle_segments, duration):
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    if not segments:
        return False
    try:
        start = float(start)
    except Exception:
        return False
    entry_index = None
    for index, segment in enumerate(segments):
        if abs(float(segment.get("start", 0)) - start) <= 0.18:
            entry_index = index
            break
    if entry_index is None:
        for index, segment in enumerate(segments):
            if float(segment.get("start", 0)) - 0.18 <= start <= float(segment.get("end", 0)) + 0.18:
                entry_index = index
                break
    if entry_index is None:
        return False
    unit_start, unit_end = semantic_unit_span_for_segment(segments, entry_index)
    remaining_lines = unit_end - entry_index + 1
    if remaining_lines <= 1 and unit_end > unit_start:
        return True
    entry_text = subtitle_plain_text(segments[entry_index].get("text", ""))
    previous_text = subtitle_plain_text(segments[entry_index - 1].get("text", "")) if entry_index > 0 else ""
    continuation_markers = ["也", "都", "就是", "还要", "再", "不也"]
    deep_inside_unit = entry_index - unit_start >= 4
    if (
        deep_inside_unit
        and previous_text
        and text_has_traffic_keywords(previous_text)
        and text_has_traffic_keywords(entry_text)
        and any(marker in entry_text for marker in continuation_markers)
    ):
        return True
    return bool(remaining_lines <= 1 and semantic_completion_text(entry_text))


def entry_setup_repair_start(start, subtitle_segments, duration):
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    if not segments:
        return float(start), False
    try:
        start = float(start)
    except Exception:
        return 0.0, False
    entry_index = None
    for index, segment in enumerate(segments):
        if abs(float(segment.get("start", 0)) - start) <= 0.18:
            entry_index = index
            break
    if entry_index is None or entry_index <= 0:
        return start, False
    current = segments[entry_index]
    previous = segments[entry_index - 1]
    gap = float(current.get("start", 0)) - float(previous.get("end", 0))
    if gap > 0.55:
        return start, False
    current_text = subtitle_plain_text(current.get("text", ""))
    previous_text = subtitle_plain_text(previous.get("text", ""))
    current_is_threat = text_has_traffic_keywords(current_text) and any(word in current_text for word in ("杀", "死", "打", "滚", "跪", "疯"))
    previous_is_setup = (
        short_semantic_connector(previous_text)
        or any(word in previous_text for word in ("站住", "听着", "等等", "别跑", "回来", "过来"))
    )
    if current_is_threat and previous_is_setup:
        return max(0.0, float(previous.get("start", 0))), True
    return start, False


def climax_continuation_repair_end(end, subtitle_segments, duration, max_extend=36.0):
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    if not segments:
        return float(end), False
    try:
        end = float(end)
        duration = float(duration or end)
    except Exception:
        return 0.0, False
    previous_index = None
    next_index = None
    for index, segment in enumerate(segments):
        segment_start = float(segment.get("start", 0))
        segment_end = float(segment.get("end", 0))
        if segment_end <= end + 0.18:
            previous_index = index
            continue
        if segment_start >= end - 0.18:
            next_index = index
            break
    if previous_index is None or next_index is None:
        return end, False
    previous = segments[previous_index]
    next_segment = segments[next_index]
    if float(next_segment.get("start", 0)) - float(previous.get("end", 0)) > 0.75:
        return end, False
    if declarative_beat_endpoint(previous.get("text", ""), next_segment.get("text", "")):
        return end, False
    recent = segments[max(0, previous_index - 4):previous_index + 1]
    upcoming = segments[next_index:min(len(segments), next_index + 12)]
    recent_text = "".join(str(item.get("text") or "") for item in recent)
    upcoming_text = "".join(str(item.get("text") or "") for item in upcoming)
    if not text_has_climax_continuation(recent_text) or not text_has_climax_continuation(upcoming_text):
        return end, False
    repaired_end = end
    for segment in upcoming:
        gap = float(segment.get("start", 0)) - repaired_end
        if gap > 1.2:
            break
        text = subtitle_plain_text(segment.get("text", ""))
        if not (
            text_has_climax_continuation(text)
            or short_semantic_connector(text)
            or semantic_completion_text(text)
            or len(text) <= 3
        ):
            break
        repaired_end = float(segment.get("end", repaired_end))
        if repaired_end - end >= max_extend or duration - repaired_end <= 1.5:
            repaired_end = min(duration, repaired_end)
            break
    if repaired_end > end + 1.0:
        return round(min(duration, repaired_end), 3), True
    return end, False


def normalized_subtitle_segments(subtitle_segments, duration):
    segments = []
    for segment in subtitle_segments or []:
        try:
            start = float(segment.get("start", 0))
            end = float(segment.get("end", 0))
        except Exception:
            continue
        text = str(segment.get("text") or "").strip()
        if not text or end <= start:
            continue
        segments.append({"start": max(0.0, start), "end": min(duration, end), "text": text})
    return sorted(segments, key=lambda item: (item["start"], item["end"]))


def subtitle_semantic_units(subtitle_segments, duration):
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    if not segments:
        return []
    units = []
    current = [segments[0]]
    for segment in segments[1:]:
        if semantic_continuation(current[-1], segment, current[0]["start"]):
            current.append(segment)
        else:
            units.append(current)
            current = [segment]
    if current:
        units.append(current)
    result = []
    for index, unit in enumerate(units):
        result.append({
            "index": index,
            "start": unit[0]["start"],
            "end": unit[-1]["end"],
            "line_count": len(unit),
            "text": " ".join(str(item.get("text") or "") for item in unit),
        })
    return result


def semantic_protected_window(start, end, subtitle_segments, duration, extend_adjacent=True, protect_start=True, protect_end=True):
    protected_start, protected_end, protected = dialogue_protected_window(start, end, subtitle_segments, duration, extend_adjacent=extend_adjacent)
    boundary_start = protected_start
    boundary_end = protected_end
    semantic_protected = False
    for unit in subtitle_semantic_units(subtitle_segments, duration):
        unit_start = float(unit["start"])
        unit_end = float(unit["end"])
        if unit_end <= unit_start:
            continue
        start_inside = unit_start - 0.05 <= boundary_start <= unit_end + 0.05
        end_inside = unit_start - 0.05 <= boundary_end <= unit_end + 0.05
        if protect_start and start_inside and boundary_start - unit_start >= 0.35:
            protected_start = unit_start
            semantic_protected = True
        if protect_end and end_inside and unit_end - boundary_end >= 0.35:
            protected_end = unit_end
            semantic_protected = True
    protected_start = max(0.0, round(protected_start, 3))
    protected_end = min(duration, round(max(protected_start + 0.1, protected_end), 3))
    return protected_start, protected_end, bool(protected or semantic_protected), semantic_protected


def dialogue_protected_window(start, end, subtitle_segments, duration, extend_adjacent=True):
    """Expand or trim a window so it does not start/end inside a subtitle line."""
    protected_start = max(0.0, float(start))
    protected_end = min(max(protected_start + 0.1, float(end)), max(float(duration or 0), protected_start + 0.1))
    original_end = protected_end
    boundary_start = protected_start
    boundary_end = protected_end
    adjacent_limit = min(float(duration or protected_end), original_end + 3.0)
    protected = False
    for segment in subtitle_segments or []:
        try:
            segment_start = float(segment.get("start", 0))
            segment_end = float(segment.get("end", 0))
        except Exception:
            continue
        if segment_end <= segment_start:
            continue
        if segment_start < boundary_start < segment_end:
            protected_start = max(0.0, segment_start - 0.35)
            protected = True
        if segment_start < boundary_end < segment_end:
            protected_end = min(duration, segment_end + 0.55)
            protected = True
        if extend_adjacent and boundary_end < adjacent_limit and 0.0 <= segment_start - boundary_end <= 0.55:
            protected_end = min(duration, adjacent_limit, segment_end + 0.55)
            protected = True
    if protected_end <= protected_start:
        protected_end = min(duration, protected_start + 0.1)
    return round(protected_start, 3), round(protected_end, 3), protected


def has_dialogue_blocker(start, end, subtitle_segments):
    try:
        clip_start = float(start)
        clip_end = float(end)
    except Exception:
        return False
    for segment in subtitle_segments or []:
        try:
            segment_start = float(segment.get("start", 0))
            segment_end = float(segment.get("end", 0))
        except Exception:
            continue
        if segment_end <= segment_start:
            continue
        if segment_start < clip_start < segment_end:
            return True
        if segment_start < clip_end < segment_end:
            return True
    return False


def internal_clip_validation(item, subtitle_segments, duration):
    """Internal hard validation: repair/reject clips that cut a spoken sentence or local continuation."""
    try:
        start = float(item.get("start", 0) or 0)
        end = float(item.get("end", start) or start)
        duration = float(duration or max(end, 0.1))
    except Exception:
        item["internal_validation"] = {"status": "reject", "reason": "invalid_time"}
        return None
    if not subtitle_segments:
        if end < start + 3.0:
            item["internal_validation"] = {"status": "reject", "reason": "too_short"}
            return None
        item["internal_validation"] = {"status": "pass", "reason": "no_subtitle"}
        return item
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    protected_start, protected_end, protected = dialogue_protected_window(start, end, segments, duration, extend_adjacent=False)
    semantic_protected = False

    def current_segment_at(time_value):
        for index, segment in enumerate(segments):
            if abs(float(segment["start"]) - time_value) <= 0.08:
                return index, segment
        for index, segment in enumerate(segments):
            if float(segment["start"]) - 0.05 <= time_value <= float(segment["end"]) + 0.05:
                return index, segment
        return None, None

    def previous_and_next_at_end(time_value):
        previous = None
        next_segment = None
        for segment in segments:
            if float(segment["end"]) <= time_value + 0.12:
                previous = segment
                continue
            if float(segment["start"]) >= time_value - 0.12:
                next_segment = segment
                break
        return previous, next_segment

    for _ in range(4):
        previous, next_segment = previous_and_next_at_end(protected_end)
        if not previous or not next_segment:
            break
        gap = float(next_segment["start"]) - float(previous["end"])
        if gap > 1.25 or float(next_segment["end"]) - end > 12.0:
            break
        previous_text = subtitle_plain_text(previous.get("text", ""))
        next_text = subtitle_plain_text(next_segment.get("text", ""))
        continues = (
            semantic_continuation(previous, next_segment, float(previous["start"]), max_duration=18.0)
            or semantic_completion_text(next_text)
            or short_semantic_connector(next_text)
            or (text_has_traffic_keywords(previous_text) and text_has_traffic_keywords(next_text))
        )
        if not continues:
            break
        protected_end = min(duration, round(float(next_segment["end"]) + 0.35, 3))
        semantic_protected = True

    climax_end, climax_fixed = climax_continuation_repair_end(protected_end, segments, duration)
    if climax_fixed and climax_end > protected_end:
        protected_end = min(duration, round(climax_end, 3))
        semantic_protected = True

    if not item.get("semantic_entry_allowed"):
        for _ in range(3):
            index, current = current_segment_at(protected_start)
            if index is None or index <= 0:
                break
            previous = segments[index - 1]
            gap = float(current["start"]) - float(previous["end"])
            if gap > 1.25 or start - float(previous["start"]) > 10.0:
                break
            if not semantic_continuation(previous, current, float(previous["start"]), max_duration=18.0):
                break
            protected_start = max(0.0, round(float(previous["start"]), 3))
            semantic_protected = True

    setup_start, setup_fixed = entry_setup_repair_start(protected_start, segments, duration)
    if setup_fixed and setup_start < protected_start:
        protected_start = round(max(0.0, setup_start), 3)
        semantic_protected = True

    if has_dialogue_blocker(protected_start, protected_end, segments):
        item["internal_validation"] = {
            "status": "reject",
            "reason": "subtitle_line_split_after_repair",
        }
        return None
    if semantic_entry_tail_risk(protected_start, segments, duration):
        item["internal_validation"] = {
            "status": "reject",
            "reason": "semantic_tail_entry",
        }
        return None
    if protected_end < protected_start + 3.0:
        item["internal_validation"] = {"status": "reject", "reason": "too_short_after_repair"}
        return None
    fixed = dict(item)
    fixed["start"] = round(max(0.0, protected_start), 3)
    fixed["end"] = round(min(duration, max(protected_start + 0.1, protected_end)), 3)
    fixed["subtitle_boundary_protected"] = bool(item.get("subtitle_boundary_protected") or protected)
    fixed["semantic_unit_protected"] = bool(item.get("semantic_unit_protected") or semantic_protected)
    fixed["internal_validation"] = {
        "status": "pass",
        "reason": "semantic_sentence_complete",
        "fixed": bool(abs(fixed["start"] - start) > 0.01 or abs(fixed["end"] - end) > 0.01),
    }
    return fixed


def validate_generated_candidates(candidates, subtitle_segments, duration, target=None):
    validated = []
    rejected = []
    for item in candidates or []:
        fixed = internal_clip_validation(item, subtitle_segments, duration)
        if fixed is None:
            rejected.append(dict(item))
            continue
        if any(candidate_similarity_redundant(fixed, kept) and not same_scene_intent_variant(fixed, kept) for kept in validated):
            rejected.append({**dict(item), "internal_validation": {"status": "reject", "reason": "duplicate_after_validation"}})
            continue
        validated.append(fixed)
        if target and len(validated) >= int(target):
            break
    for item in validated:
        item["internal_validation_summary"] = {
            "passed": len(validated),
            "rejected": len(rejected),
            "engine": "subtitle_semantic_unit_guard",
        }
    return validated


def subtitle_scene_candidates(subtitle_segments, duration, profile):
    """Build candidate windows from subtitle gaps so complete dialogue scenes can compete with visual cuts."""
    segments = normalized_subtitle_segments(subtitle_segments, duration)
    if not segments:
        return []
    scenes = []
    current = [segments[0]]
    for segment in segments[1:]:
        gap = segment["start"] - current[-1]["end"]
        current_duration = current[-1]["end"] - current[0]["start"]
        current_lines = len(current)
        keeps_semantic_unit = semantic_continuation(current[-1], segment, current[0]["start"], max_duration=min(profile["max"], profile["preferred"] * 1.18))
        if not keeps_semantic_unit and (gap >= 2.2 or current_duration >= profile["preferred"] * 0.9 or current_lines >= 12):
            scenes.append(current)
            current = [segment]
        else:
            if keeps_semantic_unit:
                segment["semantic_join"] = True
            current.append(segment)
    if current:
        scenes.append(current)
    candidates = []
    for scene_index, scene in enumerate(scenes):
        previous_end = scenes[scene_index - 1][-1]["end"] if scene_index > 0 else None
        next_start = scenes[scene_index + 1][0]["start"] if scene_index + 1 < len(scenes) else None
        start = max(0.0, scene[0]["start"] - 0.45)
        if previous_end is not None:
            start = min(scene[0]["start"], max(start, min(duration, previous_end + 0.12)))
        end = min(duration, scene[-1]["end"] + 0.75)
        if next_start is not None:
            end = min(end, max(scene[-1]["end"], next_start - 0.12))
        scene_duration = end - start
        if scene_duration < max(12.0, profile["min"] * 0.55):
            continue
        semantic_joined = any(bool(segment.get("semantic_join")) for segment in scene)
        if scene_duration > profile["preferred"] * 1.12:
            limit_multiplier = 1.32 if semantic_joined else 1.12
            limit = min(duration, start + min(profile["max"], profile["preferred"] * limit_multiplier))
            safe_end = scene[-1]["end"]
            for segment in scene:
                if segment["end"] <= limit:
                    safe_end = segment["end"]
                else:
                    break
            end = min(duration, max(start + max(12.0, profile["min"] * 0.55), safe_end))
            scene_duration = end - start
        line_count = len(scene)
        duration_score = max(0.0, 30.0 - abs(scene_duration - profile["preferred"]) * 0.3)
        dialogue_score = min(24.0, line_count * 2.2)
        early_score = max(0.0, 8.0 * (1.0 - start / max(duration, 1.0)))
        scene_text = " ".join(str(segment.get("text") or "") for segment in scene)
        candidates.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "shot_count": 0,
            "base_score": duration_score + dialogue_score + early_score + 10.0,
            "reason": "subtitle_scene_group",
            "variant": "complete_scene",
            "narrative_anchor": f"subtitle_scene_{scene_index}",
            "subtitle_line_count": line_count,
        })
        if line_count >= 4 and scene_duration >= profile["min"] * 0.9:
            hook_segment = scene[min(max(1, line_count // 3), line_count - 1)]
            hook_start = max(start, hook_segment["start"])
            hook_end = min(end, max(hook_start + max(16.0, profile["min"] * 0.6), scene[-1]["end"]))
            if hook_end - hook_start >= max(14.0, profile["min"] * 0.45):
                if not semantic_entry_tail_risk(hook_start, segments, duration):
                    candidates.append({
                        "start": round(hook_start, 3),
                        "end": round(hook_end, 3),
                        "shot_count": 0,
                        "base_score": duration_score + dialogue_score + early_score + 15.0,
                        "reason": "subtitle_scene_variant",
                        "variant": "mid_hook_to_scene_end",
                        "narrative_anchor": f"subtitle_scene_{scene_index}",
                        "subtitle_line_count": max(1, line_count - min(max(1, line_count // 3), line_count - 1)),
                    })
        hook_keywords = [word for rule in TRAFFIC_MATERIAL_RULES.values() for word in rule["keywords"] if word and word in scene_text]
        if hook_keywords and line_count >= 3:
            hit_indexes = []
            for index, segment in enumerate(scene):
                text = str(segment.get("text") or "")
                if any(word in text for word in hook_keywords):
                    hit_indexes.append(index)
            hit_index = hit_indexes[0] if hit_indexes else 0
            hook_segment = scene[hit_index]
            hook_start = max(start, hook_segment["start"])
            next_beat_end = scenes[scene_index + 1][min(1, len(scenes[scene_index + 1]) - 1)]["end"] if scene_index + 1 < len(scenes) else end
            max_variant_duration = min(profile["max"], profile["preferred"] * 1.05, 72.0)
            beat_endpoints = [
                value for value in (
                    declarative_beat_endpoints(scene)
                    + (declarative_beat_endpoints(scenes[scene_index + 1]) if scene_index + 1 < len(scenes) else [])
                )
                if value > hook_start and value <= min(duration, hook_start + max_variant_duration)
            ]
            hook_end = min(duration, max(hook_start + max(18.0, profile["min"] * 0.65), next_beat_end))
            hook_end = min(hook_end, hook_start + max_variant_duration)
            if hook_end - hook_start <= profile["max"] * 1.08 and hook_end - hook_start >= max(16.0, profile["min"] * 0.5):
                candidates.append({
                    "start": round(hook_start, 3),
                    "end": round(hook_end, 3),
                    "shot_count": 0,
                    "base_score": duration_score + dialogue_score + early_score + 18.0,
                    "reason": "subtitle_hook_variant",
                    "variant": "hook_to_next_beat",
                    "narrative_anchor": f"subtitle_scene_{scene_index}",
                    "subtitle_line_count": max(1, line_count - hit_index),
                })
            for beat_order, beat_end in enumerate(beat_endpoints[:3]):
                if beat_end - hook_start < max(16.0, profile["min"] * 0.45):
                    continue
                candidates.append({
                    "start": round(hook_start, 3),
                    "end": round(beat_end, 3),
                    "shot_count": 0,
                    "base_score": duration_score + dialogue_score + early_score + 18.5 - min(3.0, beat_order * 0.8),
                    "reason": "subtitle_declarative_endpoint_variant",
                    "variant": "statement_beat_endpoint",
                    "narrative_anchor": f"subtitle_scene_{scene_index}",
                    "subtitle_line_count": max(1, line_count - hit_index),
                    "semantic_entry_allowed": True,
                })
            for entry_order, entry_index in enumerate(hit_indexes[:4]):
                entry_segment = scene[entry_index]
                entry_start = max(start, entry_segment["start"])
                entry_start, _ = entry_setup_repair_start(entry_start, segments, duration)
                if semantic_entry_tail_risk(entry_start, segments, duration):
                    continue
                entry_end = min(end, max(entry_start + max(18.0, profile["min"] * 0.6), scene[-1]["end"]))
                entry_end = min(entry_end, entry_start + max_variant_duration)
                if entry_end - entry_start < max(16.0, profile["min"] * 0.5):
                    continue
                candidates.append({
                    "start": round(entry_start, 3),
                    "end": round(entry_end, 3),
                    "shot_count": 0,
                    "base_score": duration_score + dialogue_score + early_score + 17.0 - min(4.0, entry_order * 1.2),
                    "reason": "subtitle_conflict_entry_variant",
                    "variant": "conflict_entry_to_scene_end",
                    "narrative_anchor": f"subtitle_scene_{scene_index}",
                    "subtitle_line_count": max(1, line_count - entry_index),
                    "semantic_entry_allowed": True,
                })
    return candidates


def smart_scene_candidates_for_asset(asset, target, progress_callback=None):
    video_path = safe_path(asset["path"])
    duration = ffprobe_duration(video_path)
    profile = episode_duration_profile(asset.get("episode", 1))
    if progress_callback:
        progress_callback(8, "读取字幕与镜头信息")
    cache_dir = media_cache_dir_for({"source_video": str(video_path), "start": 0, "end": max(duration, 1.0)})
    scene_points = analyze_scene_points(video_path, 0.0, max(duration, 1.0), cache_dir)
    subtitle_segments = subtitle_segments_for_video(video_path)
    boundaries = unique_boundaries(scene_points, duration)
    if progress_callback:
        progress_callback(18, "生成候选片段")
    candidates = []
    candidates.extend(subtitle_scene_candidates(subtitle_segments, duration, profile))
    for start_index, start in enumerate(boundaries[:-1]):
        if start >= max(0.0, duration - 8.0):
            continue
        for end_index in range(start_index + 1, min(len(boundaries), start_index + 18)):
            end = boundaries[end_index]
            clip_duration = end - start
            if clip_duration < profile["min"]:
                continue
            if clip_duration > profile["max"]:
                break
            shot_count = max(0, end_index - start_index - 1)
            duration_score = max(0.0, 28.0 - abs(clip_duration - profile["preferred"]) * 0.35)
            shot_score = min(20.0, shot_count * 2.5)
            early_score = max(0.0, 10.0 * (1.0 - (start / max(duration, 1.0))))
            candidates.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "shot_count": shot_count,
                "base_score": duration_score + shot_score + early_score,
                "reason": "visual_scene_group",
            })
    if not candidates:
        for start, end, base_score, reason in fallback_windows(duration, target, profile):
            candidates.append({"start": start, "end": end, "shot_count": 0, "base_score": base_score, "reason": reason})
    subtitle_candidates = [item for item in candidates if item.get("reason") == "subtitle_scene_group"]
    subtitle_variant_candidates = [
        item for item in candidates
        if str(item.get("reason") or "").startswith("subtitle_") and item.get("reason") != "subtitle_scene_group"
    ]
    visual_candidates = [
        item for item in candidates
        if not str(item.get("reason") or "").startswith("subtitle_")
    ]
    visual_candidates = sorted(visual_candidates, key=lambda item: item["base_score"], reverse=True)[: max(target * 8, 16)]
    candidates = subtitle_candidates + subtitle_variant_candidates + visual_candidates
    if progress_callback:
        progress_callback(26, "分析候选片段")
    scored = []
    total_candidates = max(1, len(candidates))
    for candidate_index, item in enumerate(candidates, start=1):
        semantic_protected = False
        if item.get("reason") == "subtitle_scene_group":
            initial_start = round(max(0.0, float(item["start"])), 3)
            initial_end = round(min(duration, max(initial_start + 0.1, float(item["end"]))), 3)
            protected_start, protected_end, protected, semantic_protected = semantic_protected_window(
                initial_start,
                initial_end,
                subtitle_segments,
                duration,
            )
            protected = True
        elif str(item.get("reason") or "").startswith("subtitle_"):
            declarative_endpoint_candidate = item.get("reason") == "subtitle_declarative_endpoint_variant"
            protected_start, protected_end, protected, semantic_protected = semantic_protected_window(
                item["start"],
                item["end"],
                subtitle_segments,
                duration,
                extend_adjacent=False,
                protect_start=not bool(item.get("semantic_entry_allowed")),
                protect_end=not declarative_endpoint_candidate,
            )
            protected = True
        else:
            protected_start, protected_end, protected, semantic_protected = semantic_protected_window(
                item["start"],
                item["end"],
                subtitle_segments,
                duration,
            )
        try:
            audio = analyze_audio_profile(video_path, protected_start, protected_end, cache_dir)
            dynamic_range = float(audio.get("dynamic_range") or 0)
            audio_samples = int(audio.get("samples") or 0)
            audio_tension_score = float(audio.get("audio_tension_score") or 0)
            voice_activity_ratio = float(audio.get("voice_activity_ratio") or 0)
            quiet_ratio = float(audio.get("quiet_ratio") or 0)
            pause_transition_rate = float(audio.get("pause_transition_rate") or 0)
            tension_peak = float(audio.get("tension_peak") or 0)
        except Exception:
            dynamic_range = 0.0
            audio_samples = 0
            audio_tension_score = 0.0
            voice_activity_ratio = 0.0
            quiet_ratio = 0.0
            pause_transition_rate = 0.0
            tension_peak = 0.0
        duration_value = protected_end - protected_start
        subtitle_score = 8.0 if protected else (3.0 if subtitle_segments else 0.0)
        final_score = item["base_score"] + min(30.0, dynamic_range * 0.8) + min(8.0, duration_value / 12.0) + subtitle_score
        scored_item = {
            **item,
            "start": protected_start,
            "end": protected_end,
            "score": round(final_score, 2),
            "audio_dynamic_range": round(dynamic_range, 2),
            "audio_samples": audio_samples,
            "audio_tension_score": round(audio_tension_score, 2),
            "voice_activity_ratio": round(voice_activity_ratio, 3),
            "quiet_ratio": round(quiet_ratio, 3),
            "pause_transition_rate": round(pause_transition_rate, 3),
            "tension_peak": round(tension_peak, 2),
            "subtitle_boundary_protected": protected,
            "semantic_unit_protected": bool(semantic_protected),
            "subtitle_segments": len(subtitle_segments),
            "subtitle_line_count": int(item.get("subtitle_line_count") or 0),
        }
        scored_item["traffic_material"] = traffic_material_profile(scored_item, subtitle_segments, duration, target)
        scored_item["score"] = round(final_score + scored_item["traffic_material"]["commercial_score"] * 0.55, 2)
        enrich_candidate_intent(scored_item)
        scored.append(scored_item)
        if progress_callback and (candidate_index == total_candidates or candidate_index % 8 == 0):
            local_progress = 26 + int(candidate_index / total_candidates * 34)
            progress_callback(local_progress, "分析候选片段")
    requested_target = max(1, int(target or 1))
    recommended_target = episode_material_capacity(scored, duration, requested_target)
    quality_available = any((item.get("traffic_material") or {}).get("commercial_score", 0) >= 28 for item in scored)
    selection_target = candidate_selection_target(scored, duration, requested_target)
    if progress_callback:
        progress_callback(64, "AI 初筛候选")
    ranked_scored, initial_model_review = model_review_initial_clip_candidates(asset, sorted(scored, key=lambda value: value["score"], reverse=True), requested_target, duration)
    for item in ranked_scored:
        candidate_selection_strategy(item)
    ranked_scored = sorted(ranked_scored, key=candidate_value_score, reverse=True)
    quality_capacity = len([item for item in ranked_scored if candidate_quality_acceptable(item)])
    quality_filter_active = quality_capacity > 0
    if quality_capacity > 0:
        selection_target = min(selection_target, quality_capacity)
    selected = []
    subtitle_ranked = [
        item for item in ranked_scored
        if item.get("reason") == "subtitle_scene_group" and not candidate_model_rejected(item) and (not quality_filter_active or candidate_quality_acceptable(item)) and (item.get("traffic_material") or {}).get("commercial_score", 0) >= 28
    ]
    subtitle_reserve = min(len(subtitle_ranked), max(1, int(selection_target * 0.35))) if subtitle_ranked and selection_target > 1 else 0
    for item in subtitle_ranked:
        if len(selected) >= subtitle_reserve:
            break
        if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
            continue
        if any_redundant_candidate(item, selected):
            continue
        selected.append(item)
    variant_ranked = [
        item for item in ranked_scored
        if item.get("variant") and item.get("variant") != "complete_scene" and not candidate_model_rejected(item) and (not quality_filter_active or candidate_quality_acceptable(item)) and (item.get("traffic_material") or {}).get("commercial_score", 0) >= 24
    ]
    variant_reserve = min(len(variant_ranked), max(1, selection_target - subtitle_reserve))
    for item in variant_ranked:
        if len([kept for kept in selected if kept.get("variant") and kept.get("variant") != "complete_scene"]) >= variant_reserve:
            break
        if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
            continue
        if any_redundant_candidate(item, selected):
            continue
        selected.append(item)
    for item in ranked_scored:
        if item in selected:
            continue
        if candidate_model_rejected(item):
            continue
        if quality_filter_active and not candidate_quality_acceptable(item):
            continue
        if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
            continue
        if quality_available and (item.get("traffic_material") or {}).get("commercial_score", 0) < 28:
            continue
        if any_redundant_candidate(item, selected):
            continue
        selected.append(item)
        if len(selected) >= selection_target:
            break
    if len(selected) < selection_target and not quality_available:
        for start, end, base_score, reason in fallback_windows(duration, selection_target * 2, profile):
            protected_start, protected_end, protected = dialogue_protected_window(start, end, subtitle_segments, duration)
            item = {
                "start": protected_start,
                "end": protected_end,
                "shot_count": 0,
                "score": round(base_score + (8.0 if protected else 0.0), 2),
                "audio_dynamic_range": 0,
                "audio_samples": 0,
                "audio_tension_score": 0,
                "voice_activity_ratio": 0,
                "quiet_ratio": 0,
                "pause_transition_rate": 0,
                "tension_peak": 0,
                "reason": reason,
                "subtitle_boundary_protected": protected,
                "semantic_unit_protected": False,
                "subtitle_segments": len(subtitle_segments),
            }
            item["traffic_material"] = traffic_material_profile(item, subtitle_segments, duration, requested_target)
            item["score"] = round(item["score"] + item["traffic_material"]["commercial_score"] * 0.35, 2)
            if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
                continue
            if any_redundant_candidate(item, selected):
                continue
            selected.append(item)
            if len(selected) >= selection_target:
                break
    selected = balance_anchor_diversity(selected, ranked_scored, selection_target)
    selected = balance_selected_candidates(selected, selection_target)
    selected = promote_strong_entry_variants(selected, ranked_scored, selection_target)
    selected = promote_effective_material_exploration(selected, ranked_scored, selection_target, duration)
    if len(selected) < selection_target:
        for item in ranked_scored:
            if item in selected:
                continue
            if candidate_model_rejected(item):
                continue
            if quality_filter_active and not candidate_quality_acceptable(item):
                continue
            if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
                continue
            if any_redundant_candidate(item, selected):
                continue
            if any(overlap_ratio(item["start"], item["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(item, kept) for kept in selected):
                continue
            selected.append(item)
            if len(selected) >= selection_target:
                break
    selected = filter_mechanical_adjacent_splits(selected[:selection_target], selection_target, duration)
    if len(selected) < selection_target:
        selected = fill_quality_candidates_after_filter(selected, ranked_scored, selection_target, duration)
    selected = validate_generated_candidates(selected, subtitle_segments, duration, selection_target)
    selected = promote_strong_entry_variants(selected, ranked_scored, selection_target)
    selected = promote_effective_material_exploration(selected, ranked_scored, selection_target, duration)
    if len(selected) < selection_target:
        for item in ranked_scored:
            if any(item is kept for kept in selected):
                continue
            if candidate_model_rejected(item):
                continue
            if quality_filter_active and not candidate_quality_acceptable(item):
                continue
            if has_dialogue_blocker(item["start"], item["end"], subtitle_segments):
                continue
            fixed = internal_clip_validation(item, subtitle_segments, duration)
            if fixed is None:
                continue
            if any(candidate_similarity_redundant(fixed, kept) and not same_scene_intent_variant(fixed, kept) for kept in selected):
                continue
            if any(overlap_ratio(fixed["start"], fixed["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(fixed, kept) for kept in selected):
                continue
            selected.append(fixed)
            if len(selected) >= selection_target:
                break
    selected = validate_generated_candidates(selected, subtitle_segments, duration, selection_target)
    if progress_callback:
        progress_callback(82, "AI 复核边界")
    selected, boundary_model_review = model_boundary_review_selected_candidates(asset, selected, subtitle_segments, duration, selection_target)
    if len(selected) < selection_target:
        for item in ranked_scored:
            if len(selected) >= selection_target:
                break
            if any(item is kept for kept in selected):
                continue
            if candidate_model_rejected(item):
                continue
            if quality_filter_active and not candidate_quality_acceptable(item):
                continue
            fixed = internal_clip_validation(item, subtitle_segments, duration)
            if fixed is None:
                continue
            if any(candidate_similarity_redundant(fixed, kept) and not same_scene_intent_variant(fixed, kept) for kept in selected):
                continue
            if any(overlap_ratio(fixed["start"], fixed["end"], kept["start"], kept["end"]) >= 0.82 and not same_scene_intent_variant(fixed, kept) for kept in selected):
                continue
            fixed["boundary_model_review"] = boundary_model_review
            fixed["model_boundary_review"] = {
                "source": "rule_after_model_fill",
                "decision": "keep",
                "reason": "大模型复核后候选不足，使用规则验证补位。",
                "risks": [],
            }
            selected.append(fixed)
    final_selection_target = selection_target
    if any(item.get("reason") == "subtitle_declarative_endpoint_variant" for item in ranked_scored):
        final_selection_target = max(selection_target, min(requested_target, selection_target + 2))
    selected = promote_declarative_endpoint_variants(selected, ranked_scored, final_selection_target, subtitle_segments, duration)
    selected = validate_generated_candidates(selected, subtitle_segments, duration, final_selection_target)
    selected = sorted(selected[:final_selection_target], key=lambda item: item["start"])
    if progress_callback:
        progress_callback(94, "整理候选结果")
    for item in selected:
        item["requested_target"] = requested_target
        item["recommended_target"] = len(selected)
        item["capacity_limited"] = len(selected) < requested_target
        item["initial_model_review"] = initial_model_review
        item["boundary_model_review"] = boundary_model_review
    return sorted(selected, key=lambda item: item["start"])


def generate_placeholder_clips(state, per_episode=3, episode_counts=None, episode_start=None, episode_end=None, episodes=None):
    assets = refresh_assets(state)
    assets = filter_assets_by_episode_selection(assets, episode_start, episode_end, episodes)
    overrides = parse_clip_count_overrides(episode_counts)
    clips = []
    plan = {}
    for asset in assets:
        ep = int(asset["episode"])
        target = clip_target_for_asset(asset, per_episode, overrides)
        plan[str(ep)] = {"requested": target, "generated": 0, "capacity_limited": False}
        try:
            candidates = smart_scene_candidates_for_asset(asset, target)
        except Exception as exc:
            duration = 0.0
            try:
                duration = ffprobe_duration(safe_path(asset["path"]))
            except Exception:
                pass
            candidates = [
                {"start": start, "end": end, "shot_count": 0, "score": 0.1, "audio_dynamic_range": 0, "audio_samples": 0, "audio_tension_score": 0, "voice_activity_ratio": 0, "quiet_ratio": 0, "pause_transition_rate": 0, "tension_peak": 0, "reason": f"fallback_after_error: {exc}"}
                for start, end, _, _ in fallback_windows(duration, target, episode_duration_profile(ep))
            ]
        for idx, candidate in enumerate(candidates):
            clips.append(clip_from_candidate(asset, ep, idx, candidate))
        if candidates:
            plan[str(ep)] = {
                "requested": int(candidates[0].get("requested_target", target)),
                "generated": len(candidates),
                "recommended": int(candidates[0].get("recommended_target", len(candidates))),
                "capacity_limited": bool(candidates[0].get("capacity_limited")),
            }
    state["clips"] = clips
    state["workflow_status"] = "smart_clips_generated"
    state["clip_count_plan"] = {"default_per_episode": int(per_episode or 3), "episode_counts": plan, "overrides": {str(k): v for k, v in overrides.items()}}
    limited = {episode: item for episode, item in plan.items() if isinstance(item, dict) and item.get("capacity_limited")}
    message = f"Commercial material clips generated: {len(clips)}; plan {plan}"
    if limited:
        message += f"; capacity limited episodes {limited}"
    set_task(state, "start_clipping", "done", 100, message)
    safe_save_project_state(state)
    return state


def import_current_project_reference():
    state = load_review_state()
    project_name = safe_project_name(state.get("project_name") or Path(state.get("base_dir", "review_project")).name)
    project_dir = project_dir_for(project_name)
    project_dir.mkdir(parents=True, exist_ok=True)
    state["project_name"] = project_name
    state["project_kind"] = "external_reference"
    if not state.get("source_root") and state.get("clips"):
        state["source_root"] = str(Path(state["clips"][0]["source_video"]).resolve().parent)
    state["base_dir"] = str(project_dir.resolve())
    state["output_dir"] = str((project_dir / "exports").resolve())
    project_state = project_dir / "review_state.json"
    project_state.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    save_state(state)
    return {"ok": True, "mode": "external_reference", "copied": 0, "state_path": str(project_state), "project": state_summary(state), "state": state}


def copy_project_assets(state):
    project_name = state.get("project_name") or Path(state.get("base_dir", "review_project")).name
    project_dir = project_dir_for(project_name)
    originals_dir = project_dir / ASSETS_DIR
    originals_dir.mkdir(parents=True, exist_ok=True)
    copied = {}
    for clip in state.get("clips", []):
        src_value = clip.get("source_video")
        if not src_value:
            continue
        src = safe_path(src_value)
        ep = int(clip.get("episode") or src.stem)
        target = originals_dir / f"{ep}.mp4"
        if str(src.resolve()) not in copied:
            if not target.exists() or target.stat().st_size != src.stat().st_size:
                shutil.copy2(src, target)
            copied[str(src.resolve())] = str(target.resolve())
        clip["source_video"] = copied[str(src.resolve())]
        if not clip.get("preview_video") or not Path(str(clip.get("preview_video"))).exists():
            clip["preview_video"] = clip["source_video"]
    state["project_name"] = safe_project_name(project_name)
    state["project_kind"] = "managed_assets"
    state["source_root"] = str(originals_dir.resolve())
    state["base_dir"] = str(project_dir.resolve())
    state["output_dir"] = str((project_dir / "exports").resolve())
    project_state = project_dir / "review_state.json"
    project_state.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    save_state(state)
    return {"ok": True, "copied": len(copied), "project": state_summary(state), "state": state}



REVIEW_STATUSES = {
    "pending": "Pending review",
    "approved": "Approved by reviewer",
    "rejected": "Rejected by reviewer",
    "changes_requested": "Changes requested",
}


FEEDBACK_REASONS = {
    "cut_start": "Missing opening dialogue",
    "cut_end": "Missing ending dialogue",
    "scene_leak": "Leaks into next scene",
    "weak_hook": "Weak hook",
    "too_short": "Too short",
    "too_long": "Too long",
    "wrong_scene": "Wrong scene",
    "manual_review_issue": "Manual review issue",
    "other": "Other issue",
}


def append_task_record(state, kind, status="done", message="", clip_id="", cost=None, meta=None):
    records = state.setdefault("task_records", [])
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    record = {
        "id": uuid.uuid4().hex[:12],
        "kind": kind,
        "status": status,
        "message": message,
        "clip_id": clip_id,
        "created_at": now,
        "updated_at": now,
        "cost": cost or {"model_calls": 0, "estimated_tokens": 0},
        "meta": meta or {},
    }
    records.append(record)
    state["task_records"] = records[-300:]
    return record


def task_record_summary(state):
    records = state.get("task_records", [])
    summary = {"total": len(records), "running": 0, "failed": 0, "done": 0, "estimated_tokens": 0, "model_calls": 0, "recent": records[-8:]}
    for record in records:
        status = record.get("status", "done")
        if status == "error":
            summary["failed"] += 1
        elif status == "running":
            summary["running"] += 1
        else:
            summary["done"] += 1
        cost = record.get("cost") or {}
        summary["estimated_tokens"] += int(cost.get("estimated_tokens") or 0)
        summary["model_calls"] += int(cost.get("model_calls") or 0)
    return summary


def feedback_summary(state):
    counts = {}
    total = 0
    by_clip = {}
    for clip in state.get("clips", []):
        items = clip.get("feedback") or []
        if items:
            by_clip[clip.get("id", "")] = items[-5:]
        for item in items:
            reason = item.get("reason", "other")
            counts[reason] = counts.get(reason, 0) + 1
            total += 1
    top = sorted(({"reason": key, "label": FEEDBACK_REASONS.get(key, key), "count": value} for key, value in counts.items()), key=lambda item: item["count"], reverse=True)
    return {"total": total, "top": top[:8], "by_clip": by_clip, "reasons": FEEDBACK_REASONS}


def review_summary(state):
    counts = {key: 0 for key in REVIEW_STATUSES}
    comments = 0
    recent = []
    for clip in state.get("clips", []):
        status = clip.get("review_status") or "pending"
        if status not in counts:
            counts[status] = 0
        counts[status] += 1
        clip_comments = clip.get("review_comments") or []
        comments += len(clip_comments)
        if clip.get("review_updated_at") or clip_comments:
            recent.append({
                "id": clip.get("id", ""),
                "episode": clip.get("episode", ""),
                "review_status": status,
                "review_label": REVIEW_STATUSES.get(status, status),
                "review_note": clip.get("review_note", ""),
                "reviewer": clip.get("reviewer", ""),
                "updated_at": clip.get("review_updated_at", ""),
                "last_comment": (clip_comments[-1] if clip_comments else {}),
            })
    recent = sorted(recent, key=lambda item: item.get("updated_at") or "", reverse=True)[:12]
    reviewed = sum(counts.get(key, 0) for key in ("approved", "rejected", "changes_requested"))
    total = len(state.get("clips", []))
    return {
        "total": total,
        "reviewed": reviewed,
        "pending": counts.get("pending", 0),
        "approved": counts.get("approved", 0),
        "rejected": counts.get("rejected", 0),
        "changes_requested": counts.get("changes_requested", 0),
        "comments": comments,
        "statuses": REVIEW_STATUSES,
        "recent": recent,
    }


def update_clip_review(state, clip_id, review_status="pending", note="", reviewer="Operator", comment="", start=None, end=None):
    if review_status not in REVIEW_STATUSES:
        review_status = "pending"
    clip = find_clip(state, clip_id)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    boundary_changed = False
    was_exported = False
    if start is not None and end is not None:
        next_start = max(0.0, float(start))
        next_end = max(next_start + 0.5, float(end))
        changed = abs(float(clip.get("start") or 0) - next_start) > 0.001 or abs(float(clip.get("end") or 0) - next_end) > 0.001
        if changed:
            boundary_changed = True
            clip["start"] = round(next_start, 3)
            clip["end"] = round(next_end, 3)
            clip["duration"] = round(next_end - next_start, 1)
            clip["updated_at"] = now
            if clip.get("exported_at") or clip.get("export_path") or clip.get("export_batch_id"):
                was_exported = True
                clip["exported_before_edit_at"] = clip.get("exported_at") or clip.get("exported_before_edit_at", "")
                clip["previous_export_path"] = clip.get("export_path") or clip.get("previous_export_path", "")
                clip.pop("exported_at", None)
                clip.pop("export_path", None)
                clip.pop("export_batch_id", None)
    clip["review_status"] = review_status
    clip["review_label"] = REVIEW_STATUSES[review_status]
    if review_status == "approved":
        clip["status"] = "confirmed"
        clip.pop("export_stale", None)
    elif review_status == "rejected":
        clip["status"] = "needs_edit"
    elif review_status == "changes_requested":
        clip["status"] = "needs_edit"
        if boundary_changed and was_exported:
            clip["export_stale"] = True
    clip["review_note"] = note or clip.get("review_note", "") or ""
    clip["reviewer"] = reviewer or clip.get("reviewer", "Operator")
    clip["review_updated_at"] = now
    if comment:
        clip.setdefault("review_comments", []).append({"text": comment, "reviewer": reviewer or "Operator", "at": now, "status": review_status})
        clip["review_comments"] = clip["review_comments"][-80:]
    append_task_record(state, "review", "done", REVIEW_STATUSES[review_status], clip_id, meta={"review_status": review_status, "reviewer": reviewer or "Operator"})
    persist_review_state(state, "review_status_updated", clip_id)
    return {"ok": True, "clip": clip, "review_summary": review_summary(state), "task_summary": task_record_summary(state)}


def delete_clip_from_project(state, clip_id):
    clip = find_clip(state, clip_id)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    clip["status"] = "deleted"
    clip["review_status"] = "rejected"
    clip["deleted_at"] = now
    clip["delete_reason"] = "operator_deleted"
    append_task_record(state, "clip_deleted", "done", f"Deleted clip {clip_id}", clip_id)
    persist_review_state(state, "clip_deleted", clip_id)
    return {"ok": True, "clip": clip, "state": state}


def write_review_report(state, output_dir=None):
    output_dir = Path(output_dir or state.get("output_dir") or (Path(state.get("base_dir") or ROOT) / "exports"))
    report_dir = output_dir / "review_reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    summary = review_summary(state)
    rows = []
    for clip in state.get("clips", []):
        rows.append({
            "id": clip.get("id", ""),
            "episode": clip.get("episode", ""),
            "technical_status": clip.get("status", ""),
            "review_status": clip.get("review_status") or "pending",
            "review_note": clip.get("review_note", ""),
            "reviewer": clip.get("reviewer", ""),
            "updated_at": clip.get("review_updated_at", ""),
            "start": clip.get("start", ""),
            "end": clip.get("end", ""),
            "duration": round(clip_duration_value(clip), 3),
        })
    csv_path = report_dir / f"review_report_{batch_id}.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["id", "episode", "technical_status", "review_status", "review_note", "reviewer", "updated_at", "start", "end", "duration"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    newline = chr(10)
    md_lines = [
        "# Review Report",
        "",
        f"Project: {state.get('project_name', '')}",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Summary",
        f"- Total clips: {summary['total']}",
        f"- Reviewed: {summary['reviewed']}",
        f"- Approved: {summary['approved']}",
        f"- Rejected: {summary['rejected']}",
        f"- Changes requested: {summary['changes_requested']}",
        f"- Pending: {summary['pending']}",
        f"- Comments: {summary['comments']}",
        "",
        "## Recent Decisions",
    ]
    if summary["recent"]:
        for item in summary["recent"]:
            md_lines.append(f"- {item['id']} | {item['review_label']} | {item.get('review_note') or '-'} | {item.get('updated_at') or '-'}")
    else:
        md_lines.append("- none")
    md_path = report_dir / f"review_report_{batch_id}.md"
    md_path.write_text(newline.join(md_lines) + newline, encoding="utf-8")
    state["last_review_report"] = {"markdown": str(md_path), "csv": str(csv_path), "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "summary": summary}
    append_task_record(state, "review_report", "done", "Review report exported", meta={"markdown": str(md_path), "csv": str(csv_path)})
    save_project_state(state)
    return {"ok": True, "markdown": str(md_path), "csv": str(csv_path), "summary": summary}


def add_clip_feedback(state, clip_id, reason, note=""):
    if reason not in FEEDBACK_REASONS:
        reason = "other"
    clip = find_clip(state, clip_id)
    item = {"reason": reason, "label": FEEDBACK_REASONS[reason], "note": note or "", "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    clip.setdefault("feedback", []).append(item)
    clip["status"] = "needs_edit"
    clip["last_feedback_reason"] = reason
    append_task_record(state, "feedback", "done", FEEDBACK_REASONS[reason], clip_id, meta={"reason": reason})
    persist_review_state(state, "feedback_added", clip_id)
    return {"ok": True, "clip": clip, "feedback": item, "summary": feedback_summary(state), "task_summary": task_record_summary(state)}

def clip_duration_value(clip):
    try:
        return max(0.0, float(clip.get("end", 0)) - float(clip.get("start", 0)))
    except Exception:
        return 0.0


def clip_delivery_risks(clip):
    risks = []
    duration = clip_duration_value(clip)
    features = clip.get("media_features_summary") or {}
    reason = str(features.get("reason", "")).lower()
    if clip.get("status") != "confirmed":
        risks.append("not_confirmed")
    if duration < 25:
        risks.append("dialogue_cut_risk")
    if duration > 150:
        risks.append("scene_leak_risk")
    if "fallback" in reason:
        risks.append("weak_boundary_evidence")
    if int(features.get("scene_group_shots") or features.get("scene_count") or 0) == 0:
        risks.append("no_scene_anchor")
    try:
        dialogue = dialogue_boundary_quality(clip)
        for issue in dialogue.get("issues", []):
            code = issue.get("code")
            if code and code not in risks:
                risks.append(code)
    except Exception:
        pass
    return risks


READY_REASON_CATALOG = {
    "not_confirmed": {
        "severity": "blocker",
        "title": "Not confirmed",
        "detail": "Only clips marked confirmed can enter READY export.",
        "fix": "Preview the clip, then click Confirm usable if the scene is complete.",
    },
    "dialogue_cut_risk": {
        "severity": "blocker",
        "title": "Dialogue cut risk",
        "detail": "The clip is short enough that opening or ending dialogue may be cut.",
        "fix": "Use Repair to READY or manual edit to extend the start/end and replay the boundary.",
    },
    "scene_leak_risk": {
        "severity": "warning",
        "title": "Scene leak risk",
        "detail": "The clip is long enough that it may contain the next scene.",
        "fix": "Trim the endpoint and verify the final line/reaction before confirming.",
    },
    "weak_boundary_evidence": {
        "severity": "warning",
        "title": "Weak boundary evidence",
        "detail": "The current cut was produced with fallback boundary evidence.",
        "fix": "Run AI safe-boundary reselect or inspect the full episode timeline manually.",
    },
    "no_scene_anchor": {
        "severity": "warning",
        "title": "No visual scene anchor",
        "detail": "No strong visual shot/scene anchor is attached to this clip.",
        "fix": "Use the full timeline preview to check whether the clip starts and ends at scene boundaries.",
    },
    "subtitle_boundary_unknown": {
        "severity": "warning",
        "title": "Subtitle boundary unknown",
        "detail": "No subtitle sidecar is available, so dialogue cut-off cannot be automatically ruled out.",
        "fix": "Replay the first and last three seconds, or provide subtitle/ASR data for stricter checks.",
    },
    "starts_inside_dialogue": {
        "severity": "blocker",
        "title": "Starts inside dialogue",
        "detail": "The clip begins after a subtitle line has already started.",
        "fix": "Move the start earlier to include the full opening line.",
    },
    "ends_inside_dialogue": {
        "severity": "blocker",
        "title": "Ends inside dialogue",
        "detail": "The clip ends before a subtitle line has finished.",
        "fix": "Move the end later to include the full final line.",
    },
    "next_dialogue_leak": {
        "severity": "warning",
        "title": "Next dialogue leak",
        "detail": "A new subtitle line begins immediately after the current endpoint.",
        "fix": "Trim before the next line starts, or extend to include the next beat as a complete scene.",
    },
}


def dialogue_boundary_quality(clip):
    start = float(clip.get("start", 0) or 0)
    end = float(clip.get("end", start) or start)
    subtitles = subtitle_segments_for_clip(clip)
    segments = subtitles.get("segments") or []
    issues = []
    suggestions = []
    if not subtitles.get("available"):
        return {
            "available": False,
            "status": "UNKNOWN",
            "issues": [{
                "code": "subtitle_boundary_unknown",
                "severity": "warning",
                "message": subtitles.get("reason") or "暂无字幕句界，无法自动排除对白切断。",
            }],
            "suggestions": ["人工听开头 3 秒和结尾 3 秒；如可提供字幕/ASR，系统可做更严格判断。"],
            "subtitle_source": subtitles.get("source", ""),
        }
    for segment in segments:
        segment_start = float(segment.get("start", 0))
        segment_end = float(segment.get("end", 0))
        text = segment.get("text") or "对白"
        if segment_start < start < segment_end:
            delta = round(start - max(0.0, segment_start - 0.25), 2)
            issues.append({
                "code": "starts_inside_dialogue",
                "severity": "blocker",
                "message": f"开头切进对白中间：{text}",
                "recommended_start": round(max(0.0, segment_start - 0.25), 3),
                "adjust_by_seconds": delta,
            })
            suggestions.append(f"开始点向前约 {delta} 秒，保留完整句首。")
        if segment_start < end < segment_end:
            delta = round((segment_end + 0.35) - end, 2)
            issues.append({
                "code": "ends_inside_dialogue",
                "severity": "blocker",
                "message": f"结尾切断对白：{text}",
                "recommended_end": round(segment_end + 0.35, 3),
                "adjust_by_seconds": delta,
            })
            suggestions.append(f"结束点向后约 {delta} 秒，保留完整句尾。")
        if end < segment_start <= end + 0.35:
            delta = round(segment_start - end, 2)
            issues.append({
                "code": "next_dialogue_leak",
                "severity": "warning",
                "message": f"结尾后 {delta} 秒出现下一句对白：{text}",
                "recommended_end": round(max(start + 1.0, segment_start - 0.08), 3),
                "adjust_by_seconds": round(end - max(start + 1.0, segment_start - 0.08), 2),
            })
            suggestions.append("结尾几乎贴到下一句对白，需判断是串戏还是应扩成完整下一拍。")
    blocker_count = len([item for item in issues if item.get("severity") == "blocker"])
    warning_count = len([item for item in issues if item.get("severity") == "warning"])
    return {
        "available": True,
        "status": "BLOCKED" if blocker_count else ("REVIEW" if warning_count else "PASS"),
        "issues": issues,
        "suggestions": suggestions or ["字幕句界未发现明显切断；仍建议人工听开头和结尾。"],
        "subtitle_source": subtitles.get("source", ""),
    }


def nearest_point(points, value, kinds=None, max_distance=6.0):
    selected = []
    kind_set = set(kinds or [])
    for point in points or []:
        if kind_set and point.get("kind") not in kind_set:
            continue
        try:
            distance = abs(float(point.get("time")) - float(value))
        except Exception:
            continue
        if distance <= max_distance:
            selected.append((distance, point))
    if not selected:
        return None
    selected.sort(key=lambda item: (item[0], -int(item[1].get("confidence") or 0)))
    return selected[0][1]


def recommended_boundary_from_points(points, current, field):
    if field == "start":
        preferred = ["subtitle_sentence_start", "scene_cut", "audio_safe_start"]
        candidates = [point for point in points if point.get("kind") in preferred and float(point.get("time") or 0) <= current + 1.2]
        if candidates:
            candidates.sort(key=lambda point: (abs(float(point.get("time") or 0) - current), -int(point.get("confidence") or 0)))
            return candidates[0]
    else:
        preferred = ["subtitle_sentence_end", "scene_cut", "audio_safe_end"]
        candidates = [point for point in points if point.get("kind") in preferred and float(point.get("time") or 0) >= current - 1.2]
        if candidates:
            candidates.sort(key=lambda point: (abs(float(point.get("time") or 0) - current), -int(point.get("confidence") or 0)))
            return candidates[0]
    return nearest_point(points, current, max_distance=4.0)


def boundary_score_for_clip(state, clip):
    start = float(clip.get("start", 0) or 0)
    end = float(clip.get("end", start) or start)
    duration = max(0.1, end - start)
    try:
        boundary_payload = clip_boundary_points(state, clip.get("id"))
    except Exception as exc:
        return {
            "available": False,
            "status": "REVIEW",
            "score": 40,
            "issues": [{"code": "boundary_score_unavailable", "severity": "warning", "message": f"综合边界评分暂不可用：{exc}"}],
            "suggestions": ["人工播放首尾，确认没有断话或串戏。"],
            "recommended_start": None,
            "recommended_end": None,
            "evidence": {},
        }
    points = boundary_payload.get("points") or []
    audio = boundary_payload.get("audio") or {}
    dialogue = dialogue_boundary_quality(clip)
    scene_start = nearest_point(points, start, ["scene_cut"], 4.5)
    scene_end = nearest_point(points, end, ["scene_cut"], 4.5)
    subtitle_start = nearest_point(points, start, ["subtitle_sentence_start"], 3.0)
    subtitle_end = nearest_point(points, end, ["subtitle_sentence_end"], 3.0)
    audio_start = nearest_point(points, start, ["audio_safe_start"], 4.0)
    audio_end = nearest_point(points, end, ["audio_safe_end"], 4.0)
    score = 55
    issues = []
    suggestions = []
    if scene_start:
        score += 10
    else:
        issues.append({"code": "weak_start_scene_anchor", "severity": "warning", "message": "开始点附近没有明显镜头切点，可能不是一场戏的自然开头。"})
    if scene_end:
        score += 10
    else:
        issues.append({"code": "weak_end_scene_anchor", "severity": "warning", "message": "结束点附近没有明显镜头切点，可能不是一场戏的自然结尾。"})
    if subtitle_start or dialogue.get("available") is False:
        score += 8 if subtitle_start else 0
    if subtitle_end or dialogue.get("available") is False:
        score += 8 if subtitle_end else 0
    for issue in dialogue.get("issues", []):
        code = issue.get("code")
        severity = issue.get("severity", "warning")
        if severity == "blocker":
            score -= 35
        elif severity == "warning":
            score -= 15
        issues.append(issue)
    dynamic_range = float(audio.get("dynamic_range") or 0)
    if dynamic_range >= 12:
        if audio_start or audio_end:
            score += 5
            suggestions.append("声音变化较明显，已纳入安全边界判断。")
        else:
            issues.append({"code": "audio_dynamic_boundary_unclear", "severity": "warning", "message": "声音波动明显，但当前边界附近缺少安全缓冲。"})
            score -= 8
    if duration < 25:
        score -= 12
        issues.append({"code": "short_scene_completeness_risk", "severity": "warning", "message": "片段较短，完整一场戏的概率偏低，需要人工完整播放确认。"})
    if duration > 150:
        score -= 8
        issues.append({"code": "long_scene_leak_risk", "severity": "warning", "message": "片段较长，可能包含下一场戏，需要检查是否串戏。"})
    start_point = recommended_boundary_from_points(points, start, "start")
    end_point = recommended_boundary_from_points(points, end, "end")
    recommended_start = round(float(start_point.get("time")), 3) if start_point else None
    recommended_end = round(float(end_point.get("time")), 3) if end_point else None
    for issue in dialogue.get("issues", []):
        if issue.get("recommended_start") is not None:
            recommended_start = round(float(issue.get("recommended_start")), 3)
        if issue.get("recommended_end") is not None:
            recommended_end = round(float(issue.get("recommended_end")), 3)
    if recommended_start is not None and abs(recommended_start - start) >= 0.15:
        direction = "向前" if recommended_start < start else "向后"
        suggestions.append(f"建议开始点{direction}调整到 {recommended_start:.2f}s。")
    if recommended_end is not None and abs(recommended_end - end) >= 0.15:
        direction = "向后" if recommended_end > end else "向前"
        suggestions.append(f"建议结束点{direction}调整到 {recommended_end:.2f}s。")
    blocker_count = len([item for item in issues if item.get("severity") == "blocker"])
    warning_count = len([item for item in issues if item.get("severity") == "warning"])
    score = max(0, min(100, int(round(score))))
    status = "PASS"
    if blocker_count or score < 55:
        status = "BLOCKED"
    elif warning_count or score < 75:
        status = "REVIEW"
    return {
        "available": True,
        "status": status,
        "score": score,
        "issues": issues[:10],
        "suggestions": suggestions or ["综合边界评分未发现明显断句或串戏；仍建议播放首尾确认。"],
        "recommended_start": recommended_start,
        "recommended_end": recommended_end,
        "evidence": {
            "scene_start": scene_start,
            "scene_end": scene_end,
            "subtitle_start": subtitle_start,
            "subtitle_end": subtitle_end,
            "audio_start": audio_start,
            "audio_end": audio_end,
            "audio_dynamic_range": dynamic_range,
            "audio_tension_score": audio.get("audio_tension_score", 0),
            "voice_activity_ratio": audio.get("voice_activity_ratio", 0),
            "quiet_ratio": audio.get("quiet_ratio", 0),
            "pause_transition_rate": audio.get("pause_transition_rate", 0),
            "subtitle_available": dialogue.get("available", False),
            "point_summary": boundary_payload.get("summary", {}),
        },
    }


def clip_quality_gate(state, clip_id):
    clip = find_clip(state, clip_id)
    readiness = clip_ready_explanation(clip, include_dialogue_unknown=True)
    dialogue = dialogue_boundary_quality(clip)
    boundary_score = boundary_score_for_clip(state, clip)
    readiness_risks = readiness.get("risks") or []
    technical_reasons = [
        item for item in readiness.get("reasons", [])
        if item.get("code") not in ("not_confirmed",)
    ]
    blockers = len([item for item in technical_reasons if item.get("severity") == "blocker"])
    warnings = len([item for item in technical_reasons if item.get("severity") == "warning"])
    gate_status = "PASS"
    if dialogue.get("status") == "BLOCKED" or boundary_score.get("status") == "BLOCKED":
        gate_status = "BLOCKED"
    elif dialogue.get("status") in ("REVIEW", "UNKNOWN") or boundary_score.get("status") == "REVIEW":
        gate_status = "REVIEW"
    return {
        "ok": True,
        "id": clip_id,
        "status": gate_status,
        "ready": readiness.get("ready", False),
        "readiness": readiness,
        "dialogue": dialogue,
        "boundary_score": boundary_score,
        "risks": readiness_risks,
        "summary": {
            "blockers": blockers,
            "warnings": warnings,
            "dialogue_status": dialogue.get("status"),
            "subtitle_available": dialogue.get("available", False),
            "boundary_score": boundary_score.get("score"),
            "boundary_status": boundary_score.get("status"),
        },
        "operator_message": (
            "质量门通过：可进入 READY 导出。"
            if gate_status == "PASS" and readiness.get("ready", False)
            else "技术质量通过：确认可用后即可进入导出。"
            if gate_status == "PASS"
            else "质量门需复核：请先处理边界/对白风险，再确认或导出。"
        ),
    }


def clip_ready_explanation(clip, include_dialogue_unknown=False):
    risks = clip_delivery_risks(clip)
    dialogue = dialogue_boundary_quality(clip)
    for issue in dialogue.get("issues", []):
        code = issue.get("code")
        if not code:
            continue
        if code == "subtitle_boundary_unknown" and not include_dialogue_unknown:
            continue
        if code not in risks:
            risks.append(code)
    reasons = []
    for code in risks:
        info = READY_REASON_CATALOG.get(code, {})
        reasons.append({
            "code": code,
            "severity": info.get("severity", "warning"),
            "title": info.get("title", code.replace("_", " ").title()),
            "detail": info.get("detail", "Manual review is recommended before export."),
            "fix": info.get("fix", "Manual review recommended."),
        })
    ready = clip.get("status") == "confirmed" and not risks
    if ready:
        next_action = "READY: this clip can be included in READY-only export after final delivery check."
    elif "not_confirmed" in risks and len(risks) == 1:
        next_action = "Review the clip and confirm usable if the scene is complete."
    elif "dialogue_cut_risk" in risks or "weak_boundary_evidence" in risks or "no_scene_anchor" in risks:
        next_action = "Use Repair to READY to generate safer boundaries, then replay and confirm."
    else:
        next_action = "Manual review recommended before export."
    return {
        "ready": ready,
        "status": "READY" if ready else "NOT_READY",
        "reasons": reasons,
        "risks": risks,
        "duration": round(clip_duration_value(clip), 3),
        "next_action": next_action,
    }


def episode_acceptance_dashboard(state):
    clips = state.get("clips") or []
    episodes = sorted({int(clip.get("episode") or 0) for clip in clips if int(clip.get("episode") or 0)})
    rows = []
    for episode in episodes:
        episode_clips = [clip for clip in clips if int(clip.get("episode") or 0) == episode]
        ready = 0
        review = 0
        blocked = 0
        confirmed = len([clip for clip in episode_clips if clip.get("status") == "confirmed"])
        exported = len([clip for clip in episode_clips if clip.get("exported_at")])
        failed = len([clip for clip in episode_clips if clip.get("export_error") or clip.get("export_failed_at")])
        first_problem = None
        for clip in episode_clips:
            risks = clip_delivery_risks(clip)
            blocker_risks = {"starts_inside_dialogue", "ends_inside_dialogue"}
            if any(risk in blocker_risks for risk in risks):
                blocked += 1
                first_problem = first_problem or clip
            elif risks or clip.get("status") != "confirmed":
                review += 1
                first_problem = first_problem or clip
            else:
                ready += 1
        status = "ready"
        if blocked:
            status = "blocked"
        elif review or not ready:
            status = "review"
        rows.append({
            "episode": episode,
            "status": status,
            "total": len(episode_clips),
            "ready": ready,
            "review": review,
            "blocked": blocked,
            "confirmed": confirmed,
            "exported": exported,
            "failed": failed,
            "first_problem_clip_id": (first_problem or episode_clips[0]).get("id") if episode_clips else "",
        })
    counts = {
        "ready": len([row for row in rows if row["status"] == "ready"]),
        "review": len([row for row in rows if row["status"] == "review"]),
        "blocked": len([row for row in rows if row["status"] == "blocked"]),
    }
    return {"ok": True, "rows": rows, "counts": counts, "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


def learning_summary(state):
    feedback = feedback_summary(state)
    review = review_summary(state)
    clips = state.get("clips", [])
    reason_counts = {item.get("reason"): int(item.get("count") or 0) for item in feedback.get("top", [])}
    review_counts = {
        "rejected": review.get("rejected", 0),
        "changes_requested": review.get("changes_requested", 0),
    }
    rules = []
    def add_rule(key, title, trigger, prompt_hint, boundary_hint, confidence):
        rules.append({
            "id": key,
            "title": title,
            "trigger": trigger,
            "prompt_hint": prompt_hint,
            "boundary_hint": boundary_hint,
            "confidence": confidence,
            "applied": key in (state.get("learning_profile") or {}).get("applied_rule_ids", []),
        })
    if reason_counts.get("cut_start", 0):
        add_rule("protect_opening_dialogue", "Protect opening dialogue", "Missing opening dialogue feedback", "Expand candidate starts earlier and verify first spoken line is complete.", "Prefer start handle +1.5s to +3s unless scene leak is detected.", min(95, 55 + reason_counts.get("cut_start", 0) * 10))
    if reason_counts.get("cut_end", 0):
        add_rule("protect_ending_dialogue", "Protect ending dialogue", "Missing ending dialogue feedback", "Delay candidate end until final dialogue line and reaction beat are complete.", "Prefer end handle +2s to +4s, then trim if next-scene speech appears.", min(95, 55 + reason_counts.get("cut_end", 0) * 10))
    if reason_counts.get("scene_leak", 0):
        add_rule("avoid_next_scene_leak", "Avoid next-scene leakage", "Scene leak feedback", "Detect next-scene opening line/shot and pull the endpoint back before it.", "Run a second boundary pass after end extension.", min(95, 55 + reason_counts.get("scene_leak", 0) * 10))
    if reason_counts.get("weak_hook", 0):
        add_rule("strengthen_hook", "Strengthen hook", "Weak hook feedback", "Prefer high-conflict dialogue, reversal, threat, reveal, or emotional decision points.", "Allow longer scene if hook payoff needs context.", min(90, 50 + reason_counts.get("weak_hook", 0) * 8))
    if review_counts["rejected"] or review_counts["changes_requested"]:
        add_rule("reviewer_rejection_guard", "Reviewer rejection guard", "Reviewer rejected or requested changes", "Before export, prioritize clips with reviewer approval or no unresolved requested changes.", "Do not treat technical confirmation as external approval.", min(90, 50 + (review_counts["rejected"] + review_counts["changes_requested"]) * 8))
    if not rules:
        add_rule("collect_more_feedback", "Collect more feedback", "Not enough repeated failure evidence", "Keep collecting feedback reasons before changing AI rules.", "No automatic boundary changes recommended yet.", 20)
    profile = state.get("learning_profile") or {}
    return {
        "project_name": state.get("project_name", ""),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "evidence": {"feedback": feedback, "review": review, "clips": len(clips)},
        "rules": rules,
        "active_profile": profile,
        "recommendation": "Preview rules first. Apply only if the top reason repeats across multiple clips.",
    }


def save_learning_profile(state, selected_rule_ids=None, note=""):
    summary = learning_summary(state)
    selected = set(selected_rule_ids or [])
    selected_rules = [rule for rule in summary.get("rules", []) if rule.get("id") in selected]
    if not selected_rules:
        selected_rules = [rule for rule in summary.get("rules", []) if rule.get("confidence", 0) >= 60 and rule.get("id") != "collect_more_feedback"]
    RULE_PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    profile_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    profile = {
        "id": profile_id,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "note": note or "Learning profile generated from feedback and review evidence.",
        "applied_rule_ids": [rule.get("id") for rule in selected_rules],
        "rules": selected_rules,
        "evidence": summary.get("evidence", {}),
        "prompt_patch": "\n".join(f"- {rule.get('prompt_hint')}" for rule in selected_rules),
        "boundary_patch": "\n".join(f"- {rule.get('boundary_hint')}" for rule in selected_rules),
    }
    path = RULE_PROFILES_DIR / f"learning_profile_{profile_id}.json"
    path.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    state["learning_profile"] = profile
    append_task_record(state, "learning_profile", "done", f"Saved {len(selected_rules)} learning rule(s)", meta={"profile": str(path)})
    save_project_state(state)
    return {"ok": True, "profile": profile, "path": str(path), "summary": learning_summary(state)}


def analytics_summary(state):
    clips = state.get("clips", [])
    manifest = delivery_manifest(state) if clips else {"project_status": "BLOCKED", "episodes": [], "ready_clips": 0, "rework": 0, "confirmed": 0, "exported": 0}
    feedback = feedback_summary(state)
    review = review_summary(state)
    tasks = task_record_summary(state)
    total = len(clips)
    confirmed = len([clip for clip in clips if clip.get("status") == "confirmed"])
    exported = len([clip for clip in clips if clip.get("exported_at")])
    ready = int(manifest.get("ready_clips") or 0)
    rework = int(manifest.get("rework") or 0)
    approved = int(review.get("approved") or 0)
    rejected = int(review.get("rejected") or 0)
    changes_requested = int(review.get("changes_requested") or 0)
    durations = [clip_duration_value(clip) for clip in clips if clip_duration_value(clip) > 0]
    episode_rows = []
    for item in manifest.get("episodes", []):
        episode = item.get("episode")
        ep_clips = [clip for clip in clips if int(clip.get("episode", -1)) == int(episode)]
        ep_approved = len([clip for clip in ep_clips if clip.get("review_status") == "approved"])
        ep_rejected = len([clip for clip in ep_clips if clip.get("review_status") == "rejected"])
        ep_changes = len([clip for clip in ep_clips if clip.get("review_status") == "changes_requested"])
        ep_ready = len([clip for clip in ep_clips if clip.get("status") == "confirmed" and not clip_delivery_risks(clip)])
        episode_rows.append({
            **item,
            "ready_clips": ep_ready,
            "approved": ep_approved,
            "rejected": ep_rejected,
            "changes_requested": ep_changes,
            "usable_rate": round(ep_ready / len(ep_clips) * 100) if ep_clips else 0,
            "approval_rate": round(ep_approved / len(ep_clips) * 100) if ep_clips else 0,
        })
    top_rework = []
    for item in feedback.get("top", []):
        top_rework.append({"reason": item.get("reason"), "label": item.get("label"), "count": item.get("count"), "share": round((item.get("count") or 0) / max(1, feedback.get("total", 0)) * 100)})
    provider = (load_settings().get("model") or {}).get("display_name") or (load_settings().get("model") or {}).get("provider", "Unknown")
    model_quality = [{
        "provider": provider,
        "clips": total,
        "ready_rate": round(ready / total * 100) if total else 0,
        "confirm_rate": round(confirmed / total * 100) if total else 0,
        "approval_rate": round(approved / total * 100) if total else 0,
        "rework_rate": round(rework / total * 100) if total else 0,
        "model_calls": tasks.get("model_calls", 0),
        "estimated_tokens": tasks.get("estimated_tokens", 0),
    }]
    health_score = 0
    if total:
        health_score = max(0, min(100, round((ready / total) * 45 + (confirmed / total) * 25 + (approved / total) * 20 - (rework / total) * 15 - ((rejected + changes_requested) / total) * 10)))
    if not total:
        health_label = "NO_DATA"
    elif health_score >= 75:
        health_label = "HEALTHY"
    elif health_score >= 45:
        health_label = "WATCH"
    else:
        health_label = "RISK"
    return {
        "project_name": state.get("project_name", ""),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "health_score": health_score,
        "health_label": health_label,
        "totals": {
            "clips": total,
            "confirmed": confirmed,
            "ready": ready,
            "rework": rework,
            "exported": exported,
            "approved": approved,
            "rejected": rejected,
            "changes_requested": changes_requested,
            "feedback": feedback.get("total", 0),
            "avg_duration": round(sum(durations) / len(durations), 1) if durations else 0,
        },
        "rates": {
            "confirm_rate": round(confirmed / total * 100) if total else 0,
            "ready_rate": round(ready / total * 100) if total else 0,
            "rework_rate": round(rework / total * 100) if total else 0,
            "approval_rate": round(approved / total * 100) if total else 0,
            "export_rate": round(exported / total * 100) if total else 0,
        },
        "episodes": episode_rows,
        "top_rework_reasons": top_rework,
        "model_quality": model_quality,
        "task_cost": tasks,
        "recommendations": analytics_recommendations(total, ready, rework, approved, rejected, changes_requested, top_rework),
    }


def analytics_recommendations(total, ready, rework, approved, rejected, changes_requested, top_rework):
    items = []
    if not total:
        return ["Import assets and generate clips before reading analytics."]
    if ready < max(1, total * 0.3):
        items.append("READY rate is low: review boundary risks and confirm usable clips before export.")
    if rework > total * 0.35:
        items.append("Rework pressure is high: prioritize clips marked missing start/end or scene leak.")
    if rejected + changes_requested:
        items.append("Reviewer changes exist: resolve rejected/changes-requested clips before final delivery.")
    if top_rework:
        items.append(f"Top rework reason is {top_rework[0].get('label')}: use this as the next AI/rule tuning target.")
    if approved and approved >= ready:
        items.append("Review approval is aligned with READY clips: current delivery set is relatively stable.")
    if not items:
        items.append("No major analytics warning detected. Continue review and export by episode.")
    return items[:5]


def delivery_episode_summary(state):
    clips = state.get("clips", [])
    plan = (state.get("clip_count_plan") or {}).get("episode_counts") or {}
    episodes = sorted({int(clip.get("episode", 0)) for clip in clips})
    rows = []
    for episode in episodes:
        ep_clips = [clip for clip in clips if int(clip.get("episode", -1)) == int(episode)]
        confirmed = [clip for clip in ep_clips if clip.get("status") == "confirmed"]
        rework = [clip for clip in ep_clips if clip_delivery_risks(clip)]
        exported = [clip for clip in ep_clips if clip.get("exported_at")]
        raw_target = plan.get(str(episode), 0)
        if isinstance(raw_target, dict):
            raw_target = raw_target.get("requested") or raw_target.get("recommended") or raw_target.get("generated") or 0
        target = int(raw_target or 0)
        if not ep_clips or not confirmed:
            status = "BLOCKED"
        elif rework or (target and len(confirmed) < target):
            status = "REVIEW"
        else:
            status = "READY"
        rows.append({
            "episode": episode,
            "target": target,
            "clips": len(ep_clips),
            "confirmed": len(confirmed),
            "rework": len(rework),
            "exported": len(exported),
            "status": status,
            "confirm_rate": round(len(confirmed) / len(ep_clips) * 100) if ep_clips else 0,
        })
    return rows


def delivery_slug(value, fallback="delivery"):
    return safe_project_name(value or fallback)[:80] or fallback


def delivery_root_for(state, batch_id, episode=None):
    base_output = Path(state.get("output_dir") or (Path(state["base_dir"]) / "review_exports"))
    return base_output


def export_record_root_for(state, batch_id, episode=None):
    base_output = Path(state.get("base_dir") or ROOT) / "_export_records"
    scope = f"EP{int(episode):02d}" if episode is not None else "ALL_EPISODES"
    return base_output / "_内部记录" / scope / f"batch_{batch_id}"


def clip_csv_row(clip):
    return {
        "id": clip.get("id", ""),
        "episode": clip.get("episode", ""),
        "status": clip.get("status", ""),
        "review_status": clip.get("review_status", "pending"),
        "review_note": clip.get("review_note", ""),
        "start": clip.get("start", ""),
        "end": clip.get("end", ""),
        "duration": round(clip_duration_value(clip), 3),
        "quality": clip.get("quality_label", ""),
        "integrity": clip.get("integrity", ""),
        "export_path": clip.get("export_path", ""),
        "risks": ";".join(clip_delivery_risks(clip)),
        "feedback": ";".join(item.get("label") or item.get("reason", "") for item in clip.get("feedback", [])),
    }


def write_clip_csv(path, clips):
    fields = ["id", "episode", "status", "review_status", "review_note", "start", "end", "duration", "quality", "integrity", "export_path", "risks", "feedback"]
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for clip in clips:
            writer.writerow(clip_csv_row(clip))


def write_delivery_package(state, out_dir, batch_id, results, episode=None, only_ready=False, failed=None, skipped=None, unexported_only=False):
    manifest = delivery_manifest(state)
    result_ids = {item.get("id") for item in results}
    exported_clips = [clip for clip in state.get("clips", []) if clip.get("id") in result_ids]
    ready_clips = [clip for clip in state.get("clips", []) if clip.get("status") == "confirmed" and not clip_delivery_risks(clip)]
    rework_clips = [clip for clip in state.get("clips", []) if clip_delivery_risks(clip)]
    package = {
        "batch_id": batch_id,
        "project_name": state.get("project_name", ""),
        "drama_name": state.get("drama_name", ""),
        "episode_scope": state.get("episode_scope", ""),
        "episode": episode,
        "only_ready": bool(only_ready),
        "unexported_only": bool(unexported_only),
        "output_dir": str(out_dir),
        "exported_count": len(results),
        "failed_count": len(failed or []),
        "skipped_count": len(skipped or []),
        "exported_results": results,
        "failed_results": failed or [],
        "skipped_results": skipped or [],
        "delivery": manifest,
        "feedback_summary": feedback_summary(state),
        "task_record_summary": task_record_summary(state),
        "review_summary": review_summary(state),
        "last_review_report": state.get("last_review_report") or {},
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    package_path = out_dir / "delivery_manifest.json"
    package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2), encoding="utf-8")
    write_clip_csv(out_dir / "ready_clips.csv", ready_clips)
    write_clip_csv(out_dir / "rework_list.csv", rework_clips)
    write_clip_csv(out_dir / "exported_clips.csv", exported_clips)
    summary_lines = [
        f"# Delivery Summary",
        "",
        f"Project: {state.get('project_name', '')}",
        f"Drama: {state.get('drama_name') or state.get('project_name', '')}",
        f"Batch: {batch_id}",
        f"Generated: {package['generated_at']}",
        f"Episode: {episode if episode is not None else 'ALL'}",
        f"Export mode: {'READY only' if only_ready else 'confirmed clips'}",
        "",
        "## Counts",
        f"- Exported MP4: {len(results)}",
        f"- Confirmed: {manifest.get('confirmed', 0)}",
        f"- READY clips: {manifest.get('ready_clips', 0)}",
        f"- Rework clips: {manifest.get('rework', 0)}",
        f"- Project status: {manifest.get('project_status', 'BLOCKED')}",
        "",
        "## Files",
        "- delivery_manifest.json: machine-readable delivery package",
        "- ready_clips.csv: clips safe for delivery",
        "- rework_list.csv: clips that need review or repair",
        "- exported_clips.csv: MP4 files exported in this batch",
        "- review_export_manifest.json: legacy export manifest",
        "",
        "## Notes",
        "- Original videos are not overwritten.",
        "- No subtitles or watermarks are burned by default.",
        "- Review rework_list.csv before client handoff if project status is not READY.",
    ]
    summary_path = out_dir / "DELIVERY_SUMMARY.md"
    newline = chr(10)
    summary_path.write_text(newline.join(summary_lines) + newline, encoding="utf-8")
    return {
        "summary": str(summary_path),
        "manifest": str(package_path),
        "ready_csv": str(out_dir / "ready_clips.csv"),
        "rework_csv": str(out_dir / "rework_list.csv"),
        "exported_csv": str(out_dir / "exported_clips.csv"),
    }


def delivery_manifest(state):
    clips = state.get("clips", [])
    episodes = delivery_episode_summary(state)
    ready_clip_ids = []
    rework_items = []
    for clip in clips:
        readiness = clip_ready_explanation(clip)
        risks = readiness.get("risks") or []
        row = {
            "id": clip.get("id"),
            "episode": clip.get("episode"),
            "status": clip.get("status", ""),
            "review_status": clip.get("review_status", "pending"),
            "review_note": clip.get("review_note", ""),
            "reviewer": clip.get("reviewer", ""),
            "start": clip.get("start"),
            "end": clip.get("end"),
            "duration": round(clip_duration_value(clip), 3),
            "exported_at": clip.get("exported_at", ""),
            "export_path": clip.get("export_path", ""),
            "risks": risks,
        }
        if readiness.get("ready"):
            ready_clip_ids.append(clip.get("id"))
        if risks:
            rework_items.append(row)
    exported = len([clip for clip in clips if clip.get("exported_at")])
    confirmed = len([clip for clip in clips if clip.get("status") == "confirmed"])
    ready_episodes = len([item for item in episodes if item.get("status") == "READY"])
    project_status = "READY" if clips and ready_episodes == len(episodes) and not rework_items else ("BLOCKED" if not confirmed else "REVIEW")
    return {
        "project_name": state.get("project_name", ""),
        "output_dir": state.get("output_dir", ""),
        "project_status": project_status,
        "clips": len(clips),
        "confirmed": confirmed,
        "ready_clips": len(ready_clip_ids),
        "rework": len(rework_items),
        "exported": exported,
        "episodes": episodes,
        "ready_clip_ids": ready_clip_ids,
        "rework_items": rework_items[:80],
        "last_export": state.get("last_export") or {},
        "feedback_summary": feedback_summary(state),
        "review_summary": review_summary(state),
        "last_review_report": state.get("last_review_report") or {},
        "task_record_summary": task_record_summary(state),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }

def state_summary(state):
    clips = state.get("clips", [])
    confirmed = len([clip for clip in clips if clip.get("status") == "confirmed"])
    episodes = sorted({int(clip.get("episode", 0)) for clip in clips})
    manifest = delivery_manifest(state) if clips else {"project_status": "BLOCKED", "ready_clips": 0, "rework": 0, "exported": 0}
    return {
        "project_name": state.get("project_name") or Path(state.get("base_dir", "")).name,
        "project_kind": state.get("project_kind", "unknown"),
        "source_root": state.get("source_root", ""),
        "base_dir": state.get("base_dir", ""),
        "output_dir": state.get("output_dir", ""),
        "clips": len(clips),
        "confirmed": confirmed,
        "assets": len(state.get("assets", [])),
        "workflow_status": state.get("workflow_status", ""),
        "delivery_status": manifest.get("project_status", "BLOCKED"),
        "ready_clips": manifest.get("ready_clips", 0),
        "rework": manifest.get("rework", 0),
        "exported": manifest.get("exported", 0),
        "confirm_rate": round(confirmed / len(clips) * 100) if clips else 0,
        "feedback_total": feedback_summary(state).get("total", 0),
        "review_summary": review_summary(state),
        "task_record_summary": task_record_summary(state),
        "episodes": episodes,
        "deletable": False,
    }


def iter_project_states():
    seen = set()
    state_paths = []
    if STATE_PATH.exists():
        state_paths.append(STATE_PATH)
    if PROJECTS_ROOT.exists():
        state_paths.extend(PROJECTS_ROOT.rglob("review_state.json"))
    for state_path in state_paths:
        try:
            resolved = str(state_path.resolve())
            if resolved in seen or TRASH_DIR in state_path.parts:
                continue
            seen.add(resolved)
            yield state_path, json.loads(state_path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue


def clip_delivery_score(clip, project_health=0):
    duration = clip_duration_value(clip)
    score = float(project_health or 0)
    if clip.get("status") == "confirmed":
        score += 35
    if clip.get("review_status") == "approved":
        score += 25
    if not clip_delivery_risks(clip):
        score += 30
    if 30 <= duration <= 120:
        score += 8
    if clip.get("exported_at"):
        score -= 20
    return round(score, 2)


def queue_item_for_clip(clip):
    risks = clip_delivery_risks(clip)
    readiness = clip_ready_explanation(clip)
    return {
        "id": clip.get("id", ""),
        "episode": clip.get("episode", ""),
        "start": clip.get("start", ""),
        "end": clip.get("end", ""),
        "duration": round(clip_duration_value(clip), 3),
        "status": clip.get("status", ""),
        "review_status": clip.get("review_status", "pending"),
        "risks": risks,
        "readiness": readiness,
        "reason": readiness.get("next_action") or (repair_hint_for_clip(clip, risks) if risks or clip.get("status") != "confirmed" else "Ready for final review."),
        "source_video": clip.get("source_video", ""),
        "score": clip.get("score", ""),
    }


def review_queue(state, mode="review", limit=50):
    try:
        limit = max(1, min(200, int(limit or 50)))
    except Exception:
        limit = 50
    clips = state.get("clips", [])
    if mode == "repair":
        selected = [clip for clip in clips if clip.get("status") != "discarded" and (clip.get("status") == "needs_edit" or clip_delivery_risks(clip))]
        selected.sort(key=lambda clip: (len(clip_delivery_risks(clip)), int(clip.get("episode") or 0), str(clip.get("id", ""))))
    elif mode == "ready":
        selected = [clip for clip in clips if clip.get("status") == "confirmed" and not clip_delivery_risks(clip)]
    else:
        selected = [clip for clip in clips if clip.get("status") in ("pending", "needs_edit") or clip.get("review_status") in ("pending", "changes_requested")]
        selected.sort(key=lambda clip: (0 if clip.get("status") == "needs_edit" else 1, int(clip.get("episode") or 0), str(clip.get("id", ""))))
    items = [queue_item_for_clip(clip) for clip in selected[:limit]]
    return {
        "mode": mode,
        "total": len(selected),
        "items": items,
        "next": items[0] if items else None,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def apply_queue_action(state, clip_id, action, note=""):
    clip = find_clip(state, clip_id)
    action = action or "modify"
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if action == "usable":
        clip["status"] = "confirmed"
        clip["queue_decision"] = "usable"
    elif action == "discard":
        clip["status"] = "discarded"
        clip["review_status"] = "rejected"
        clip["queue_decision"] = "discard"
    else:
        clip["status"] = "needs_edit"
        clip["queue_decision"] = "modify"
    if note:
        clip.setdefault("review_comments", []).append({"text": note, "reviewer": "Queue", "at": now, "status": clip.get("review_status", "pending")})
        clip["review_comments"] = clip["review_comments"][-80:]
    clip["queue_updated_at"] = now
    append_task_record(state, "queue_action", "done", f"Queue action: {action}", clip_id, meta={"action": action})
    persist_review_state(state, "queue_action", clip_id)
    return {"ok": True, "clip": clip, "queue": review_queue(state, "repair" if action == "modify" else "review"), "delivery_task": delivery_task_summary(state)}


def delivery_check(state, target_count=30):
    task = delivery_task_summary(state, target_count)
    manifest = delivery_manifest(state) if state.get("clips") else {}
    planner = delivery_planner(target_count)
    blockers = []
    warnings = []
    confirmed_count = int(manifest.get("confirmed") or 0)
    ready_count = int(manifest.get("ready_clips") or 0)
    if not state.get("project_name"):
        blockers.append("No active project.")
    if not state.get("clips"):
        blockers.append("No clips generated yet.")
    if confirmed_count <= 0:
        blockers.append("No confirmed clips are available for export.")
    if ready_count < int(target_count or 30):
        warnings.append(f"Target gap remains: {max(0, int(target_count or 30) - ready_count)} READY clip(s).")
    if manifest.get("rework", 0):
        warnings.append(f"{manifest.get('rework')} clip(s) still need review or repair.")
    if not manifest.get("ready_clip_ids"):
        warnings.append("No READY clips are available for safe export; confirmed clips can still be exported after operator confirmation.")
    return {
        "ok_to_export": not blockers,
        "task": task,
        "blockers": blockers,
        "warnings": warnings,
        "ready_preview": planner.get("selected_ready", [])[:20],
        "repair_preview": planner.get("selected_repair", [])[:20],
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def export_preview(state, target_count=30, episode=None, only_ready=False, unexported_only=False, clip_id=""):
    check = delivery_check(state, target_count)
    manifest = delivery_manifest(state) if state.get("clips") else {}
    ready_ids = set(manifest.get("ready_clip_ids") or [])
    ready_clips = [clip for clip in state.get("clips", []) if clip.get("id") in ready_ids]
    confirmed_clips = [clip for clip in state.get("clips", []) if clip.get("status") == "confirmed"]
    if episode not in (None, ""):
        try:
            episode_number = int(episode)
            ready_clips = [clip for clip in ready_clips if int(clip.get("episode") or 0) == episode_number]
            confirmed_clips = [clip for clip in confirmed_clips if int(clip.get("episode") or 0) == episode_number]
        except Exception:
            ready_clips = []
            confirmed_clips = []
    exportable_clips = ready_clips if only_ready else confirmed_clips
    if clip_id:
        exportable_clips = [clip for clip in exportable_clips if clip.get("id") == clip_id]
    if unexported_only:
        exportable_clips = [clip for clip in exportable_clips if not clip.get("exported_at")]
    exported_clips = [clip for clip in state.get("clips", []) if clip.get("exported_at")]
    episodes = []
    for episode in sorted({int(clip.get("episode") or 0) for clip in state.get("clips", [])}):
        episode_clips = [clip for clip in state.get("clips", []) if int(clip.get("episode") or 0) == episode]
        episode_ready = [clip for clip in episode_clips if clip.get("id") in ready_ids]
        episodes.append({
            "episode": episode,
            "clips": len(episode_clips),
            "ready": len(episode_ready),
            "confirmed": len([clip for clip in episode_clips if clip.get("status") == "confirmed"]),
            "not_exported": len([clip for clip in episode_clips if clip.get("status") == "confirmed" and not clip.get("exported_at")]),
            "failed": len([clip for clip in episode_clips if clip.get("export_error") or clip.get("export_failed_at")]),
            "rework": len([clip for clip in episode_clips if clip_delivery_risks(clip)]),
            "duration": round(sum(clip_duration_value(clip) for clip in episode_ready), 1),
        })
    next_batch = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_preview = str(delivery_root_for(state, next_batch, None))
    checklist = [
        {"id": "has_project", "label": "已选择项目", "ok": bool(state.get("project_name"))},
        {"id": "has_clips", "label": "已生成候选切片", "ok": bool(state.get("clips"))},
        {"id": "has_ready", "label": "至少有一条可交付片段", "ok": bool(ready_clips)},
        {"id": "has_exportable", "label": "本次范围内有可导出片段", "ok": bool(exportable_clips)},
        {"id": "delivery_check", "label": "交付检查没有阻断项", "ok": bool(check.get("ok_to_export"))},
        {"id": "manual_confirm", "label": "导出 MP4 前会再次确认", "ok": True},
    ]
    return {
        "ok_to_export": check.get("ok_to_export", False),
        "output_preview": output_preview,
        "ready_count": len(ready_clips),
        "confirmed_count": len(confirmed_clips),
        "exportable_count": len(exportable_clips),
        "exported_count": len(exported_clips),
        "not_exported_count": len([clip for clip in confirmed_clips if not clip.get("exported_at")]),
        "failed_count": len([clip for clip in state.get("clips", []) if clip.get("export_error") or clip.get("export_failed_at")]),
        "rework_count": manifest.get("rework", 0),
        "episodes": episodes,
        "checklist": checklist,
        "blockers": check.get("blockers", []),
        "warnings": check.get("warnings", []),
        "ready_preview": [queue_item_for_clip(clip) for clip in ready_clips[:30]],
        "confirmed_preview": [queue_item_for_clip(clip) for clip in confirmed_clips[:50]],
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def product_self_review(state, target_count=30):
    preview = export_preview(state, target_count)
    queue = review_queue(state, "repair", 20)
    findings = []
    def add(role, severity, title, detail, recommendation):
        findings.append({"role": role, "severity": severity, "title": title, "detail": detail, "recommendation": recommendation})
    if not state.get("project_name"):
        add("Product", "blocker", "No active project", "The workflow cannot start without a project context.", "Keep Projects as the first workspace and require project creation before import.")
    if not state.get("assets") and not state.get("clips"):
        add("Design", "blocker", "Import step is empty", "A beginner will not know what to do unless the Import workspace is explicit.", "Show import instructions and managed-material explanation before clipping.")
    if state.get("clips") and not preview.get("ready_count"):
        add("QA", "blocker", "No READY clips", "Export would produce no safe deliverables.", "Drive the user back to Review Queue before export.")
    if queue.get("total", 0):
        add("QA", "warning", "Repair queue still has items", f"{queue.get('total')} clip(s) need repair or risk review.", "Prioritize repair queue before increasing clip volume.")
    if preview.get("ready_count", 0) < int(target_count or 30):
        add("Product", "warning", "Target count gap", f"READY count is {preview.get('ready_count', 0)} against target {target_count}.", "Use per-episode targets and repair candidates before export.")
    if preview.get("ok_to_export"):
        add("Release", "info", "Export path is safe", "Delivery Check has no blockers for current target.", "Proceed only after operator confirms output directory and READY scope.")
    add("AI", "info", "Model promise should remain conservative", "DeepSeek branding is shown, but boundary decisions still need human review.", "Keep AI as assistant/reselector, not a fully autonomous editor, until quality evidence improves.")
    priority = "BLOCKED" if any(item["severity"] == "blocker" for item in findings) else ("WATCH" if any(item["severity"] == "warning" for item in findings) else "READY")
    return {
        "version": "5.8.0",
        "priority": priority,
        "summary": f"Product QA found {len(findings)} item(s). Current export readiness: {preview.get('ready_count', 0)} READY clip(s).",
        "findings": findings,
        "recommended_next_version": "v5.16.0 READY/source-of-truth and usability fix" if priority != "READY" else "v5.17.0 packaging and handoff candidate",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def product_acceptance_audit(state, target_count=30):
    html = (ROOT / "web" / "review.html").read_text(encoding="utf-8")
    js = (ROOT / "web" / "review.js").read_text(encoding="utf-8")
    css = (ROOT / "web" / "review.css").read_text(encoding="utf-8")
    preview = export_preview(state, target_count)
    queue = review_queue(state, "repair", 50)
    issues = []

    def js_function_body(name):
        marker = f"function {name}"
        start = js.find(marker)
        if start < 0:
            marker = f"async function {name}"
            start = js.find(marker)
        if start < 0:
            return ""
        brace = js.find("{", start)
        if brace < 0:
            return ""
        depth = 0
        for index in range(brace, len(js)):
            char = js[index]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return js[brace:index + 1]
        return js[brace:brace + 2400]

    def add(code, severity, area, title, evidence, impact, fix, owner="Product"):
        issues.append({
            "code": code,
            "severity": severity,
            "area": area,
            "title": title,
            "evidence": evidence,
            "impact": impact,
            "fix": fix,
            "owner": owner,
        })

    required_workspaces = {
        "projects": "1 Projects",
        "import": "2 Import & Clip",
        "review": "3 Review",
        "export": "4 Export",
        "settings": "Settings",
    }
    for key, label in required_workspaces.items():
        if f'data-workspace="{key}"' not in html:
            add(f"missing_workspace_{key}", "critical", "Navigation", f"Missing {label} workspace", "Top navigation does not include this workspace.", "User cannot follow the normal commercial workflow.", "Add the workspace to app navigation and route relevant panels.", "Design")

    checks = [
        ("project_create", "newProjectBtn", "Projects", "Project creation primary action is missing"),
        ("asset_import", "uploadAssetsBtn", "Import", "Asset import primary action is missing"),
        ("start_clipping", "startClippingBtn", "Import", "Start clipping primary action is missing"),
        ("queue_decision", "queueUsableBtn", "Review", "Queue usable decision is missing"),
        ("manual_modify", "editModeBtn", "Review", "Manual modify entry is missing"),
        ("delivery_check", "runDeliveryCheckBtn", "Export", "Delivery check action is missing"),
        ("export_ready", "exportReadyShortcutBtn", "Export", "READY export action is missing"),
        ("diagnostics", "runDiagnosticsBtn", "Settings", "Diagnostics action is missing"),
    ]
    for code, token, area, title in checks:
        if token not in html:
            add(code, "critical", area, title, f"#{token} not found in HTML.", "The workflow can dead-end for a normal user.", "Restore the button and connect it to a visible workspace.", "Engineering")
        elif token not in js:
            add(code + "_unbound", "critical", area, title + " binding", f"#{token} exists but no JS reference was found.", "The user can click a button and nothing happens.", "Bind the action and show status feedback.", "Engineering")

    if "withBusy(" not in js or "setStatus(" not in js:
        add("missing_feedback_system", "critical", "Feedback", "Operation feedback system is missing", "withBusy/setStatus not found.", "User cannot tell whether project creation, import, clipping, or export is running.", "Use status banner and busy states for every long-running action.", "Design")
    for token, action in [("newProjectBtn", "project creation"), ("uploadAssetsBtn", "asset import"), ("startClippingBtn", "smart clipping"), ("exportReadyBtn", "READY export")]:
        if token in js and f"withBusy('{token}'" not in js and f'withBusy("{token}"' not in js:
            add("weak_feedback_" + token, "major", "Feedback", f"Weak feedback for {action}", f"{token} is not wrapped by withBusy.", "User may think the app froze or did nothing.", "Wrap the action in a clear busy/success/error state.", "Engineering")

    if "confirm(" not in js:
        add("missing_destructive_confirm", "critical", "Safety", "Dangerous actions lack confirmation", "No confirm() call found.", "Delete/export actions may be triggered accidentally.", "Require explicit confirmation for delete and MP4 export.", "QA")
    dangerous_functions = [("deleteSelectedProject", "delete project"), ("exportReadyClips", "READY export"), ("exportConfirmed", "confirmed export")]
    for function_name, action in dangerous_functions:
        body = js_function_body(function_name)
        if body and "confirm(" not in body:
            add("confirm_window_" + function_name, "major", "Safety", f"Missing confirmation in {action}", f"Could not find confirm() inside {function_name}().", "A risky action may be too easy to trigger.", "Keep explicit confirmation inside the dangerous action function.", "QA")

    if "export_preview" not in html and "/api/export/preview" not in js:
        add("missing_export_preview", "critical", "Export", "Export preview is missing", "No export preview API/UI found.", "User cannot know what will be exported before MP4 generation.", "Add read-only export preview before final export.", "Release")
    if preview.get("ready_count", 0) <= 0 and state.get("clips"):
        add("no_ready_clips", "critical", "Business", "No READY clips available", f"{len(state.get('clips', []))} clips exist but READY count is 0.", "Export center cannot produce deliverable clips.", "Process Repair Queue and confirm usable clips before delivery.", "QA")
    if queue.get("total", 0) > 0:
        add("repair_queue_not_empty", "major", "Review", "Repair queue is not empty", f"Repair queue contains {queue.get('total')} item(s).", "Known risky clips remain in the delivery workflow.", "Review or reselect repair candidates before export.", "QA")

    if "workspaceGuide" not in html or "workspaceEmptyState" not in html:
        add("missing_guidance", "major", "Onboarding", "Workspace guidance is incomplete", "workspaceGuide/workspaceEmptyState missing.", "A normal user may not know the next step.", "Show next-step guidance in every workspace.", "Design")
    if "Product / QA Self-Review" not in html:
        add("missing_self_review_ui", "major", "Quality", "Self-review panel is missing", "Product / QA Self-Review not found in UI.", "The app cannot surface product-level problems to the operator.", "Expose acceptance audit and self-review in Export/Settings.", "Product")

    if "??" in html or "watermark" in html.lower():
        add("possible_burnin_copy", "minor", "Policy", "Check subtitle/watermark copy", "UI contains burn-in/watermark wording.", "User explicitly wants no burned subtitles/marks by default.", "Ensure copy says subtitles/watermarks are off unless requested.", "Product")

    severity_rank = {"critical": 0, "major": 1, "minor": 2, "info": 3}
    issues.sort(key=lambda item: (severity_rank.get(item["severity"], 9), item["area"], item["code"]))
    counts = {level: len([item for item in issues if item["severity"] == level]) for level in ("critical", "major", "minor", "info")}
    status = "FAIL" if counts["critical"] else ("WATCH" if counts["major"] else "PASS")
    return {
        "version": "5.9.0",
        "status": status,
        "counts": counts,
        "summary": f"Acceptance audit {status}: {counts['critical']} critical, {counts['major']} major, {counts['minor']} minor issue(s).",
        "issues": issues,
        "tested_path": ["Projects", "Import & Clip", "Review", "Export", "Settings"],
        "next_gate": "Fix critical/major issues before First-Run Wizard or v6.0.0." if status != "PASS" else "Ready to design First-Run Wizard.",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def product_ai_review_prompt(state, target_count=30):
    audit = product_acceptance_audit(state, target_count)
    self_review = product_self_review(state, target_count)
    export = export_preview(state, target_count)
    summary = state_summary(state)
    html = (ROOT / "web" / "review.html").read_text(encoding="utf-8")
    visible_markers = {
        "workspaces": re.findall(r'data-workspace="([^"]+)"', html),
        "buttons": re.findall(r'id="([^"]+Btn)"', html)[:120],
        "panels": re.findall(r'id="([^"]+Panel)"', html)[:80],
    }
    payload = {
        "product_goal": "Help a non-technical operator complete short-drama clipping delivery: create project, import videos, generate clips, review/repair, delivery check, export.",
        "principles": [
            "Non-destructive timecodes before MP4 export.",
            "No burned subtitles or watermarks unless explicitly requested.",
            "Complete scene beats raw clip count.",
            "Boundary trust and user feedback matter more than automation speed.",
            "Export only after review and delivery check.",
        ],
        "active_project": summary,
        "acceptance_audit": audit,
        "self_review": self_review,
        "export_preview": export,
        "ui_structure": visible_markers,
    }
    return (
        "You are a senior product manager, QA lead, UX designer, short-drama editor, and delivery operator reviewing a local short-drama AI clipping tool.\n"
        "Find serious product errors that a rule-based checker may miss. Focus on broken workflow, confusing information architecture, missing feedback, risky export behavior, review/edit dead ends, and delivery practicality.\n"
        "Return compact JSON only with keys: status, summary, issues, next_actions. issues must be an array of objects with severity, role, title, evidence, impact, fix.\n"
        "Do not invent completed testing. If evidence is insufficient, say what evidence is missing.\n\n"
        + json.dumps(payload, ensure_ascii=False, indent=2)[:24000]
    )


def parse_ai_review_json(text):
    if not text:
        raise ValueError("empty AI response")
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    data = json.loads(cleaned)
    if not isinstance(data, dict):
        raise ValueError("AI response is not an object")
    data.setdefault("issues", [])
    data.setdefault("next_actions", [])
    return data


def call_chat_model(prompt):
    settings = load_settings()
    model = settings.get("model", {})
    provider = (model.get("provider") or "deepseek").lower()
    api_key_env = model.get("api_key_env") or ("OPENAI_API_KEY" if provider == "openai" else "DEEPSEEK_API_KEY")
    api_key = os.environ.get(api_key_env, "")
    if not api_key:
        raise RuntimeError(f"missing API key env: {api_key_env}")
    body = {
        "model": model.get("model_name") or ("gpt-4.1-mini" if provider == "openai" else "deepseek-chat"),
        "messages": [
            {"role": "system", "content": "You are a rigorous product and QA reviewer. Return valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 2200,
    }
    opener, proxy_url = urllib_opener_for_model(model)
    request = urllib.request.Request(
        model_endpoint_url(settings),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with opener.open(request, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"]


def simulated_ai_product_review(state, target_count=30, reason=""):
    audit = product_acceptance_audit(state, target_count)
    export = export_preview(state, target_count)
    issues = []
    for item in audit.get("issues", [])[:8]:
        issues.append({
            "severity": "critical" if item.get("severity") == "critical" else "major",
            "role": item.get("owner", "QA"),
            "title": item.get("title", ""),
            "evidence": item.get("evidence", ""),
            "impact": item.get("impact", ""),
            "fix": item.get("fix", ""),
        })
    if state.get("clips") and export.get("ready_count", 0) == 0:
        issues.insert(0, {
            "severity": "critical",
            "role": "Delivery operator",
            "title": "Workflow looks complete but cannot deliver",
            "evidence": f"{len(state.get('clips', []))} clips exist, {export.get('confirmed_count', 0)} are confirmed, but READY is 0.",
            "impact": "A normal user may think work is finished, then discover export has no usable deliverables.",
            "fix": "Make Review workspace explain why confirmed clips are not READY and provide a repair-to-READY action per clip.",
        })
    issues.append({
        "severity": "major",
        "role": "UX designer",
        "title": "AI review is running in simulated mode",
        "evidence": reason or "No model response was available.",
        "impact": "This still gives product judgment, but it is less capable than a live model reviewing the full evidence packet.",
        "fix": "Configure model settings and API key, then rerun AI Product Reviewer. If network fails, check proxy/VPN.",
    })
    return {
        "status": "SIMULATED",
        "summary": f"Simulated AI review found {len(issues)} issue(s). Live model was not used.",
        "issues": issues[:12],
        "next_actions": [
            "Fix critical READY/review blockers before onboarding polish.",
            "Add clearer reasons for why confirmed clips are not READY.",
            "Rerun with a live model after API key/network is available.",
        ],
    }


def product_ai_review(state, target_count=30):
    prompt = product_ai_review_prompt(state, target_count)
    settings = load_settings()
    model = settings.get("model", {})
    try:
        raw = call_chat_model(prompt)
        result = parse_ai_review_json(raw)
        source = "live_model"
        error = ""
    except Exception as exc:
        result = simulated_ai_product_review(state, target_count, str(exc))
        source = "simulated_fallback"
        error = str(exc)
    result["version"] = "5.10.0"
    result["source"] = source
    result["model"] = {
        "provider": model.get("provider", ""),
        "display_name": model.get("display_name", ""),
        "model_name": model.get("model_name", ""),
    }
    result["error"] = error
    result["generated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return result


def delivery_task_summary(state, target_count=30):
    try:
        target_count = max(1, min(300, int(target_count or 30)))
    except Exception:
        target_count = 30
    clips = state.get("clips", [])
    assets = state.get("assets", [])
    manifest = delivery_manifest(state) if clips else {"ready_clips": 0, "confirmed": 0, "rework": 0, "project_status": "BLOCKED"}
    analytics = analytics_summary(state) if clips else {"health_label": "NO_DATA", "health_score": 0, "rates": {}}
    ready = int(manifest.get("ready_clips") or 0)
    confirmed = int(manifest.get("confirmed") or 0)
    rework = int(manifest.get("rework") or 0)
    gap = max(0, target_count - ready)
    if not state.get("project_name"):
        step = "create_project"
        title = "Create project"
        action = "Create one project for one drama delivery task."
    elif not assets and not clips:
        step = "import_assets"
        title = "Import episode videos"
        action = "Import MP4 episodes into the managed project library."
    elif not clips:
        step = "start_clipping"
        title = "Generate smart clips"
        action = "Set per-episode clip counts, then start smart clipping."
    elif ready < target_count and rework:
        step = "repair_queue"
        title = "Repair clips to READY"
        action = f"Close the {gap} READY clip gap by processing the repair queue."
    elif ready < target_count:
        step = "review_more"
        title = "Confirm more READY clips"
        action = f"Need {gap} more READY clip(s). Review and confirm usable clips."
    else:
        step = "export_ready"
        title = "Export READY clips"
        action = "Run Delivery Check, then export READY clips after confirmation."
    return {
        "project_name": state.get("project_name", ""),
        "target_count": target_count,
        "ready": ready,
        "confirmed": confirmed,
        "rework": rework,
        "gap": gap,
        "clips": len(clips),
        "assets": len(assets),
        "status": "READY" if ready >= target_count else ("BLOCKED" if not clips else "IN_PROGRESS"),
        "health_label": analytics.get("health_label", "NO_DATA"),
        "health_score": analytics.get("health_score", 0),
        "next_step": {"key": step, "title": title, "action": action},
        "plain_summary": f"Target {target_count}; READY {ready}; gap {gap}; confirmed {confirmed}; rework {rework}.",
    }


def delivery_planner(target_count=30, only_ready=False):
    try:
        target_count = max(1, min(300, int(target_count or 30)))
    except Exception:
        target_count = 30
    ready_items = []
    repair_items = []
    projects = []
    for state_path, state in iter_project_states():
        analytics = analytics_summary(state)
        health = analytics.get("health_score", 0)
        project_name = state.get("project_name") or state_path.parent.name
        projects.append({"project_name": project_name, "health_score": health, "clips": len(state.get("clips", []))})
        for clip in state.get("clips", []):
            risks = clip_delivery_risks(clip)
            item = {
                "project_name": project_name,
                "state_path": str(state_path),
                "base_dir": state.get("base_dir", ""),
                "clip_id": clip.get("id", ""),
                "episode": clip.get("episode", ""),
                "start": clip.get("start", ""),
                "end": clip.get("end", ""),
                "duration": round(clip_duration_value(clip), 3),
                "status": clip.get("status", ""),
                "review_status": clip.get("review_status", "pending"),
                "exported_at": clip.get("exported_at", ""),
                "risks": risks,
                "score": clip_delivery_score(clip, health),
                "source_video": clip.get("source_video", ""),
            }
            if clip.get("status") == "confirmed" and not risks and (not only_ready or clip.get("review_status") in ("approved", "pending", "")):
                ready_items.append(item)
            elif not only_ready:
                item["repair_hint"] = repair_hint_for_clip(clip, risks)
                repair_items.append(item)
    ready_items.sort(key=lambda item: (item.get("score") or 0, -int(bool(item.get("exported_at")))), reverse=True)
    repair_items.sort(key=lambda item: (len(item.get("risks") or []), item.get("score") or 0), reverse=False)
    selected_ready = ready_items[:target_count]
    gap = max(0, target_count - len(selected_ready))
    selected_repair = repair_items[:gap]
    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "target_count": target_count,
        "only_ready": bool(only_ready),
        "ready_count": len(ready_items),
        "repair_pool_count": len(repair_items),
        "selected_ready": selected_ready,
        "selected_repair": selected_repair,
        "gap": gap,
        "projects_scanned": len(projects),
        "project_pool": sorted(projects, key=lambda item: item.get("health_score") or 0, reverse=True)[:20],
        "recommendations": delivery_planner_recommendations(target_count, selected_ready, selected_repair, ready_items, repair_items),
    }


def repair_hint_for_clip(clip, risks):
    if clip.get("status") != "confirmed":
        return "Review and confirm this clip before delivery."
    if "dialogue_cut_risk" in risks:
        return "Extend boundaries and verify opening/ending dialogue."
    if "scene_leak_risk" in risks:
        return "Trim endpoint and check next-scene leakage."
    if "weak_boundary_evidence" in risks or "no_scene_anchor" in risks:
        return "Use manual timeline or AI safe-boundary reselect."
    return "Manual review recommended."


def delivery_planner_recommendations(target_count, selected_ready, selected_repair, ready_items, repair_items):
    items = []
    if len(selected_ready) >= target_count:
        items.append(f"Target can be met with {len(selected_ready)} READY clip(s). Export by project/episode after final confirmation.")
    else:
        items.append(f"Target gap: {target_count - len(selected_ready)} clip(s). Repair recommended clips before export.")
    if repair_items:
        items.append("Repair pool exists: prioritize shortest risk list first for fastest delivery gain.")
    if not ready_items:
        items.append("No READY clips found across projects. Focus on boundary fixes and confirmations before planning delivery.")
    return items[:5]


def portfolio_analytics():
    rows = []
    seen = set()
    for state_path, state in iter_project_states():
        try:
            resolved = str(state_path.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            analytics = analytics_summary(state)
            manifest = delivery_manifest(state) if state.get("clips") else {}
            rows.append({
                "project_name": state.get("project_name") or state_path.parent.name,
                "state_path": str(state_path),
                "base_dir": state.get("base_dir", ""),
                "health_label": analytics.get("health_label"),
                "health_score": analytics.get("health_score"),
                "clips": analytics.get("totals", {}).get("clips", 0),
                "confirmed": analytics.get("totals", {}).get("confirmed", 0),
                "ready": analytics.get("totals", {}).get("ready", 0),
                "rework": analytics.get("totals", {}).get("rework", 0),
                "approved": analytics.get("totals", {}).get("approved", 0),
                "exported": analytics.get("totals", {}).get("exported", 0),
                "ready_rate": analytics.get("rates", {}).get("ready_rate", 0),
                "rework_rate": analytics.get("rates", {}).get("rework_rate", 0),
                "approval_rate": analytics.get("rates", {}).get("approval_rate", 0),
                "delivery_status": manifest.get("project_status", "BLOCKED"),
                "updated_at": state_path.stat().st_mtime,
            })
        except Exception as exc:
            rows.append({"project_name": state_path.parent.name, "state_path": str(state_path), "error": str(exc), "health_label": "ERROR", "health_score": 0})
    rows.sort(key=lambda item: (item.get("health_score") or 0, item.get("ready") or 0, item.get("confirmed") or 0), reverse=True)
    totals = {
        "projects": len(rows),
        "clips": sum(int(item.get("clips") or 0) for item in rows),
        "confirmed": sum(int(item.get("confirmed") or 0) for item in rows),
        "ready": sum(int(item.get("ready") or 0) for item in rows),
        "rework": sum(int(item.get("rework") or 0) for item in rows),
        "approved": sum(int(item.get("approved") or 0) for item in rows),
        "exported": sum(int(item.get("exported") or 0) for item in rows),
    }
    best = rows[0] if rows else {}
    worst = sorted(rows, key=lambda item: item.get("health_score") or 0)[0] if rows else {}
    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "totals": totals,
        "best_project": best,
        "worst_project": worst,
        "projects": rows[:80],
        "recommendations": portfolio_recommendations(rows, totals),
    }


def portfolio_recommendations(rows, totals):
    if not rows:
        return ["No managed projects found yet."]
    items = []
    if totals.get("ready", 0) == 0:
        items.append("No READY clips across projects: focus on boundary repair and confirmation before scaling.")
    high_rework = [row for row in rows if (row.get("rework_rate") or 0) >= 50 and row.get("clips", 0)]
    if high_rework:
        items.append(f"{len(high_rework)} project(s) have high rework rate; compare their feedback reasons before more clipping.")
    best = rows[0]
    if best.get("clips"):
        items.append(f"Best current project: {best.get('project_name')} with health score {best.get('health_score')}.")
    if totals.get("approved", 0) == 0:
        items.append("No approved clips yet: use reviewer approval to separate technical readiness from client acceptance.")
    return items[:5]


def project_error_item(project_dir, error, state_path=None):
    state_file = Path(state_path) if state_path else Path(project_dir) / "review_state.json"
    return {
        "project_name": Path(project_dir).name,
        "project_kind": "error",
        "base_dir": str(Path(project_dir).resolve()),
        "state_path": str(state_file.resolve()) if state_file else "",
        "output_dir": "",
        "source_root": "",
        "assets": 0,
        "clips": 0,
        "confirmed": 0,
        "episodes": [],
        "active": False,
        "deletable": False,
        "openable": False,
        "status_label": "异常",
        "status_detail": str(error),
    }


def normalize_project_item(item, state_path=None, active=False, deletable=False, openable=True, status_label="可打开", status_detail=""):
    item["state_path"] = str(state_path) if state_path else item.get("state_path", "")
    item["active"] = bool(active)
    item["deletable"] = bool(deletable)
    item["openable"] = bool(openable)
    item["status_label"] = "当前" if active else status_label
    item["status_detail"] = status_detail or ("当前正在编辑" if active else "可以打开")
    item["identity"] = item.get("base_dir") or item.get("state_path") or item.get("project_name")
    return item


def project_light_summary(state, state_path=None):
    base_dir = state.get("base_dir", "")
    clips = state.get("clips") or []
    assets = state.get("assets") or []
    return {
        "project_name": state.get("project_name") or Path(base_dir or "").name or "未命名项目",
        "project_kind": state.get("project_kind", "unknown"),
        "source_root": state.get("source_root", ""),
        "base_dir": base_dir,
        "output_dir": state.get("output_dir", ""),
        "assets": len(assets),
        "clips": len(clips),
        "confirmed": len([clip for clip in clips if clip.get("status") == "confirmed"]),
        "episodes": sorted({int(asset.get("episode", 0)) for asset in assets if asset.get("episode")}),
        "workflow_status": state.get("workflow_status", ""),
        "state_path": str(state_path) if state_path else state.get("state_path", ""),
    }


def list_review_projects_light():
    projects = []
    seen = set()

    def add_project(item):
        key = str(item.get("identity") or item.get("state_path") or item.get("base_dir") or item.get("project_name") or "")
        if key and key in seen:
            return
        if key:
            seen.add(key)
        projects.append(item)

    if STATE_PATH.exists():
        try:
            current = json.loads(STATE_PATH.read_text(encoding="utf-8-sig"))
            item = project_light_summary(current, STATE_PATH)
            current_base = Path(current.get("base_dir", "")).resolve() if current.get("base_dir") else ROOT
            managed_roots = [root.resolve() for root in managed_project_roots()]
            deletable = any(current_base != root and root in current_base.parents for root in managed_roots) and (current_base / "review_state.json").exists()
            add_project(normalize_project_item(item, STATE_PATH, True, deletable, True, "当前", "当前正在编辑"))
        except Exception as exc:
            add_project(project_error_item(ROOT, exc, STATE_PATH))

    for projects_root in managed_project_roots():
        if not projects_root.exists():
            continue
        for project_dir in sorted([item for item in projects_root.iterdir() if item.is_dir() and item.name != TRASH_DIR], key=lambda p: p.stat().st_mtime, reverse=True):
            state_file = project_dir / "review_state.json"
            if not state_file.exists():
                add_project(project_error_item(project_dir, "缺少 review_state.json", state_file))
                continue
            try:
                state = json.loads(state_file.read_text(encoding="utf-8-sig"))
                item = project_light_summary(state, state_file)
                add_project(normalize_project_item(item, state_file, False, True, True, "可打开", "项目状态正常"))
            except Exception as exc:
                add_project(project_error_item(project_dir, exc, state_file))

    if OUTPUT_ROOT.exists():
        for base in sorted(OUTPUT_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not base.is_dir():
                continue
            if not ((base / "delivery_30").is_dir() or (base / "candidate_workflow").is_dir()):
                continue
            add_project(normalize_project_item({
                "project_name": base.name,
                "project_kind": "delivery",
                "base_dir": str(base.resolve()),
                "output_dir": str((base / "review_exports").resolve()),
                "source_root": "",
                "clips": None,
                "confirmed": None,
                "episodes": [],
            }, None, False, False, False, "历史输出", "历史输出目录，不能直接作为项目打开"))

    summary = {
        "total": len(projects),
        "active": len([item for item in projects if item.get("active")]),
        "openable": len([item for item in projects if item.get("openable")]),
        "abnormal": len([item for item in projects if item.get("project_kind") == "error"]),
        "light": True,
    }
    return {"projects": projects, "summary": summary}


def list_review_projects():
    projects = []
    seen = set()

    def add_project(item):
        key = str(item.get("identity") or item.get("state_path") or item.get("base_dir") or item.get("project_name") or "")
        if key and key in seen:
            return
        if key:
            seen.add(key)
        projects.append(item)

    if STATE_PATH.exists():
        try:
            current = load_review_state()
            item = state_summary(current)
            current_base = Path(current.get("base_dir", "")).resolve() if current.get("base_dir") else ROOT
            managed_roots = [root.resolve() for root in managed_project_roots()]
            deletable = any(current_base != root and root in current_base.parents for root in managed_roots) and (current_base / "review_state.json").exists()
            add_project(normalize_project_item(item, STATE_PATH, True, deletable, True, "当前", "当前正在编辑"))
        except Exception as exc:
            add_project(project_error_item(ROOT, exc, STATE_PATH))

    for projects_root in managed_project_roots():
        if not projects_root.exists():
            continue
        for project_dir in sorted([item for item in projects_root.iterdir() if item.is_dir() and item.name != TRASH_DIR], key=lambda p: p.stat().st_mtime, reverse=True):
            state_file = project_dir / "review_state.json"
            if not state_file.exists():
                add_project(project_error_item(project_dir, "缺少 review_state.json", state_file))
                continue
            try:
                state = json.loads(state_file.read_text(encoding="utf-8-sig"))
                item = state_summary(state)
                add_project(normalize_project_item(item, state_file, False, True, True, "可打开", "项目状态正常"))
            except Exception as exc:
                add_project(project_error_item(project_dir, exc, state_file))

    if OUTPUT_ROOT.exists():
        for base in sorted(OUTPUT_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if not base.is_dir():
                continue
            if not ((base / "delivery_30").is_dir() or (base / "candidate_workflow").is_dir()):
                continue
            add_project(normalize_project_item({
                "project_name": base.name,
                "project_kind": "delivery",
                "base_dir": str(base.resolve()),
                "output_dir": str((base / "review_exports").resolve()),
                "source_root": "",
                "clips": None,
                "confirmed": None,
                "episodes": [],
            }, None, False, False, False, "历史输出", "历史输出目录，不能直接作为项目打开"))

    summary = {
        "total": len(projects),
        "active": len([item for item in projects if item.get("active")]),
        "openable": len([item for item in projects if item.get("openable")]),
        "abnormal": len([item for item in projects if item.get("project_kind") == "error"]),
    }
    return {"projects": projects, "summary": summary}


def deleted_project_item(project_dir, owner_root):
    state_file = Path(project_dir) / "review_state.json"
    project_name = Path(project_dir).name
    try:
        if state_file.exists():
            state = json.loads(state_file.read_text(encoding="utf-8-sig"))
            project_name = state.get("project_name") or project_name
    except Exception:
        pass
    return {
        "project_name": project_name,
        "base_dir": str(Path(project_dir).resolve()),
        "state_path": str(state_file.resolve()) if state_file.exists() else "",
        "owner_root": str(Path(owner_root).resolve()),
        "status_label": "已删除",
        "restorable": state_file.exists(),
    }


def list_deleted_projects():
    projects = []
    for projects_root in managed_project_roots():
        trash_root = projects_root / TRASH_DIR
        if not trash_root.exists():
            continue
        for project_dir in sorted([item for item in trash_root.iterdir() if item.is_dir()], key=lambda p: p.stat().st_mtime, reverse=True):
            projects.append(deleted_project_item(project_dir, projects_root))
    return {"projects": projects[:30], "summary": {"total": len(projects), "restorable": len([item for item in projects if item.get("restorable")])}}


def restore_deleted_project(trash_path=None):
    if not trash_path:
        raise ValueError("missing project recycle path")
    source = Path(trash_path).resolve()
    owner_root = next((root.resolve() for root in managed_project_roots() if (root.resolve() / TRASH_DIR) in source.parents), None)
    if not owner_root:
        raise PermissionError("only managed recycle projects can be restored")
    if not source.exists() or not source.is_dir():
        raise FileNotFoundError(str(source))
    if not (source / "review_state.json").exists():
        raise FileNotFoundError("deleted project has no review_state.json")
    base_name = source.name
    restored_name = re.sub(r"_\d{8}_\d{6}$", "", base_name) or base_name
    target = owner_root / restored_name
    if target.exists():
        target = owner_root / f"{restored_name}_恢复_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.move(str(source), str(target))
    state_path = target / "review_state.json"
    return {"ok": True, "restored": str(target.resolve()), "state_path": str(state_path.resolve()), "projects": list_review_projects(), "deleted_projects": list_deleted_projects()}


def remove_tree_force(path):
    def handle_remove_error(func, failed_path, _exc_info):
        try:
            os.chmod(failed_path, 0o700)
            func(failed_path)
        except Exception:
            raise
    shutil.rmtree(str(path), onerror=handle_remove_error)


def purge_deleted_project(trash_path=None):
    if not trash_path:
        raise ValueError("missing project recycle path")
    source = Path(trash_path).resolve()
    owner_root = next((root.resolve() for root in managed_project_roots() if (root.resolve() / TRASH_DIR) in source.parents), None)
    if not owner_root:
        raise PermissionError("only managed recycle projects can be permanently deleted")
    trash_root = owner_root / TRASH_DIR
    if source == trash_root.resolve() or source.parent.resolve() != trash_root.resolve():
        raise PermissionError("only one project folder inside recycle bin can be permanently deleted")
    if not source.exists() or not source.is_dir():
        raise FileNotFoundError(str(source))
    remove_tree_force(source)
    return {"ok": True, "purged": str(source), "deleted_projects": list_deleted_projects()}


def rename_project(project_name):
    next_name = safe_project_name(project_name)
    if not next_name:
        raise ValueError("missing project name")
    state = load_review_state()
    old_name = state.get("project_name") or ""
    state["project_name"] = next_name
    if not state.get("drama_name") or state.get("drama_name") == old_name:
        state["drama_name"] = next_name
    persist_review_state(state, "project_renamed", "")
    return {"ok": True, "project_name": next_name, "state": state}


def delete_project(base_dir=None, state_path=None):
    if not base_dir and state_path:
        base_dir = str(Path(state_path).resolve().parent)
    if not base_dir:
        raise ValueError("missing project path")
    project_dir = Path(base_dir).resolve()
    managed_roots = [root.resolve() for root in managed_project_roots()]
    owner_root = next((root for root in managed_roots if project_dir != root and root in project_dir.parents), None)
    if not owner_root:
        raise PermissionError("only managed projects under review_projects can be deleted")
    state_file = project_dir / "review_state.json"
    if not state_file.exists():
        raise FileNotFoundError(str(state_file))
    trash_root = owner_root / TRASH_DIR
    trash_root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    target = trash_root / f"{project_dir.name}_{stamp}"
    shutil.move(str(project_dir), str(target))
    current = load_review_state() if STATE_PATH.exists() else {}
    if Path(current.get("base_dir", "")).resolve() == project_dir:
        fallback = create_empty_project(f"临时项目_{datetime.now().strftime('%Y%m%d')}", "", "")
        return {"ok": True, "deleted": str(project_dir), "trash_path": str(target), "active_state": fallback, "projects": list_review_projects()}
    return {"ok": True, "deleted": str(project_dir), "trash_path": str(target), "projects": list_review_projects()}

def load_project(base_dir=None, state_path=None):
    if state_path:
        state = json.loads(Path(state_path).read_text(encoding="utf-8-sig"))
        try:
            save_state(state)
        except PermissionError:
            state["_save_warning"] = "global state file is locked; project loaded without persisting active pointer"
        return state
    if base_dir:
        state = build_initial_state(Path(base_dir))
        try:
            save_state(state)
        except PermissionError:
            state["_save_warning"] = "global state file is locked; project loaded without persisting active pointer"
        return state
    return load_review_state()


def create_project_from_source(source_root, project_name=None, max_episodes=10):
    source = safe_path(source_root)
    if not source.is_dir():
        raise NotADirectoryError(str(source))
    videos = sorted([p for p in source.glob("*.mp4") if p.stem.isdigit()], key=lambda p: int(p.stem))
    if max_episodes:
        videos = videos[:int(max_episodes)]
    if not videos:
        raise FileNotFoundError("未找到按集命名的 mp4，例如 1.mp4、2.mp4")
    safe_name = project_name or source.name.replace("《", "").replace("》", "")[:40]
    safe_name = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff_-]+", "_", safe_name).strip("_") or "review_project"
    project_dir = PROJECTS_ROOT / safe_name
    originals_dir = project_dir / ASSETS_DIR
    proxies_dir = project_dir / PROXIES_DIR
    exports_dir = project_dir / "exports"
    originals_dir.mkdir(parents=True, exist_ok=True)
    proxies_dir.mkdir(parents=True, exist_ok=True)
    exports_dir.mkdir(parents=True, exist_ok=True)
    clips = []
    assets = []
    for video in videos:
        ep = int(video.stem)
        managed_video = originals_dir / f"{ep}.mp4"
        if not managed_video.exists() or managed_video.stat().st_size != video.stat().st_size:
            shutil.copy2(video, managed_video)
        assets.append({"episode": ep, "path": str(managed_video.resolve()), "filename": managed_video.name, "size": managed_video.stat().st_size})
        probe_duration = 180.0
        start = 0.0
        for idx in range(3):
            clip_start = start + idx * 45.0
            clip_end = min(clip_start + 35.0, probe_duration)
            clips.append({
                "id": f"{ep}_{idx:02d}",
                "episode": ep,
                "clip_index": idx,
                "source_video": str(managed_video.resolve()),
                "preview_video": str(managed_video.resolve()),
                "suggested_start": clip_start,
                "suggested_end": clip_end,
                "start": clip_start,
                "end": clip_end,
                "duration": round(clip_end - clip_start, 3),
                "score": None,
                "status": "pending",
                "note": "新项目占位切片：请运行 AI 重选或手动修改。",
            })
    state = {
        "project_name": safe_name,
        "project_kind": "managed_assets_placeholder",
        "source_root": str(originals_dir.resolve()),
        "base_dir": str(project_dir.resolve()),
        "output_dir": str(exports_dir.resolve()),
        "clips": clips,
        "assets": assets,
    }
    (project_dir / "review_state.json").write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    save_state(state)
    return state


def save_state(state):
    global RUNTIME_ACTIVE_STATE
    RUNTIME_ACTIVE_STATE = ensure_state_defaults(json.loads(json.dumps(state, ensure_ascii=False)))
    saved = False
    for state_path in (STATE_PATH, RUNTIME_STATE_FALLBACK_PATH):
        try:
            write_json_atomic(state_path, state)
            saved = True
        except (PermissionError, OSError):
            pass
    if not saved:
        state["_save_warning"] = "当前项目已在本次运行中生效，但暂时无法写入项目指针。"


def safe_path(value):
    path = Path(value).resolve()
    if not path.exists():
        raise FileNotFoundError(str(path))
    return path


def find_clip(state, clip_id):
    for clip in state.get("clips", []):
        if clip.get("id") == clip_id:
            return clip
    raise FileNotFoundError(f"clip not found: {clip_id}")


def persist_review_state(state, action="state_saved", clip_id=""):
    try:
        create_history_snapshot(state, action, clip_id)
        if state.get("base_dir"):
            save_project_state(state)
        else:
            save_state(state)
        return True
    except PermissionError:
        try:
            save_state(state)
            return True
        except PermissionError:
            state["_save_warning"] = "state file is locked or permission denied; changes are returned but not persisted"
            return False



def ffmpeg_bin():
    return str(FFMPEG if FFMPEG.exists() else "ffmpeg")


def ffprobe_video_codec(video_path):
    source = Path(video_path).resolve()
    try:
        stat = source.stat()
        cache_key = (str(source), int(stat.st_size), int(stat.st_mtime_ns))
    except OSError:
        cache_key = (str(source), 0, 0)
    with VIDEO_CODEC_CACHE_LOCK:
        if cache_key in VIDEO_CODEC_CACHE:
            return VIDEO_CODEC_CACHE[cache_key]

    codec = ""
    ffmpeg_path = Path(ffmpeg_bin())
    candidates = []
    if ffmpeg_path.name.lower() == "ffmpeg.exe":
        candidates.append(ffmpeg_path.with_name("ffprobe.exe"))
    candidates.append(Path("ffprobe"))
    for ffprobe in candidates:
        if not (ffprobe.is_absolute() and ffprobe.exists()) and str(ffprobe) != "ffprobe":
            continue
        cmd = [str(ffprobe), "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", str(source)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20)
            if result.returncode == 0:
                codec = (result.stdout or "").strip().lower()
                if codec:
                    break
        except Exception:
            pass
    if not codec:
        cmd = [ffmpeg_bin(), "-hide_banner", "-i", str(source), "-t", "0.01", "-f", "null", "NUL"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=12)
            text = f"{result.stderr}\n{result.stdout}".lower()
            if "video: h264" in text or "video: avc" in text or "(avc1" in text:
                codec = "h264"
            elif "video: hevc" in text or "video: h265" in text or "(hev1" in text or "(hvc1" in text:
                codec = "hevc"
        except Exception:
            pass
    with VIDEO_CODEC_CACHE_LOCK:
        VIDEO_CODEC_CACHE[cache_key] = codec
    return codec


def browser_direct_playable_codec(codec):
    return codec in ("h264", "avc1")


def browser_preview_video(video_path):
    source = safe_path(video_path)
    codec = ffprobe_video_codec(source)
    if source.suffix.lower() == ".mp4" and browser_direct_playable_codec(codec):
        return source
    target = browser_preview_path_for_source(source, codec)
    if target.exists() and target.stat().st_size > 0:
        return target
    if clipping_job_running():
        raise RuntimeError("正在切片，暂缓生成视频预览以避免抢占 CPU")
    pending = target.with_suffix(".partial.mp4")
    cmd = [
        ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(source),
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale='min(720,iw)':-2",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-threads", "2",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        str(pending),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    if result.returncode != 0 or not pending.exists() or pending.stat().st_size <= 0:
        pending.unlink(missing_ok=True)
        raise RuntimeError((result.stderr or result.stdout or "浏览器预览文件生成失败").strip()[:500])
    pending.replace(target)
    return target


def media_cache_dir_for(clip):
    try:
        base = Path(clip.get("source_video", "")).resolve()
        key = hashlib.md5(str(base).encode("utf-8")).hexdigest()[:12]
    except Exception:
        key = "unknown"
    cache_dir = TMP_DIR / "media_features" / key
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        probe = cache_dir / ".write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return cache_dir
    except PermissionError:
        fallback = Path(tempfile.gettempdir()) / "short_drama_media_features" / key
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def ffprobe_duration(video_path):
    ffmpeg_path = Path(ffmpeg_bin())
    candidates = []
    if ffmpeg_path.name.lower() == "ffmpeg.exe":
        candidates.append(ffmpeg_path.with_name("ffprobe.exe"))
    candidates.append(Path("ffprobe"))
    for ffprobe in candidates:
        if not (ffprobe.is_absolute() and ffprobe.exists()) and str(ffprobe) != "ffprobe":
            continue
        cmd = [str(ffprobe), "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20)
            if result.returncode == 0:
                duration = max(0.0, float((result.stdout or "0").strip() or 0))
                if duration > 0:
                    return duration
        except Exception:
            pass
    cmd = [ffmpeg_bin(), "-hide_banner", "-i", str(video_path)]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=8)
        text = result.stderr or ""
        match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
        if match:
            hours, minutes, seconds = match.groups()
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except Exception:
        pass
    return 0.0


def analyze_scene_points(video_path, clip_start, clip_end, cache_dir):
    cache = cache_dir / f"scene_{int(clip_start)}_{int(clip_end)}.json"
    if cache.exists():
        try:
            return json.loads(cache.read_text(encoding="utf-8"))
        except Exception:
            pass
    window_start = max(0.0, clip_start - 12.0)
    window_end = clip_end + 12.0
    duration = max(1.0, window_end - window_start)
    cmd = [ffmpeg_bin(), "-hide_banner", "-threads", "2", "-ss", f"{window_start:.3f}", "-t", f"{duration:.3f}", "-i", str(video_path), "-filter:v", "select='gt(scene,0.28)',showinfo", "-f", "null", "-"]
    points = []
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=18)
        for line in (result.stderr or "").splitlines():
            marker_text = "pts_time:"
            if marker_text not in line:
                continue
            tail = line.split(marker_text, 1)[1].split()[0]
            try:
                points.append(round(window_start + float(tail), 3))
            except Exception:
                continue
    except Exception:
        points = []
    points = sorted(set(points))[:80]
    cache.write_text(json.dumps(points, ensure_ascii=False, indent=2), encoding="utf-8")
    return points


def analyze_audio_profile(video_path, clip_start, clip_end, cache_dir):
    cache = cache_dir / f"audio_{int(clip_start)}_{int(clip_end)}.json"
    if cache.exists():
        try:
            cached = json.loads(cache.read_text(encoding="utf-8"))
            if int(cached.get("audio_feature_version") or 0) >= 2:
                return cached
            dynamic_range = float(cached.get("dynamic_range") or 0)
            voice_activity_ratio = float(cached.get("voice_activity_ratio") or 0)
            quiet_ratio = float(cached.get("quiet_ratio") or 0)
            pause_transition_rate = float(cached.get("pause_transition_rate") or 0)
            rms_p50 = float(cached.get("rms_p50") or cached.get("rms_avg") or 0)
            rms_p90 = float(cached.get("rms_p90") or cached.get("rms_max") or 0)
            tension_peak = max(0.0, rms_p90 - rms_p50) if rms_p90 or rms_p50 else max(0.0, dynamic_range * 0.35)
            audio_tension_score = min(
                100.0,
                min(42.0, max(0.0, dynamic_range * 1.05))
                + min(20.0, tension_peak * 2.2)
                + min(16.0, pause_transition_rate * 70.0)
                + min(14.0, voice_activity_ratio * 14.0)
                + min(8.0, quiet_ratio * 12.0),
            )
            cached.update({
                "rms_p25": cached.get("rms_p25", cached.get("rms_min")),
                "rms_p50": cached.get("rms_p50", cached.get("rms_avg")),
                "rms_p75": cached.get("rms_p75", cached.get("rms_avg")),
                "rms_p90": cached.get("rms_p90", cached.get("rms_max")),
                "voice_activity_ratio": round(voice_activity_ratio, 3),
                "quiet_ratio": round(quiet_ratio, 3),
                "pause_transition_rate": round(pause_transition_rate, 3),
                "tension_peak": round(tension_peak, 2),
                "audio_tension_score": round(audio_tension_score, 2),
                "audio_feature_source": "cache_migrated_v2",
                "audio_feature_version": 2,
            })
            cache.write_text(json.dumps(cached, ensure_ascii=False, indent=2), encoding="utf-8")
            return cached
        except Exception:
            pass
    window_start = max(0.0, clip_start - 12.0)
    window_end = clip_end + 12.0
    duration = max(1.0, window_end - window_start)
    cmd = [ffmpeg_bin(), "-hide_banner", "-threads", "2", "-ss", f"{window_start:.3f}", "-t", f"{duration:.3f}", "-i", str(video_path), "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level", "-f", "null", "-"]
    rms_values = []
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=18)
        for line in (result.stderr or "").splitlines():
            if "lavfi.astats.Overall.RMS_level=" not in line:
                continue
            value = line.rsplit("=", 1)[-1].strip()
            try:
                rms_value = float(value)
                if math.isfinite(rms_value):
                    rms_values.append(rms_value)
            except Exception:
                continue
    except Exception:
        rms_values = []
    if rms_values:
        ordered = sorted(rms_values)
        sample_count = len(ordered)

        def percentile(ratio):
            if not ordered:
                return 0.0
            index = min(sample_count - 1, max(0, int(round((sample_count - 1) * ratio))))
            return ordered[index]

        rms_min = min(rms_values)
        rms_max = max(rms_values)
        rms_avg = sum(rms_values) / sample_count
        rms_p25 = percentile(0.25)
        rms_p50 = percentile(0.50)
        rms_p75 = percentile(0.75)
        rms_p90 = percentile(0.90)
        active_threshold = max(rms_p50 - 3.0, rms_avg - 5.0, -42.0)
        quiet_threshold = min(rms_p25 + 1.5, active_threshold - 6.0)
        active_count = len([value for value in rms_values if value >= active_threshold])
        quiet_count = len([value for value in rms_values if value <= quiet_threshold])
        transitions = 0
        previous_active = None
        for value in rms_values:
            current_active = value >= active_threshold
            if previous_active is not None and current_active != previous_active:
                transitions += 1
            previous_active = current_active
        voice_activity_ratio = active_count / sample_count
        quiet_ratio = quiet_count / sample_count
        pause_transition_rate = transitions / max(1, sample_count - 1)
        tension_peak = max(0.0, rms_p90 - rms_p50)
        audio_tension_score = min(
            100.0,
            min(42.0, max(0.0, (rms_max - rms_min) * 1.05))
            + min(20.0, tension_peak * 2.2)
            + min(16.0, pause_transition_rate * 70.0)
            + min(14.0, voice_activity_ratio * 14.0)
            + min(8.0, quiet_ratio * 12.0),
        )
        profile = {
            "samples": sample_count,
            "rms_min": round(rms_min, 2),
            "rms_max": round(rms_max, 2),
            "rms_avg": round(rms_avg, 2),
            "rms_p25": round(rms_p25, 2),
            "rms_p50": round(rms_p50, 2),
            "rms_p75": round(rms_p75, 2),
            "rms_p90": round(rms_p90, 2),
            "dynamic_range": round(rms_max - rms_min, 2),
            "voice_activity_ratio": round(voice_activity_ratio, 3),
            "quiet_ratio": round(quiet_ratio, 3),
            "pause_transition_rate": round(pause_transition_rate, 3),
            "tension_peak": round(tension_peak, 2),
            "audio_tension_score": round(audio_tension_score, 2),
            "audio_feature_source": "ffmpeg_astats_rms",
            "audio_feature_version": 2,
        }
    else:
        profile = {
            "samples": 0,
            "rms_min": None,
            "rms_max": None,
            "rms_avg": None,
            "rms_p25": None,
            "rms_p50": None,
            "rms_p75": None,
            "rms_p90": None,
            "dynamic_range": 0,
            "voice_activity_ratio": 0,
            "quiet_ratio": 0,
            "pause_transition_rate": 0,
            "tension_peak": 0,
            "audio_tension_score": 0,
            "audio_feature_source": "unavailable",
            "audio_feature_version": 2,
        }
    cache.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


def nearest_before(points, value, fallback):
    candidates = [point for point in points if point <= value]
    return max(candidates) if candidates else fallback


def nearest_after(points, value, fallback):
    candidates = [point for point in points if point >= value]
    return min(candidates) if candidates else fallback


def parse_subtitle_timestamp(value):
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    try:
        if len(parts) == 3:
            hours, minutes, seconds = parts
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        if len(parts) == 2:
            minutes, seconds = parts
            return int(minutes) * 60 + float(seconds)
    except Exception:
        return None
    return None


def parse_srt_or_vtt(text):
    pattern = re.compile(
        r"(?P<start>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*"
        r"(?P<end>\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})"
    )
    segments = []
    matches = list(pattern.finditer(text))
    for index, match in enumerate(matches):
        start = parse_subtitle_timestamp(match.group("start"))
        end = parse_subtitle_timestamp(match.group("end"))
        if start is None or end is None or end <= start:
            continue
        text_start = match.end()
        text_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        caption = re.sub(r"<[^>]+>", "", text[text_start:text_end])
        caption = re.sub(r"^\s*\d+\s*$", "", caption, flags=re.MULTILINE)
        caption = " ".join(line.strip() for line in caption.splitlines() if line.strip())
        segments.append({"start": round(start, 3), "end": round(end, 3), "text": caption[:120]})
    return segments


def parse_ass_dialogue_time(value):
    value = value.strip()
    parts = value.split(":")
    try:
        if len(parts) == 3:
            hours, minutes, seconds = parts
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
    except Exception:
        return None
    return None


def parse_ass_or_ssa(text):
    segments = []
    for line in text.splitlines():
        if not line.startswith("Dialogue:"):
            continue
        payload = line.split(":", 1)[1].strip()
        parts = payload.split(",", 9)
        if len(parts) < 3:
            continue
        start = parse_ass_dialogue_time(parts[1])
        end = parse_ass_dialogue_time(parts[2])
        if start is None or end is None or end <= start:
            continue
        caption = parts[9] if len(parts) > 9 else ""
        caption = re.sub(r"\{[^}]+\}", "", caption).replace("\\N", " ").replace("\\n", " ")
        caption = re.sub(r"\s+", " ", caption).strip()
        segments.append({"start": round(start, 3), "end": round(end, 3), "text": caption[:120]})
    return segments


def subtitle_candidates_for_video(video_path):
    video = Path(video_path)
    candidates = []
    for subtitle_dir in subtitle_dirs_for_video(video):
        for suffix in (".srt", ".vtt", ".ass", ".ssa"):
            candidates.append(subtitle_dir / f"{video.stem}{suffix}")
            candidates.append(subtitle_dir / f"{video.stem}.zh{suffix}")
            candidates.append(subtitle_dir / f"{video.stem}.chs{suffix}")
    for suffix in (".srt", ".vtt", ".ass", ".ssa"):
        candidates.append(video.with_suffix(suffix))
        candidates.append(video.parent / f"{video.stem}.zh{suffix}")
        candidates.append(video.parent / f"{video.stem}.chs{suffix}")
    return candidates


def first_existing_subtitle_for_video(video_path):
    for candidate in subtitle_candidates_for_video(video_path):
        try:
            if candidate.exists():
                return candidate
        except Exception:
            continue
    return None


def trusted_subtitle_for_asset(state, asset):
    video = Path(asset.get("path") or "")
    manual_asset_keys, manual_subtitle_path_keys = manual_subtitle_keys(state)
    try:
        video_key = str(video.resolve()).lower()
    except Exception:
        video_key = str(video).lower()
    project_subtitle_dirs = set()
    try:
        source_root = Path(state.get("source_root") or "").resolve()
        project_subtitle_dirs.add(str((source_root.parent / "subtitles").resolve()).lower())
    except Exception:
        pass
    for candidate in subtitle_candidates_for_video(video):
        try:
            if not candidate.exists():
                continue
        except Exception:
            continue
        try:
            subtitle_key = str(candidate.resolve()).lower()
            parent_key = str(candidate.parent.resolve()).lower()
        except Exception:
            subtitle_key = str(candidate).lower()
            parent_key = str(candidate.parent).lower()
        manual_imported = video_key in manual_asset_keys or subtitle_key in manual_subtitle_path_keys
        managed_output = parent_key in project_subtitle_dirs
        if manual_imported or managed_output:
            return candidate, manual_imported
    return None, False


def manual_subtitle_keys(state):
    asset_keys = set()
    subtitle_keys = set()
    manual = state.get("manual_subtitles") or {}
    if isinstance(manual, dict):
        records = manual.values()
    else:
        records = manual if isinstance(manual, list) else []
    for item in records:
        if not isinstance(item, dict):
            continue
        try:
            asset_keys.add(str(Path(item.get("asset") or "").resolve()).lower())
        except Exception:
            pass
        try:
            subtitle_keys.add(str(Path(item.get("subtitle") or "").resolve()).lower())
        except Exception:
            pass
    for record in state.get("task_records", []) or []:
        if record.get("kind") != "subtitle_imported":
            continue
        meta = record.get("meta") or {}
        try:
            asset_keys.add(str(Path(meta.get("asset") or "").resolve()).lower())
        except Exception:
            pass
        try:
            subtitle_keys.add(str(Path(meta.get("subtitle") or "").resolve()).lower())
        except Exception:
            pass
    return asset_keys, subtitle_keys


def subtitle_dirs_for_video(video_path):
    video = Path(video_path).resolve()
    dirs = []
    parents = [video.parent]
    try:
        parents.extend(video.parents)
    except Exception:
        pass
    for parent in parents:
        if parent.name.lower() == ASSETS_DIR:
            dirs.append(parent.parent / "subtitles")
            break
    dirs.append(video.parent / "subtitles")
    dirs.append(TMP_DIR / "subtitles" / safe_project_name(video.parent.parent.name if video.parent.name.lower() == ASSETS_DIR else video.parent.name))
    dirs.append(Path(tempfile.gettempdir()) / "short_drama_subtitles" / safe_project_name(video.parent.parent.name if video.parent.name.lower() == ASSETS_DIR else video.parent.name))
    unique = []
    seen = set()
    for directory in dirs:
        key = str(directory.resolve()).lower()
        if key not in seen:
            unique.append(directory)
            seen.add(key)
    return unique


def writable_subtitle_path_for_video(video_path, suffix=".srt"):
    video = Path(video_path).resolve()
    suffix = suffix if str(suffix).startswith(".") else f".{suffix}"
    for directory in subtitle_dirs_for_video(video):
        try:
            directory.mkdir(parents=True, exist_ok=True)
            probe = directory / f".write_probe_{uuid.uuid4().hex}.tmp"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            return directory / f"{video.stem}{suffix}"
        except Exception:
            continue
    raise PermissionError("没有可写入的字幕目录")


def subtitle_segments_for_clip(clip):
    try:
        video_path = safe_path(clip.get("source_video"))
    except Exception as exc:
        return {"available": False, "reason": str(exc), "segments": [], "source": ""}
    for subtitle_path in subtitle_candidates_for_video(video_path):
        if not subtitle_path.exists():
            continue
        try:
            text = subtitle_path.read_text(encoding="utf-8-sig", errors="replace")
            if subtitle_path.suffix.lower() in (".ass", ".ssa"):
                segments = parse_ass_or_ssa(text)
            else:
                segments = parse_srt_or_vtt(text)
        except Exception as exc:
            return {"available": False, "reason": f"字幕读取失败：{exc}", "segments": [], "source": str(subtitle_path)}
        return {
            "available": bool(segments),
            "reason": "" if segments else "字幕文件存在，但没有解析到时间轴。",
            "segments": segments,
            "source": str(subtitle_path),
        }
    return {"available": False, "reason": "未找到同名 .srt/.vtt/.ass 字幕文件。", "segments": [], "source": ""}


def media_features_for_clip(clip):
    try:
        video_path = safe_path(clip.get("source_video"))
    except Exception as exc:
        return {"available": False, "error": str(exc), "scene_points": [], "audio": {"dynamic_range": 0}, "engine": "unavailable"}
    start = float(clip.get("start", 0))
    end = float(clip.get("end", start + 1))
    cache_dir = media_cache_dir_for(clip)
    scene_points = analyze_scene_points(video_path, start, end, cache_dir)
    audio = analyze_audio_profile(video_path, start, end, cache_dir)
    return {
        "available": True,
        "scene_points": scene_points,
        "scene_count": len(scene_points),
        "audio": audio,
        "video_duration": ffprobe_duration(video_path),
        "engine": "ffmpeg scene+astats",
    }


def clip_boundary_points(state, clip_id):
    clip = find_clip(state, clip_id)
    start = float(clip.get("start", 0))
    end = float(clip.get("end", start + 1))
    points = []

    def add(time_value, label, kind, confidence=60, source="state"):
        try:
            time_value = round(float(time_value), 3)
        except Exception:
            return
        if time_value < 0:
            return
        points.append({
            "time": time_value,
            "label": label,
            "kind": kind,
            "confidence": int(confidence),
            "source": source,
        })

    add(start, "当前开始点", "current_start", 70)
    add(end, "当前结束点", "current_end", 70)
    add(clip.get("suggested_start"), "建议开始点", "suggested_start", 80)
    add(clip.get("suggested_end"), "建议结束点", "suggested_end", 80)

    for item in state.get("clips", []):
        if item.get("id") == clip.get("id") or int(item.get("episode") or 0) != int(clip.get("episode") or 0):
            continue
        add(item.get("start"), f"相邻片段 {item.get('id')} 开始", "neighbor_start", 52)
        add(item.get("end"), f"相邻片段 {item.get('id')} 结束", "neighbor_end", 52)

    features = media_features_for_clip(clip)
    scene_points = features.get("scene_points") or []
    for point in scene_points:
        if start - 8.0 <= float(point) <= end + 8.0:
            add(point, "镜头切点", "scene_cut", 74, features.get("engine", "scene"))

    audio = features.get("audio") or {}
    dynamic_range = float(audio.get("dynamic_range") or 0)
    if dynamic_range >= 12:
        add(max(0.0, start - 2.0), "声音安全开始", "audio_safe_start", 58, "ffmpeg astats")
        add(end + 3.0, "声音安全结束", "audio_safe_end", 58, "ffmpeg astats")

    subtitles = subtitle_segments_for_clip(clip)
    subtitle_segments = subtitles.get("segments") or []
    for segment in subtitle_segments:
        segment_start = float(segment.get("start", 0))
        segment_end = float(segment.get("end", 0))
        if start - 8.0 <= segment_start <= end + 8.0:
            add(max(0.0, segment_start - 0.25), f"字幕句首：{segment.get('text') or '对白'}", "subtitle_sentence_start", 86, "subtitle")
        if start - 8.0 <= segment_end <= end + 8.0:
            add(segment_end + 0.35, f"字幕句尾：{segment.get('text') or '对白'}", "subtitle_sentence_end", 88, "subtitle")

    deduped = []
    seen = set()
    for point in sorted(points, key=lambda item: (item["time"], -item["confidence"])):
        key = (round(point["time"], 1), point["kind"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(point)
    return {
        "ok": True,
        "id": clip_id,
        "engine": features.get("engine", "state"),
        "video_duration": features.get("video_duration", 0),
        "audio": audio,
        "points": deduped[:120],
        "summary": {
            "total": len(deduped),
            "scene": len([item for item in deduped if item["kind"] == "scene_cut"]),
            "audio": len([item for item in deduped if item["kind"].startswith("audio_")]),
            "subtitle": len([item for item in deduped if item["kind"].startswith("subtitle_")]),
            "state": len([item for item in deduped if item["source"] == "state"]),
            "subtitle_available": subtitles.get("available", False),
            "subtitle_reason": subtitles.get("reason", ""),
        },
    }

def ai_candidate_pool_for_clip(clip, intent="complete"):
    start = float(clip.get("start", 0))
    end = float(clip.get("end", start + 1))
    features = media_features_for_clip(clip)
    scene_points = features.get("scene_points", [])
    audio = features.get("audio", {}) or {}
    dynamic_range = float(audio.get("dynamic_range") or 0)
    video_duration = float(features.get("video_duration") or max(end + 30.0, 1.0))
    subtitles = subtitle_segments_for_clip(clip)
    subtitle_segments = subtitles.get("segments") or []
    scene_start = nearest_before(scene_points, start, max(0.0, start - 3.0))
    scene_end = nearest_after(scene_points, end, end + 5.0)
    if scene_end <= scene_start + 3.0:
        scene_end = max(scene_start + 3.0, end + 5.0)
    hook_start_delta = 0.5 if dynamic_range >= 12 else 1.0
    hook_end_delta = -0.5 if dynamic_range >= 12 else -1.0
    long_extra = 10.0 if dynamic_range >= 16 else 8.0
    intent = (intent or "complete").lower()
    variants = [
        ("scene_boundary", "Scene boundary", scene_start, scene_end, "Uses detected visual scene-cut points around the clip."),
        ("audio_peak_safe", "Audio energy safe", max(0.0, start - (4.0 if dynamic_range >= 12 else 2.0)), end + (5.0 if dynamic_range >= 12 else 3.0), "Expands more when audio dynamics suggest a high-energy beat."),
        ("tight_hook", "Tight hook", max(0.0, start + hook_start_delta), max(start + hook_start_delta + 3.0, end + hook_end_delta), "Keeps the candidate tighter for hook testing."),
        ("long_material", "Long material", max(0.0, scene_start - 3.0), max(scene_end + long_extra, end + long_extra), "Provides a longer version for material volume and manual trimming."),
    ]
    if intent == "complete":
        variants.insert(0, ("complete_scene", "Complete scene", max(0.0, scene_start - 2.0), max(scene_end + 4.0, end + 4.0), "Prioritizes full-scene completeness and protects dialogue tails."))
    elif intent == "longer":
        variants.insert(0, ("longer_material", "Longer material", max(0.0, scene_start - 6.0), max(scene_end + 16.0, end + 16.0), "Gives a longer usable source clip for delivery volume and manual trimming."))
    elif intent == "hook":
        variants.insert(0, ("strong_hook", "Stronger hook", max(0.0, start - 1.0), max(start + 8.0, end + 1.5), "Prioritizes a tighter high-conflict hook candidate."))
    elif intent == "safe":
        variants.insert(0, ("safe_boundary", "Safer boundary", max(0.0, scene_start - 4.0), max(scene_end + 8.0, end + 8.0), "Adds wider handles to reduce missing first or last dialogue."))
    candidates = []
    for index, (key, title, candidate_start, candidate_end, reason) in enumerate(variants):
        candidate_start = max(0.0, float(candidate_start))
        candidate_end = max(candidate_start + 3.0, float(candidate_end))
        protected_start, protected_end, protected = dialogue_protected_window(candidate_start, candidate_end, subtitle_segments, video_duration)
        if protected:
            candidate_start = protected_start
            candidate_end = protected_end
            reason = f"{reason} Dialogue boundary protected by subtitle timing."
        candidates.append({
            "id": f"{clip.get('id')}_cand_{index}",
            "key": key,
            "title": title,
            "start": round(candidate_start, 3),
            "end": round(candidate_end, 3),
            "duration": round(candidate_end - candidate_start, 3),
            "reason": reason,
            "intent": intent,
            "features": {
                "engine": features.get("engine"),
                "scene_count": features.get("scene_count", 0),
                "audio_dynamic_range": dynamic_range,
                "audio_samples": audio.get("samples", 0),
                "audio_tension_score": audio.get("audio_tension_score", 0),
                "voice_activity_ratio": audio.get("voice_activity_ratio", 0),
                "quiet_ratio": audio.get("quiet_ratio", 0),
                "pause_transition_rate": audio.get("pause_transition_rate", 0),
                "tension_peak": audio.get("tension_peak", 0),
                "subtitle_available": subtitles.get("available", False),
                "subtitle_boundary_protected": protected,
            },
        })
    return candidates


def model_configured(settings=None):
    settings = settings or load_settings()
    model = settings.get("model", {})
    provider = (model.get("provider") or "deepseek").lower()
    api_key_env = model.get("api_key_env") or ("OPENAI_API_KEY" if provider == "openai" else "DEEPSEEK_API_KEY")
    return bool(os.environ.get(api_key_env, ""))


def parse_model_candidate_review(raw, candidates):
    cleaned = str(raw or "").strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    data = json.loads(cleaned)
    ranking = data.get("ranking") or []
    by_key = {item.get("key"): item for item in candidates}
    ranked = []
    seen = set()
    for item in ranking:
        key = item.get("key")
        if key not in by_key or key in seen:
            continue
        candidate = by_key[key]
        candidate["model_score"] = max(0, min(100, int(item.get("score") or 0)))
        candidate["model_reason"] = str(item.get("reason") or "").strip()[:120]
        candidate["model_risks"] = [str(risk)[:60] for risk in (item.get("risks") or [])[:3]]
        decision = str(item.get("decision") or "keep").strip().lower()
        candidate["model_decision"] = "reject" if decision in ("reject", "drop", "淘汰", "删除") else "keep"
        intent = str(item.get("clip_intent") or "").strip()
        if intent in {"complete_scene", "hook", "payoff", "suspense", "scene_bridge", "emotion_peak", "visual_action"}:
            candidate["clip_intent"] = intent
        selection_reason = str(item.get("selection_reason") or "").strip()
        if selection_reason:
            candidate["selection_reason"] = selection_reason[:180]
        ranked.append(candidate)
        seen.add(key)
    ranked.extend([item for item in candidates if item.get("key") not in seen])
    summary = str(data.get("summary") or "").strip()[:160]
    return ranked, summary


def subtitle_context_for_boundary_review(subtitle_segments, start, end, before_seconds=18.0, after_seconds=18.0):
    try:
        start = float(start)
        end = float(end)
    except Exception:
        start = 0.0
        end = 0.0
    rows = []
    for index, segment in enumerate(subtitle_segments or []):
        try:
            segment_start = float(segment.get("start", 0))
            segment_end = float(segment.get("end", 0))
        except Exception:
            continue
        if segment_end < start - before_seconds or segment_start > end + after_seconds:
            continue
        if segment_end <= start:
            position = "before_start"
        elif segment_start < start < segment_end:
            position = "contains_start"
        elif segment_start < end < segment_end:
            position = "contains_end"
        elif segment_start >= end:
            position = "after_end"
        else:
            position = "inside_clip"
        rows.append({
            "index": index,
            "start": round(segment_start, 3),
            "end": round(segment_end, 3),
            "position": position,
            "text": str(segment.get("text") or "")[:120],
        })
    return rows[:32]


def parse_model_boundary_review(raw, candidates):
    cleaned = str(raw or "").strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    data = json.loads(cleaned)
    actions = data.get("actions") or data.get("ranking") or []
    by_key = {item.get("key"): item for item in candidates}
    parsed = {}
    for action in actions:
        key = action.get("key")
        if key not in by_key:
            continue
        decision = str(action.get("decision") or "keep").strip().lower()
        if decision in ("drop", "reject", "删除", "淘汰", "拒绝"):
            decision = "reject"
        elif decision in ("repair", "fix", "adjust", "修复", "调整", "前移", "后移"):
            decision = "repair"
        else:
            decision = "keep"
        parsed[key] = {
            "decision": decision,
            "new_start": action.get("new_start", action.get("start")),
            "new_end": action.get("new_end", action.get("end")),
            "reason": str(action.get("reason") or "").strip()[:180],
            "risks": [str(risk)[:80] for risk in (action.get("risks") or [])[:4]],
        }
    return parsed, str(data.get("summary") or "").strip()[:180]


def model_boundary_review_selected_candidates(asset, selected, subtitle_segments, duration, target):
    settings = load_settings()
    model = settings.get("model", {})
    if not model_configured(settings) or not selected or not subtitle_segments:
        return selected, {"source": "rule_fallback", "model": "规则算法", "summary": "边界复核使用规则算法。", "error": ""}
    keyed = []
    for index, item in enumerate(selected[:max(1, int(target or len(selected)))]):
        candidate = dict(item)
        candidate["key"] = candidate_review_key(candidate, index)
        keyed.append(candidate)
    payload = {
        "episode": asset.get("episode"),
        "filename": asset.get("filename") or Path(asset.get("path") or "").name,
        "duration": round(float(duration or 0), 1),
        "review_goal": "候选入库前边界硬伤复核，不预测爆款，只拦截无效素材。",
        "candidates": [
            {
                "key": item.get("key"),
                "start": item.get("start"),
                "end": item.get("end"),
                "duration": round(float(item.get("end", 0)) - float(item.get("start", 0)), 2),
                "reason": item.get("reason"),
                "variant": item.get("variant"),
                "clip_intent": item.get("clip_intent") or candidate_clip_intent(item),
                "selection_reason": item.get("selection_reason") or candidate_selection_reason(item),
                "subtitle_excerpt": subtitle_text_for_window(
                    subtitle_segments,
                    float(item.get("start", 0) or 0),
                    float(item.get("end", 0) or 0),
                )[:420],
                "boundary_context": subtitle_context_for_boundary_review(
                    subtitle_segments,
                    float(item.get("start", 0) or 0),
                    float(item.get("end", 0) or 0),
                ),
            }
            for item in keyed
        ],
    }
    prompt = (
        "你是短剧切片的语义边界质检员。请只返回 JSON。"
        "任务不是判断素材会不会爆，而是判断候选是否存在硬伤：切半句话、从连续台词后半句进入、丢掉紧贴前面的称呼/命令/起势、结尾切掉反应或半句、串入不该进入的下一场。"
        "ASR 字幕可能有错字，例如“我也要”可能识别成“我要”；不要只依赖单字，要根据上下文、时间间隔、同一口气和语义连续性判断。"
        "如果候选从同一口气中间进入但前一句是称呼、命令、威胁铺垫或情绪起势，应 repair，把 new_start 前移到合适字幕行开始。"
        "如果候选结尾切掉同一句/同一反应，应 repair，把 new_end 后移到合适字幕行结束。"
        "重要：强陈述句可以是合法出点，即使后面仍是同一场戏的说明或继续施压；例如“我让你跟他殉情”“你就是我的猎物”这类陈述完成点，不要仅因为后面还有解释/说明就强行延到集尾。"
        "如果无法通过前后移动修成有效素材，应 reject。"
        "允许同一场戏多个不同有效入点，但每个入点都必须能独立成立。"
        "new_start/new_end 只能使用输入 boundary_context 中出现的字幕 start/end，或保持原时间。"
        "返回格式："
        '{"summary":"一句中文结论","actions":[{"key":"候选key","decision":"keep或repair或reject","new_start":0.0,"new_end":10.0,"reason":"中文理由","risks":["风险"]}]}'
        "\n输入：\n" + json.dumps(payload, ensure_ascii=False)
    )
    try:
        raw = call_chat_model(prompt)
        actions, summary = parse_model_boundary_review(raw, keyed)
        reviewed = []
        rejected = []
        provider_name = model.get("display_name") or model.get("provider") or "AI 大模型"
        for item in keyed:
            action = actions.get(item.get("key"), {"decision": "keep", "reason": "模型未返回该候选，按规则复核。", "risks": []})
            if action.get("decision") == "reject":
                rejected.append({"key": item.get("key"), "start": item.get("start"), "end": item.get("end"), "reason": action.get("reason")})
                continue
            candidate = dict(item)
            original_end = float(candidate.get("end", 0) or 0)
            if action.get("decision") == "repair":
                try:
                    candidate["start"] = max(0.0, float(action.get("new_start")))
                    proposed_end = min(float(duration or candidate.get("end", 0)), float(action.get("new_end")))
                    if (
                        candidate.get("reason") == "subtitle_declarative_endpoint_variant"
                        and proposed_end > original_end + 0.2
                    ):
                        candidate["end"] = original_end
                    else:
                        candidate["end"] = proposed_end
                except Exception:
                    pass
            candidate["model_boundary_review"] = {
                "source": "live_model",
                "model": provider_name,
                "decision": action.get("decision"),
                "reason": action.get("reason"),
                "risks": action.get("risks") or [],
            }
            fixed = internal_clip_validation(candidate, subtitle_segments, duration)
            if fixed is None:
                rejected.append({"key": item.get("key"), "start": item.get("start"), "end": item.get("end"), "reason": "internal_validation_after_model"})
                continue
            if any(candidate_similarity_redundant(fixed, kept) and not same_scene_intent_variant(fixed, kept) for kept in reviewed):
                rejected.append({"key": item.get("key"), "start": item.get("start"), "end": item.get("end"), "reason": "duplicate_after_model_boundary_review"})
                continue
            reviewed.append(fixed)
        for item in selected:
            if len(reviewed) >= int(target or len(selected)):
                break
            if any(item is kept for kept in keyed):
                continue
            fixed = internal_clip_validation(item, subtitle_segments, duration)
            if fixed is not None:
                reviewed.append(fixed)
        if not reviewed:
            return selected, {"source": "rule_fallback", "model": "规则算法", "summary": "大模型边界复核无可用候选，保留规则结果。", "error": "all_rejected"}
        return reviewed[:int(target or len(reviewed))], {
            "source": "live_model",
            "model": provider_name,
            "summary": summary or f"{provider_name} 已完成边界复核。",
            "rejected": rejected,
            "error": "",
        }
    except Exception as exc:
        return selected, {"source": "rule_fallback", "model": "规则算法", "summary": "大模型边界复核失败，已使用规则算法结果。", "error": str(exc)}


def candidate_review_key(item, index):
    return str(item.get("key") or item.get("id") or f"candidate_{index}")


def model_review_initial_clip_candidates(asset, candidates, target, duration):
    settings = load_settings()
    model = settings.get("model", {})
    if not model_configured(settings) or not candidates:
        return candidates, {"source": "rule_fallback", "model": "规则算法", "summary": "初始切片使用规则算法排序。", "error": ""}
    subtitle_segments = subtitle_segments_for_video(safe_path(asset.get("path") or ""))
    keyed_candidates = []
    for index, item in enumerate(candidates):
        candidate = dict(item)
        candidate["key"] = candidate_review_key(candidate, index)
        keyed_candidates.append(candidate)
    payload = {
        "episode": asset.get("episode"),
        "filename": asset.get("filename") or Path(asset.get("path") or "").name,
        "duration": round(float(duration or 0), 1),
        "target": target,
        "candidates": [
            {
                "key": item.get("key"),
                "start": item.get("start"),
                "end": item.get("end"),
                "duration": round(float(item.get("end", 0)) - float(item.get("start", 0)), 2),
                "reason": item.get("reason"),
                "score": item.get("score"),
                "subtitle_lines": item.get("subtitle_line_count", 0),
                "subtitle_protected": item.get("subtitle_boundary_protected", False),
                "semantic_unit_protected": item.get("semantic_unit_protected", False),
                "audio_dynamic_range": item.get("audio_dynamic_range", 0),
                "audio_tension_score": item.get("audio_tension_score", 0),
                "voice_activity_ratio": item.get("voice_activity_ratio", 0),
                "quiet_ratio": item.get("quiet_ratio", 0),
                "pause_transition_rate": item.get("pause_transition_rate", 0),
                "clip_intent": item.get("clip_intent") or candidate_clip_intent(item),
                "selection_reason": item.get("selection_reason") or candidate_selection_reason(item),
                "subtitle_excerpt": subtitle_text_for_window(
                    subtitle_segments,
                    float(item.get("start", 0) or 0),
                    float(item.get("end", 0) or 0),
                )[:360],
                "traffic_material": item.get("traffic_material") or {},
            }
            for item in keyed_candidates[:18]
        ],
    }
    prompt = (
        "你是短剧投流切片策划，不是单纯评分器。请只返回 JSON。"
        "任务：阅读候选片段的对白、时间、声音和规则线索，判断它适合做哪类投流素材，并淘汰没有爆点证据的候选。"
        "你不能生成新时间码，不能改 start/end；但你必须给出 clip_intent、selection_reason、decision。"
        "clip_intent 只能是 complete_scene、hook、payoff、suspense、scene_bridge、emotion_peak、visual_action。"
        "允许同一场戏保留多条不同入点/出点；允许相邻两场都保留；不要因为目标条数强行保留弱片。"
        "重要规则：同一场戏的不同强冲突入点不是普通重复素材，只要开头不同、能独立抓人、语义完整，就必须按独立投流素材评估。"
        "不要因为它们来自同一场戏就 reject；只有基础无效、无爆点、语义断裂、明显不可投流时才 reject。"
        "投流本质是测试素材，不是预测唯一爆款；没有明显爆点但语义完整、边界完整、能表达关系/设定/情绪铺垫的片段，也可以作为有效测试素材保留。"
        "基础硬伤优先级最高：切半句话、边界断裂、字幕缺失、时长异常、语义不可理解的候选必须 reject。"
        "完整场景本身不是爆点理由，必须说明冲突、悬念、爽点、情绪、跨场推进或画面声音价值。"
        "返回格式："
        '{"summary":"一句中文策划结论","ranking":[{"key":"候选key","decision":"keep或reject","score":0-100,"clip_intent":"hook","selection_reason":"为什么值得选或为什么淘汰","reason":"中文短理由","risks":["风险"]}]}'
        "\n输入：\n" + json.dumps(payload, ensure_ascii=False)
    )
    try:
        raw = call_chat_model(prompt)
        ranked, summary = parse_model_candidate_review(raw, keyed_candidates)
        provider_name = model.get("display_name") or model.get("provider") or "AI 大模型"
        for item in ranked:
            item["model_review"] = {
                "source": "live_model",
                "model": provider_name,
                "summary": summary,
            }
        return ranked, {"source": "live_model", "model": provider_name, "summary": summary or f"{provider_name} 已完成初始候选爆点策划。", "error": ""}
    except Exception as exc:
        return candidates, {"source": "rule_fallback", "model": "规则算法", "summary": "大模型爆点策划失败，已使用规则算法排序。", "error": str(exc)}


def model_review_ai_candidates(clip, candidates, intent="complete"):
    settings = load_settings()
    model = settings.get("model", {})
    if not model_configured(settings):
        return candidates, {
            "source": "rule_fallback",
            "model": "规则算法",
            "summary": "未配置大模型，已使用规则算法排序。",
            "error": "",
        }
    payload = {
        "clip": {
            "id": clip.get("id"),
            "episode": clip.get("episode"),
            "current_start": clip.get("start"),
            "current_end": clip.get("end"),
            "duration": clip.get("duration"),
            "score": clip.get("score"),
            "features": clip.get("media_features_summary") or {},
            "traffic_material": clip.get("traffic_material") or {},
        },
        "intent": intent,
        "candidates": [
            {
                "key": item.get("key"),
                "title": item.get("title"),
                "start": item.get("start"),
                "end": item.get("end"),
                "duration": item.get("duration"),
                "reason": item.get("reason"),
                "features": item.get("features") or {},
            }
            for item in candidates
        ],
    }
    prompt = (
        "你是短剧投流切片审片专家。请只返回 JSON。"
        "任务：对候选时间线做复评排序，优先完整场景、不断句、不串入下一场，同时保留投流吸引力。"
        "不要改写时间码，只能评价和排序。返回格式："
        '{"summary":"一句中文结论","ranking":[{"key":"候选key","score":0-100,"reason":"中文理由","risks":["风险"]}]}'
        "\n输入：\n" + json.dumps(payload, ensure_ascii=False)
    )
    try:
        raw = call_chat_model(prompt)
        ranked, summary = parse_model_candidate_review(raw, candidates)
        provider_name = model.get("display_name") or model.get("provider") or "AI 大模型"
        return ranked, {
            "source": "live_model",
            "model": provider_name,
            "model_name": model.get("model_name") or "",
            "summary": summary or f"{provider_name} 已完成候选复评。",
            "error": "",
        }
    except Exception as exc:
        return candidates, {
            "source": "rule_fallback",
            "model": "规则算法",
            "summary": "大模型复评失败，已使用规则算法候选。",
            "error": str(exc),
        }



def clipping_job_cancel_requested(job_id):
    with CLIPPING_JOBS_LOCK:
        job = CLIPPING_JOBS.get(job_id) or {}
        return bool(job.get("cancel_requested"))


def clipping_quality_stats(clips, plan):
    durations = [float(clip.get("duration") or max(0, float(clip.get("end", 0)) - float(clip.get("start", 0)))) for clip in clips]
    by_episode = {}
    for clip in clips:
        episode = str(clip.get("episode", ""))
        raw_target = (plan or {}).get(episode, 0)
        if isinstance(raw_target, dict):
            raw_target = raw_target.get("requested") or raw_target.get("target") or raw_target.get("recommended") or raw_target.get("generated") or 0
        by_episode.setdefault(episode, {"actual": 0, "target": int(raw_target or 0), "avg_duration": 0, "min_duration": 0, "max_duration": 0})
        by_episode[episode]["actual"] += 1
    for episode, item in by_episode.items():
        episode_durations = [float(clip.get("duration") or 0) for clip in clips if str(clip.get("episode")) == episode]
        if episode_durations:
            item["avg_duration"] = round(sum(episode_durations) / len(episode_durations), 1)
            item["min_duration"] = round(min(episode_durations), 1)
            item["max_duration"] = round(max(episode_durations), 1)
        item["target_met"] = item["actual"] >= item["target"] if item["target"] else True
    return {
        "total_clips": len(clips),
        "avg_duration": round(sum(durations) / len(durations), 1) if durations else 0,
        "min_duration": round(min(durations), 1) if durations else 0,
        "max_duration": round(max(durations), 1) if durations else 0,
        "episodes": by_episode,
        "target_met_episodes": sum(1 for item in by_episode.values() if item.get("target_met")),
        "target_total_episodes": len(by_episode),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def cancel_clipping_job(job_id):
    with CLIPPING_JOBS_LOCK:
        job = CLIPPING_JOBS.get(job_id)
        if not job:
            raise FileNotFoundError("job not found")
        if job.get("status") in ("done", "error", "cancelled"):
            return dict(job)
        job["cancel_requested"] = True
        job["message"] = "已请求取消，正在等待当前安全节点停止"
        job["updated_at"] = time.time()
        return dict(job)


def finish_clipping_cancelled(job_id, progress=0):
    update_clipping_job(
        job_id,
        status="cancelled",
        progress=max(0, min(100, int(progress or 0))),
        message="切片任务已取消，未写入新的候选切片",
    )


def retry_clipping_job(job_id):
    old = get_clipping_job(job_id)
    if not old:
        raise FileNotFoundError("job not found")
    params = old.get("params") or {}
    return start_clipping_job(params.get("per_episode", 3), params.get("episode_counts"), params.get("episode_start"), params.get("episode_end"))


def update_clipping_job(job_id, **changes):
    with CLIPPING_JOBS_LOCK:
        job = CLIPPING_JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        job["updated_at"] = time.time()
        return dict(job)


def get_clipping_job(job_id):
    with CLIPPING_JOBS_LOCK:
        job = CLIPPING_JOBS.get(job_id)
        return dict(job) if job else None


def latest_clipping_job():
    with CLIPPING_JOBS_LOCK:
        jobs = list(CLIPPING_JOBS.values())
    if not jobs:
        return None
    jobs.sort(key=lambda job: float(job.get("updated_at") or job.get("created_at") or 0), reverse=True)
    return dict(jobs[0])


def clipping_job_running():
    job = latest_clipping_job()
    return bool(job and job.get("status") in ("pending", "running"))


def run_start_clipping_job(job_id, per_episode=3, episode_counts=None, episode_start=None, episode_end=None, append=False, episodes=None):
    try:
        update_clipping_job(job_id, status="running", progress=5, label="准备素材", phase="prepare", message="正在读取项目素材")
        state = load_review_state()
        assets = refresh_assets(state)
        assets = filter_assets_by_episode_selection(assets, episode_start, episode_end, episodes)
        update_clipping_job(job_id, progress=9, label="字幕检查", phase="subtitle_check", message="正在检查字幕状态")
        gate = clipping_subtitle_gate(state, episode_start, episode_end, episodes)
        subtitle_preparation = {"created": [], "skipped": [], "failed": []}
        if gate.get("missing_count") and gate.get("will_prepare"):
            update_clipping_job(job_id, progress=12, label="字幕识别", phase="subtitle_prepare", message="正在准备缺失字幕")
            subtitle_preparation = prepare_missing_subtitles_for_assets(assets, job_id)
            state["transcript_status"] = transcript_project_summary(state)
            safe_save_project_state(state)
            gate = clipping_subtitle_gate(state, episode_start, episode_end, episodes)
        if not gate.get("can_start") or gate.get("missing_count"):
            raise RuntimeError(gate.get("message") or "切片前必须先准备字幕。")
        total = len(assets)
        if not total:
            state["clips"] = []
            state["workflow_status"] = "smart_clips_generated"
            state["clip_count_plan"] = {"default_per_episode": int(per_episode or 3), "episode_counts": {}, "overrides": parse_clip_count_overrides(episode_counts), "episode_start": episode_start, "episode_end": episode_end}
            set_task(state, "start_clipping", "done", 100, "No assets found")
            warning = safe_save_project_state(state)
            message = "未发现可切片素材"
            if warning:
                message += "，项目状态已保存"
            update_clipping_job(job_id, status="done", progress=100, message=message, result=state, warning=warning)
            return
        overrides = parse_clip_count_overrides(episode_counts)
        existing_clips = state.get("clips") or []
        scoped_episodes = {int(asset.get("episode") or 0) for asset in assets}
        clips = list(existing_clips) if append else [clip for clip in existing_clips if int(clip.get("episode") or 0) not in scoped_episodes]
        plan = {}
        for index, asset in enumerate(assets, start=1):
            if clipping_job_cancel_requested(job_id):
                finish_clipping_cancelled(job_id, progress if 'progress' in locals() else 0)
                return
            ep = int(asset["episode"])
            target = clip_target_for_asset(asset, per_episode, overrides)
            if append:
                target = 1
            plan[str(ep)] = target
            existing_episode_clips = [clip for clip in clips if int(clip.get("episode") or 0) == ep]
            existing_episode_count = len(existing_episode_clips)
            progress = 8 + int((index - 1) / total * 86)
            episode_base = 12 + ((index - 1) / max(1, total)) * 78
            episode_span = 78 / max(1, total)

            def update_episode_phase(local_progress, label, message=None):
                mapped = int(min(94, episode_base + max(0, min(100, int(local_progress or 0))) / 100 * episode_span))
                update_clipping_job(
                    job_id,
                    progress=mapped,
                    label=label,
                    phase="episode_analysis",
                    phase_progress=max(0, min(100, int(local_progress or 0))),
                    message=message or f"第 {ep} 集：{label}",
                    current_episode=ep,
                    total_episodes=total,
                    current_index=index,
                )

            update_episode_phase(0, "准备分析", f"正在分析第 {ep} 集")
            try:
                if append:
                    candidate_target = max(existing_episode_count + target + 12, 18)
                    update_episode_phase(20, "扩展素材池", f"第 {ep} 集：正在查找可新增切片")
                    candidates = generate_material_pool_candidates_for_asset(asset, candidate_target)
                    update_episode_phase(88, "整理候选结果", f"第 {ep} 集：正在整理新增切片")
                else:
                    candidate_target = target
                    candidates = smart_scene_candidates_for_asset(asset, candidate_target, progress_callback=update_episode_phase)
            except Exception as exc:
                duration = 0.0
                try:
                    duration = ffprobe_duration(safe_path(asset["path"]))
                except Exception:
                    pass
                candidates = [
                    {"start": start, "end": end, "shot_count": 0, "score": 0.1, "audio_dynamic_range": 0, "audio_samples": 0, "audio_tension_score": 0, "voice_activity_ratio": 0, "quiet_ratio": 0, "pause_transition_rate": 0, "tension_peak": 0, "reason": f"fallback_after_error: {exc}"}
                    for start, end, _, _ in fallback_windows(duration, target, episode_duration_profile(ep))
                ]
            if clipping_job_cancel_requested(job_id):
                finish_clipping_cancelled(job_id, progress)
                return
            append_added = 0
            for idx, candidate in enumerate(candidates):
                if clipping_job_cancel_requested(job_id):
                    finish_clipping_cancelled(job_id, progress)
                    return
                if append and material_pool_candidate_exists(candidate, existing_episode_clips):
                    continue
                if not append and clip_candidate_redundant_with_existing(candidate, existing_episode_clips):
                    continue
                clip_index = existing_episode_count + append_added if append else idx
                note = "加量素材池候选：用于同一集多批次补切，导出前仍需确认。"
                engine = "v8.36.21 material_pool_append"
                if not append:
                    note = "Smart clipping candidate: subtitle timeline + hook variant + dialogue boundary protection; review before export."
                    engine = "v8.34.0 async_multi_source_picker"
                clip = clip_from_candidate(
                    asset,
                    ep,
                    clip_index,
                    candidate,
                    note=note,
                    engine=engine,
                )
                clips.append(clip)
                existing_episode_clips.append(clip)
                append_added += 1
                if append and append_added >= target:
                    break
            update_episode_phase(96, "保存结果", f"第 {ep} 集：正在保存候选")
            plan[str(ep)] = {
                "requested": target,
                "generated": append_added if append else len(candidates),
                "recommended": int(candidates[0].get("recommended_target", len(candidates))) if candidates else 0,
                "capacity_limited": bool(candidates and candidates[0].get("capacity_limited")),
                "append": bool(append),
            }
            update_clipping_job(job_id, progress=min(94, 12 + int(index / total * 78)), label="单集完成", phase="episode_done", message=f"第 {ep} 集分析完成", current_episode=ep, total_episodes=total, current_index=index)
            if clipping_job_cancel_requested(job_id):
                finish_clipping_cancelled(job_id, min(94, 8 + int(index / total * 86)))
                return
        if clipping_job_cancel_requested(job_id):
            finish_clipping_cancelled(job_id, progress if 'progress' in locals() else 0)
            return
        state["clips"] = clips
        state["workflow_status"] = "smart_clips_generated"
        state["clip_count_plan"] = {"default_per_episode": int(per_episode or 3), "episode_counts": plan, "overrides": {str(k): v for k, v in overrides.items()}}
        state["last_clipping_quality"] = clipping_quality_stats(clips, plan)
        state["last_subtitle_preparation"] = subtitle_preparation
        set_task(state, "start_clipping", "done", 100, f"Smart scene candidates generated: {len(clips)}; plan {plan}")
        warning = safe_save_project_state(state)
        done_message = f"已生成 {len(clips)} 条切片"
        if warning:
            done_message += "，项目状态已保存"
        update_clipping_job(job_id, status="done", progress=100, message=done_message, result=state, warning=warning)
    except Exception as exc:
        update_clipping_job(job_id, status="error", progress=100, message="切片没有完成，请重试。", error=str(exc))


def start_clipping_job(per_episode=3, episode_counts=None, episode_start=None, episode_end=None, append=False, episodes=None):
    job_id = uuid.uuid4().hex
    now = time.time()
    with CLIPPING_JOBS_LOCK:
        CLIPPING_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now, "cancel_requested": False, "params": {"per_episode": per_episode, "episode_counts": episode_counts, "episode_start": episode_start, "episode_end": episode_end, "append": append, "episodes": parse_episode_selection(episodes)}}
    thread = threading.Thread(target=run_start_clipping_job, args=(job_id, per_episode, episode_counts, episode_start, episode_end, append, episodes), daemon=True)
    thread.start()
    return get_clipping_job(job_id)


def update_media_precompute_job(job_id, **changes):
    with MEDIA_PRECOMPUTE_JOBS_LOCK:
        job = MEDIA_PRECOMPUTE_JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        job["updated_at"] = time.time()
        return dict(job)


def get_media_precompute_job(job_id):
    with MEDIA_PRECOMPUTE_JOBS_LOCK:
        job = MEDIA_PRECOMPUTE_JOBS.get(job_id)
        return dict(job) if job else None


def project_media_cache_summary(state):
    clips = state.get("clips", []) or []
    total = len(clips)
    cached = 0
    errors = []
    for clip in clips:
        try:
            cache_dir = media_cache_dir_for(clip)
            start = int(float(clip.get("start", 0)))
            end = int(float(clip.get("end", start + 1)))
            scene_cache = cache_dir / f"scene_{start}_{end}.json"
            audio_cache = cache_dir / f"audio_{start}_{end}.json"
            if scene_cache.exists() and audio_cache.exists():
                cached += 1
        except Exception as exc:
            errors.append({"clip_id": clip.get("id", ""), "error": str(exc)})
    return {
        "total": total,
        "cached": cached,
        "pending": max(0, total - cached),
        "errors": errors,
    }


def run_media_precompute_job(job_id, state_path):
    try:
        update_media_precompute_job(job_id, status="running", progress=5, message="Loading project clips")
        state = load_project(state_path=state_path) if state_path else load_review_state()
        clips = state.get("clips", []) or []
        total = len(clips)
        if not total:
            summary = {"total": 0, "cached": 0, "pending": 0, "errors": []}
            state["media_cache_status"] = summary
            persist_review_state(state)
            update_media_precompute_job(job_id, status="done", progress=100, message="No clips to pre-analyze", result={"summary": summary})
            return
        errors = []
        cached = 0
        for index, clip in enumerate(clips, start=1):
            clip_id = clip.get("id") or f"clip_{index}"
            progress = 5 + int((index - 1) / total * 90)
            update_media_precompute_job(job_id, progress=progress, message=f"Analyzing media features for {clip_id}")
            try:
                features = media_features_for_clip(clip)
                if features.get("available"):
                    cached += 1
                    clip["media_features_cached"] = True
                    clip["media_features_summary"] = {
                        "engine": features.get("engine"),
                        "scene_count": features.get("scene_count", 0),
                        "audio_dynamic_range": (features.get("audio") or {}).get("dynamic_range", 0),
                        "audio_samples": (features.get("audio") or {}).get("samples", 0),
                        "audio_tension_score": (features.get("audio") or {}).get("audio_tension_score", 0),
                        "voice_activity_ratio": (features.get("audio") or {}).get("voice_activity_ratio", 0),
                        "quiet_ratio": (features.get("audio") or {}).get("quiet_ratio", 0),
                        "pause_transition_rate": (features.get("audio") or {}).get("pause_transition_rate", 0),
                        "tension_peak": (features.get("audio") or {}).get("tension_peak", 0),
                    }
                else:
                    errors.append({"clip_id": clip_id, "error": features.get("error", "unavailable")})
            except Exception as exc:
                errors.append({"clip_id": clip_id, "error": str(exc)})
        summary = {
            "total": total,
            "cached": cached,
            "pending": max(0, total - cached),
            "errors": errors,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
        state["media_cache_status"] = summary
        persist_review_state(state)
        update_media_precompute_job(job_id, status="done", progress=100, message=f"Media pre-analysis ready: {cached}/{total}", result={"summary": summary, "state": state})
    except Exception as exc:
        update_media_precompute_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def start_media_precompute_job(state_path):
    job_id = uuid.uuid4().hex
    now = time.time()
    with MEDIA_PRECOMPUTE_JOBS_LOCK:
        MEDIA_PRECOMPUTE_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now}
    thread = threading.Thread(target=run_media_precompute_job, args=(job_id, state_path), daemon=True)
    thread.start()
    return get_media_precompute_job(job_id)


def update_preview_prepare_job(job_id, **changes):
    with PREVIEW_PREPARE_JOBS_LOCK:
        job = PREVIEW_PREPARE_JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        job["updated_at"] = time.time()
        return dict(job)


def get_preview_prepare_job(job_id):
    with PREVIEW_PREPARE_JOBS_LOCK:
        job = PREVIEW_PREPARE_JOBS.get(job_id)
        return dict(job) if job else None


def browser_preview_path_for_source(source, codec=""):
    source = Path(source).resolve()
    key = hashlib.md5(f"{source}:{source.stat().st_size}:{source.stat().st_mtime}:{codec or 'unknown'}:h264-preview-v2".encode("utf-8")).hexdigest()[:16]
    preview_dir = source.parent / ".browser_previews"
    try:
        preview_dir.mkdir(parents=True, exist_ok=True)
    except Exception:
        preview_dir = Path(tempfile.gettempdir()) / "short_drama_browser_previews" / hashlib.md5(str(source.parent.resolve()).encode("utf-8")).hexdigest()[:12]
        preview_dir.mkdir(parents=True, exist_ok=True)
    return preview_dir / f"{key}.mp4"


def preview_compatibility_summary(state, source_path=""):
    assets = refresh_assets(state)
    if source_path:
        requested = str(Path(source_path).resolve())
        assets = [asset for asset in assets if str(Path(asset.get("path") or "").resolve()) == requested]
    items = []
    ready = 0
    needs_proxy = 0
    errors = []
    for asset in assets:
        item = {"episode": asset.get("episode"), "filename": asset.get("filename") or "", "path": asset.get("path") or ""}
        try:
            source = safe_path(asset.get("path"))
            codec = ffprobe_video_codec(source)
            item["codec"] = codec or "unknown"
            item["direct"] = browser_direct_playable_codec(codec)
            if item["direct"]:
                item["ready"] = True
                ready += 1
            else:
                needs_proxy += 1
                preview = browser_preview_path_for_source(source, codec)
                item["preview"] = str(preview)
                item["ready"] = preview.exists() and preview.stat().st_size > 0
                if item["ready"]:
                    ready += 1
            items.append(item)
        except Exception as exc:
            item["error"] = str(exc)
            errors.append(item)
            items.append(item)
    return {"total": len(items), "ready": ready, "needs_proxy": needs_proxy, "pending": max(0, len(items) - ready), "errors": errors, "items": items}


def run_preview_prepare_job(job_id, state_path=""):
    try:
        state = load_project(state_path=state_path) if state_path else load_review_state()
        assets = refresh_assets(state)
        total = len(assets)
        update_preview_prepare_job(job_id, status="running", progress=3, message=f"正在检查 {total} 集视频兼容性")
        prepared = 0
        direct = 0
        failed = []
        for index, asset in enumerate(assets, start=1):
            progress = 3 + int((index - 1) / max(1, total) * 94)
            filename = asset.get("filename") or f"EP{asset.get('episode')}"
            update_preview_prepare_job(job_id, progress=progress, message=f"正在准备 {filename} 的预览")
            try:
                source = safe_path(asset.get("path"))
                codec = ffprobe_video_codec(source)
                if browser_direct_playable_codec(codec):
                    direct += 1
                    continue
                preview = browser_preview_video(source)
                if preview.exists() and preview.stat().st_size > 0:
                    prepared += 1
            except Exception as exc:
                failed.append({"episode": asset.get("episode"), "filename": filename, "error": str(exc)})
        summary = preview_compatibility_summary(state)
        summary.update({"prepared": prepared, "direct": direct, "failed": failed, "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
        state["preview_cache_status"] = summary
        persist_review_state(state, "preview_cache_prepared", "")
        status = "done" if not failed else "error"
        message = f"预览准备完成：直读 {direct} 集，代理 {prepared} 集"
        if failed:
            message += f"，失败 {len(failed)} 集"
        update_preview_prepare_job(job_id, status=status, progress=100, message=message, result={"summary": summary, "state": state}, error="; ".join(item["error"] for item in failed[:3]) if failed else "")
    except Exception as exc:
        update_preview_prepare_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def start_preview_prepare_job(state_path=""):
    state = load_project(state_path=state_path) if state_path else load_review_state()
    signature = hashlib.md5(json.dumps([[asset.get("episode"), asset.get("path"), asset.get("size")] for asset in refresh_assets(state)], ensure_ascii=False).encode("utf-8")).hexdigest()
    with PREVIEW_PREPARE_JOBS_LOCK:
        for job in PREVIEW_PREPARE_JOBS.values():
            if job.get("signature") == signature and job.get("status") in ("pending", "running"):
                return dict(job)
        job_id = uuid.uuid4().hex
        now = time.time()
        PREVIEW_PREPARE_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "预览准备排队中", "created_at": now, "updated_at": now, "signature": signature}
    thread = threading.Thread(target=run_preview_prepare_job, args=(job_id, state_path), daemon=True)
    thread.start()
    return get_preview_prepare_job(job_id)


def update_transcript_job(job_id, **changes):
    with TRANSCRIPT_JOBS_LOCK:
        job = TRANSCRIPT_JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        job["updated_at"] = time.time()
        return dict(job)


def get_transcript_job(job_id):
    with TRANSCRIPT_JOBS_LOCK:
        job = TRANSCRIPT_JOBS.get(job_id)
        return dict(job) if job else None


def transcript_engine_status():
    try:
        import importlib.util
        whisper_spec = importlib.util.find_spec("whisper")
        torch_spec = importlib.util.find_spec("torch")
        return {
            "available": bool(whisper_spec and torch_spec),
            "engine": "openai-whisper",
            "missing": [name for name, spec in (("whisper", whisper_spec), ("torch", torch_spec)) if not spec],
            "mode": "local_asr",
        }
    except Exception as exc:
        return {"available": False, "engine": "openai-whisper", "missing": ["whisper"], "error": str(exc), "mode": "local_asr"}


def transcript_setup_guide():
    engine = transcript_engine_status()
    cloud_test = test_asr_connection(timeout=4)
    provider = asr_current_provider()
    catalog = asr_provider_catalog()
    python_path = sys.executable
    pip_command = f'"{python_path}" -m pip install -r requirements.txt'
    local_ready = bool(engine.get("available"))
    cloud_configured = cloud_test.get("stage") != "api_key"
    if local_ready:
        status = "READY"
        headline = "本地 ASR 已可用，可以生成对白线索。"
        recommended = "直接点击“生成对白线索”。"
    else:
        status = "ACTION_REQUIRED"
        headline = f"本地 ASR 未配置：缺少 {', '.join(engine.get('missing') or ['whisper/torch'])}。"
        recommended = "普通用户建议优先使用云端 ASR；如果要本地识别，再按安装引导安装依赖。"
    return {
        "ok": True,
        "status": status,
        "headline": headline,
        "recommended": recommended,
        "local_asr": {
            "ready": local_ready,
            "engine": engine,
            "python": python_path,
            "install_command": pip_command,
            "notes": [
                "本地 ASR 可能下载较大的模型和 PyTorch 依赖。",
                "如果下载失败，可能需要检查网络、代理或梯子。",
                "安装完成后重启本工具，再点击生成对白线索。",
            ],
        },
        "cloud_asr": {
            "ready": bool(cloud_test.get("ok")),
            "status": "not_configured" if cloud_test.get("stage") == "api_key" else ("ready" if cloud_test.get("ok") else "check_failed"),
            "test": cloud_test,
            "provider": provider,
            "catalog": catalog,
            "notes": [
                "云端 ASR 更适合普通用户，但需要服务商 API key。",
                "中国大陆可优先评估火山引擎、科大讯飞、阿里云、腾讯云、百度智能云。",
                "除 OpenAI 外，当前版本只做配置检测，不会上传视频，避免伪接入和误扣费。",
                "如果接口访问失败，请检查 API 余额、代理、梯子是否掉线；国内服务商通常不需要梯子。",
            ],
        },
        "next_actions": [
            "如果只是测试流程：保持当前状态，系统会明确提示未配置。",
            "如果要真实识别：选择本地安装或云端 ASR，不建议两边都先做。",
            "配置后重新运行 /api/transcript/status 确认 ready。",
        ],
    }


def format_srt_timestamp(seconds):
    seconds = max(0.0, float(seconds or 0))
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    whole = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis >= 1000:
        whole += 1
        millis -= 1000
    return f"{hours:02d}:{minutes:02d}:{whole:02d},{millis:03d}"


def write_segments_to_srt(video_path, segments):
    target = writable_subtitle_path_for_video(video_path, ".srt")
    lines = []
    for index, segment in enumerate(segments, start=1):
        start = format_srt_timestamp(segment.get("start", 0))
        end = format_srt_timestamp(segment.get("end", 0))
        text = str(segment.get("text") or "").strip() or "[inaudible]"
        lines.extend([str(index), f"{start} --> {end}", text, ""])
    target.write_text("\n".join(lines), encoding="utf-8")
    return str(target.resolve())


def split_text_segment_to_sentence_segments(segment, min_duration=1.2):
    text = str(segment.get("text") or "").strip()
    start = float(segment.get("start", 0) or 0)
    end = float(segment.get("end", start) or start)
    if not text or end <= start:
        return []
    parts = [part.strip() for part in re.split(r"(?<=[。！？!?；;，,])", text) if part.strip()]
    if len(parts) <= 1:
        return [segment]
    total_chars = sum(max(1, len(part)) for part in parts)
    duration = end - start
    cursor = start
    output = []
    for index, part in enumerate(parts):
        if index == len(parts) - 1:
            part_end = end
        else:
            share = max(min_duration, duration * (max(1, len(part)) / total_chars))
            part_end = min(end, cursor + share)
        if part_end > cursor:
            output.append({"start": round(cursor, 3), "end": round(part_end, 3), "text": part})
        cursor = part_end
    return output


def refine_segments_to_sentences(segments):
    refined = []
    for segment in segments or []:
        refined.extend(split_text_segment_to_sentence_segments(segment))
    return refined or segments


def generate_transcript_for_video(video_path, model_name="small"):
    status = transcript_engine_status()
    if not status.get("available"):
        missing = ", ".join(status.get("missing") or ["whisper"])
        raise RuntimeError(f"本地 ASR 未配置：缺少 {missing}。请先安装依赖或在设置中启用可用转写引擎。")
    import whisper
    model = whisper.load_model(model_name or "small")
    result = model.transcribe(str(video_path), fp16=False, language="zh")
    segments = []
    for item in result.get("segments", []) or []:
        start = float(item.get("start", 0))
        end = float(item.get("end", start))
        text = str(item.get("text") or "").strip()
        if end > start and text:
            segments.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    if not segments:
        raise RuntimeError("ASR 完成但没有生成有效对白片段。")
    return write_segments_to_srt(video_path, segments), len(segments)


def xfyun_config(asr):
    app_id_env = asr.get("app_id_env") or "XFYUN_ASR_APP_ID"
    api_key_env = asr.get("api_key_env") or "XFYUN_ASR_API_KEY"
    secret_env = asr.get("secret_env") or "XFYUN_ASR_API_SECRET"
    app_id = os.environ.get(app_id_env, "")
    api_key = os.environ.get(api_key_env, "")
    api_secret = os.environ.get(secret_env, "")
    missing = [name for name, value in ((app_id_env, app_id), (api_key_env, api_key), (secret_env, api_secret)) if not value]
    if missing:
        raise RuntimeError("科大讯飞 ASR 配置缺失：" + ", ".join(missing))
    base_url = (asr.get("base_url") or "https://raasr.xfyun.cn/v2/api").rstrip("/")
    return {"app_id": app_id, "api_key": api_key, "api_secret": api_secret, "base_url": base_url}


def xfyun_sign_params(config):
    ts = str(int(time.time()))
    base = (config["app_id"] + ts).encode("utf-8")
    md5_value = hashlib.md5(base).hexdigest()
    digest = hmac.new(config["api_secret"].encode("utf-8"), md5_value.encode("utf-8"), hashlib.sha1).digest()
    signa = base64.b64encode(digest).decode("utf-8")
    return {"app_id": config["app_id"], "ts": ts, "signa": signa}


def xfyun_request(config, action, params=None, data=None, timeout=60, content_type=None):
    merged = {}
    merged.update(xfyun_sign_params(config))
    if params:
        merged.update(params)
    query = urllib.parse.urlencode(merged)
    url = f"{config['base_url']}/{action}?{query}"
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    proxy_url = (config.get("proxy_url") or "").strip()
    if proxy_url:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy_url, "https": proxy_url}))
    else:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", errors="replace")
        raise RuntimeError(f"科大讯飞 ASR 请求失败：{action}：HTTP {exc.code} {exc.reason} {body[:300]}。请检查接口地址、密钥、服务开通状态和余额。")
    except Exception as exc:
        raise RuntimeError(f"科大讯飞 ASR 请求失败：{action}：{exc}。请检查密钥、服务开通状态、余额和网络。")
    try:
        payload = json.loads(raw)
    except Exception as exc:
        raise RuntimeError(f"科大讯飞 ASR 返回无法解析：{action}：{raw[:200]}") from exc
    if "ok" in payload:
        if int(payload.get("ok") or 0) != 0:
            message = payload.get("failed") or payload.get("message") or payload.get("data") or raw[:300]
            raise RuntimeError(f"科大讯飞 ASR 返回错误：{action} err_no={payload.get('err_no')}，{message}")
    else:
        code = str(payload.get("code", ""))
        if code not in ("000000", "0"):
            message = payload.get("descInfo") or payload.get("message") or payload.get("data") or raw[:300]
            raise RuntimeError(f"科大讯飞 ASR 返回错误：{action} code={code}，{message}")
    return payload, proxy_url


def xfyun_task_id(payload):
    data = payload.get("data")
    if isinstance(data, str):
        try:
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                return parsed.get("task_id") or parsed.get("taskId") or parsed.get("id") or data
        except Exception:
            pass
        return data
    if isinstance(data, dict):
        return data.get("task_id") or data.get("taskId") or data.get("id")
    return payload.get("taskId") or payload.get("task_id")


def xfyun_prepare(config, video_path):
    file_size = Path(video_path).stat().st_size
    params = {
        "file_len": str(file_size),
        "file_name": Path(video_path).name,
        "duration": str(int(max(1, ffprobe_duration(video_path) or 1) * 1000)),
    }
    payload, proxy_url = xfyun_request(config, "prepare", params=params, timeout=30)
    task_id = xfyun_task_id(payload)
    if not task_id:
        raise RuntimeError("科大讯飞 ASR prepare 成功但没有返回 taskId。")
    return task_id, proxy_url


def xfyun_upload(config, task_id, video_path, chunk_size=10 * 1024 * 1024):
    file_path = Path(video_path)
    file_size = file_path.stat().st_size
    slice_count = max(1, math.ceil(file_size / chunk_size))
    with file_path.open("rb") as handle:
        for slice_id in range(slice_count):
            chunk = handle.read(chunk_size)
            params = {
                "task_id": task_id,
                "slice_id": str(slice_id),
            }
            xfyun_request(config, "upload", params=params, data=chunk, timeout=120, content_type="application/octet-stream")
    xfyun_request(config, "merge", params={"task_id": task_id}, timeout=30)
    return slice_count


def xfyun_poll_result(config, task_id, timeout_seconds=900):
    deadline = time.time() + timeout_seconds
    last_payload = None
    while time.time() < deadline:
        payload, _ = xfyun_request(config, "getProgress", params={"task_id": task_id}, timeout=30)
        last_payload = payload
        data = payload.get("data")
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {"raw": data}
        status = str((data or {}).get("status") or (data or {}).get("taskStatus") or payload.get("status") or "")
        if status in ("9", "4", "completed", "done", "success"):
            result_payload, _ = xfyun_request(config, "getResult", params={"task_id": task_id}, timeout=60)
            return result_payload
        if status in ("-1", "failed", "error"):
            raise RuntimeError(f"科大讯飞 ASR 任务失败：{payload}")
        time.sleep(5)
    raise RuntimeError(f"科大讯飞 ASR 等待超时，最后状态：{last_payload}")


def parse_xfyun_segments(result_payload, fallback_duration=0):
    data = result_payload.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = data
    candidates = []
    if isinstance(data, dict):
        candidates = data.get("lattice") or data.get("result") or data.get("segments") or []
    elif isinstance(data, list):
        candidates = data
    segments = []
    full_text_parts = []
    for item in candidates or []:
        if isinstance(item, str):
            try:
                item = json.loads(item)
            except Exception:
                continue
        json_1best = item.get("json_1best") if isinstance(item, dict) else None
        if isinstance(json_1best, str):
            try:
                best = json.loads(json_1best)
            except Exception:
                best = {}
        else:
            best = json_1best or item if isinstance(item, dict) else {}
        text_parts = []
        st = float(best.get("st") or item.get("begin") or item.get("start") or 0)
        ed = float(best.get("ed") or item.get("end") or item.get("end_time") or st)
        for ws in best.get("ws", []) if isinstance(best, dict) else []:
            for cw in ws.get("cw", []) or []:
                word = str(cw.get("w") or "").strip()
                if word:
                    text_parts.append(word)
        text = "".join(text_parts).strip() or str(item.get("onebest") or item.get("text") or "").strip()
        if text:
            full_text_parts.append(text)
        if ed > st and text:
            if ed > 1000:
                st /= 1000.0
                ed /= 1000.0
            segments.append({"start": round(st, 3), "end": round(ed, 3), "text": text})
    if not segments:
        text = "".join(full_text_parts).strip()
        if not text and isinstance(data, str):
            text = data.strip()
        if text:
            segments = [{"start": 0.0, "end": max(1.0, float(fallback_duration or 0)), "text": text}]
    return segments


def generate_xfyun_transcript_for_video(video_path, asr):
    if "office-api-ist-dx.iflyaisol.com" in (asr.get("base_url") or ""):
        return generate_xfyun_llm_transcript_for_video(video_path, asr)
    config = xfyun_config(asr)
    video_path = Path(video_path)
    task_id, proxy_url = xfyun_prepare(config, video_path)
    xfyun_upload(config, task_id, video_path)
    result_payload = xfyun_poll_result(config, task_id)
    segments = parse_xfyun_segments(result_payload, ffprobe_duration(video_path))
    if not segments:
        raise RuntimeError("科大讯飞 ASR 完成但没有返回有效对白片段。")
    return write_segments_to_srt(video_path, segments), len(segments), proxy_url


def xfyun_llm_common_params(config):
    return {
        "appId": config["app_id"],
        "accessKeyId": config["api_key"],
        "dateTime": datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%dT%H:%M:%S%z"),
        "signatureRandom": uuid.uuid4().hex,
    }


def xfyun_llm_signature(params, api_secret):
    signing = urllib.parse.urlencode(sorted(params.items()))
    digest = hmac.new(api_secret.encode("utf-8"), signing.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("utf-8")


def xfyun_llm_request(config, path, params=None, data=None, headers=None, timeout=120):
    merged = xfyun_llm_common_params(config)
    if params:
        merged.update(params)
    signature = xfyun_llm_signature(merged, config["api_secret"])
    query = urllib.parse.urlencode(merged)
    url = f"{config['base_url'].rstrip('/')}{path}?{query}"
    request_headers = {"signature": signature}
    if headers:
        request_headers.update(headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(url, data=data, headers=request_headers, method="POST")
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read(500).decode("utf-8", errors="replace")
        raise RuntimeError(f"科大讯飞大模型 ASR 请求失败：{path}：HTTP {exc.code} {exc.reason} {body[:300]}")
    except Exception as exc:
        raise RuntimeError(f"科大讯飞大模型 ASR 请求失败：{path}：{exc}。请检查网络、服务开通状态和余额。")
    try:
        payload = json.loads(raw)
    except Exception as exc:
        raise RuntimeError(f"科大讯飞大模型 ASR 返回无法解析：{path}：{raw[:300]}") from exc
    code = str(payload.get("code", ""))
    if code not in ("000000", "0", "200", ""):
        message = payload.get("descInfo") or payload.get("message") or payload.get("data") or raw[:300]
        raise RuntimeError(f"科大讯飞大模型 ASR 返回错误：{path} code={code}，{message}")
    return payload, ""


def xfyun_llm_upload(config, video_path):
    video_path = Path(video_path)
    file_bytes = video_path.read_bytes()
    duration_ms = str(int(max(1, ffprobe_duration(video_path) or 1) * 1000))
    params = {
        "fileName": video_path.name,
        "fileSize": str(len(file_bytes)),
        "duration": duration_ms,
        "language": "autodialect",
        "audioMode": "fileStream",
    }
    payload, proxy_url = xfyun_llm_request(
        config,
        "/v2/upload",
        params=params,
        data=file_bytes,
        headers={"Content-Type": "application/octet-stream"},
        timeout=180,
    )
    content = payload.get("content") or payload.get("data") or {}
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except Exception:
            content = {"raw": content}
    order_id = content.get("orderId") or content.get("order_id") or payload.get("orderId") or payload.get("order_id")
    if not order_id:
        raise RuntimeError(f"科大讯飞大模型 ASR 上传成功但没有返回 orderId：{payload}")
    return order_id, proxy_url


def xfyun_llm_poll_result(config, order_id, timeout_seconds=900):
    deadline = time.time() + timeout_seconds
    last_payload = None
    while time.time() < deadline:
        payload, _ = xfyun_llm_request(config, "/v2/getResult", params={"orderId": order_id}, timeout=60)
        last_payload = payload
        data = payload.get("content") or payload.get("data") or {}
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {"raw": data}
        status = str(data.get("status") or data.get("orderStatus") or payload.get("status") or "")
        status_record = TMP_DIR / f"xfyun_llm_status_{order_id}.json"
        status_record.parent.mkdir(parents=True, exist_ok=True)
        status_record.write_text(json.dumps({"order_id": order_id, "status": status, "payload": payload, "updated_at": time.time()}, ensure_ascii=False, indent=2), encoding="utf-8")
        if data.get("result") or data.get("segments") or data.get("transcript") or data.get("raw"):
            return payload
        if status.lower() in ("4", "9", "done", "completed", "success"):
            return payload
        if status.lower() in ("-1", "failed", "error"):
            raise RuntimeError(f"科大讯飞大模型 ASR 任务失败：{payload}")
        time.sleep(5)
    raise RuntimeError(f"科大讯飞大模型 ASR 等待超时，最后状态：{last_payload}")


def parse_xfyun_llm_segments(result_payload, fallback_duration=0):
    data = result_payload.get("content") or result_payload.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {"raw": data}
    result = data.get("result") if isinstance(data, dict) else data
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            result = {"text": result}
    segments = []
    candidates = []
    if isinstance(result, dict):
        candidates = result.get("segments") or result.get("sentences") or result.get("lattice") or []
    elif isinstance(result, list):
        candidates = result
    for item in candidates or []:
        if isinstance(item, str):
            try:
                item = json.loads(item)
            except Exception:
                item = {"text": item}
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or item.get("onebest") or item.get("sentence") or "").strip()
        start = item.get("start") or item.get("begin") or item.get("bg") or item.get("st") or 0
        end = item.get("end") or item.get("ed") or item.get("end_time") or start
        try:
            start = float(start)
            end = float(end)
        except Exception:
            continue
        if end > 1000:
            start /= 1000.0
            end /= 1000.0
        if end > start and text:
            segments.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    if not segments:
        text = ""
        if isinstance(result, dict):
            text = str(result.get("text") or result.get("transcript") or result.get("content") or "").strip()
        elif isinstance(result, str):
            text = result.strip()
        if not text and isinstance(data, dict):
            text = str(data.get("text") or data.get("transcript") or data.get("raw") or "").strip()
        if text:
            segments = [{"start": 0.0, "end": max(1.0, float(fallback_duration or 0)), "text": text}]
    return segments


def generate_xfyun_llm_transcript_for_video(video_path, asr):
    config = xfyun_config(asr)
    order_id, proxy_url = xfyun_llm_upload(config, video_path)
    task_record = TMP_DIR / f"xfyun_llm_{Path(video_path).stem}_{order_id}.json"
    task_record.parent.mkdir(parents=True, exist_ok=True)
    task_record.write_text(json.dumps({"order_id": order_id, "video": str(video_path), "created_at": time.time()}, ensure_ascii=False, indent=2), encoding="utf-8")
    result_payload = xfyun_llm_poll_result(config, order_id)
    segments = parse_xfyun_llm_segments(result_payload, ffprobe_duration(video_path))
    if not segments:
        raise RuntimeError(f"科大讯飞大模型 ASR 完成但没有返回有效对白片段：{result_payload}")
    return write_segments_to_srt(video_path, segments), len(segments), proxy_url


def tencent_config(asr):
    secret_id_env = asr.get("api_key_env") or "TENCENT_ASR_SECRET_ID"
    secret_key_env = asr.get("secret_env") or "TENCENT_ASR_SECRET_KEY"
    secret_id = os.environ.get(secret_id_env, "")
    secret_key = os.environ.get(secret_key_env, "")
    missing = [name for name, value in ((secret_id_env, secret_id), (secret_key_env, secret_key)) if not value]
    if missing:
        raise RuntimeError("腾讯云 ASR 配置缺失：" + ", ".join(missing))
    return {
        "secret_id": secret_id,
        "secret_key": secret_key,
        "endpoint": (asr.get("base_url") or "https://asr.tencentcloudapi.com").replace("https://", "").replace("http://", "").strip("/"),
        "region": asr.get("region") or "ap-guangzhou",
        "service": "asr",
        "version": "2019-06-14",
    }


def tencent_tc3_request(config, action, payload, timeout=60):
    algorithm = "TC3-HMAC-SHA256"
    timestamp = int(time.time())
    date = datetime.utcfromtimestamp(timestamp).strftime("%Y-%m-%d")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    hashed_payload = hashlib.sha256(body.encode("utf-8")).hexdigest()
    canonical_headers = f"content-type:application/json; charset=utf-8\nhost:{config['endpoint']}\nx-tc-action:{action.lower()}\n"
    signed_headers = "content-type;host;x-tc-action"
    canonical_request = "\n".join(["POST", "/", "", canonical_headers, signed_headers, hashed_payload])
    credential_scope = f"{date}/{config['service']}/tc3_request"
    hashed_request = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = "\n".join([algorithm, str(timestamp), credential_scope, hashed_request])

    def sign(key, message):
        return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()

    secret_date = sign(("TC3" + config["secret_key"]).encode("utf-8"), date)
    secret_service = sign(secret_date, config["service"])
    secret_signing = sign(secret_service, "tc3_request")
    signature = hmac.new(secret_signing, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
    authorization = f"{algorithm} Credential={config['secret_id']}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    headers = {
        "Authorization": authorization,
        "Content-Type": "application/json; charset=utf-8",
        "Host": config["endpoint"],
        "X-TC-Action": action,
        "X-TC-Timestamp": str(timestamp),
        "X-TC-Version": config["version"],
        "X-TC-Region": config["region"],
    }
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(f"https://{config['endpoint']}", data=body.encode("utf-8"), headers=headers, method="POST")
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        raw = exc.read(1000).decode("utf-8", errors="replace")
        raise RuntimeError(f"腾讯云 ASR 请求失败：{action} HTTP {exc.code} {exc.reason} {raw[:500]}")
    except Exception as exc:
        raise RuntimeError(f"腾讯云 ASR 请求失败：{action}：{exc}。请检查网络、密钥权限、服务开通和余额。")
    try:
        result = json.loads(raw)
    except Exception as exc:
        raise RuntimeError(f"腾讯云 ASR 返回无法解析：{raw[:500]}") from exc
    response = result.get("Response") or {}
    if "Error" in response:
        error = response["Error"]
        raise RuntimeError(f"腾讯云 ASR 返回错误：{error.get('Code')}，{error.get('Message')}")
    return response


def extract_audio_for_tencent(video_path, max_seconds=55, start_seconds=0):
    source = Path(video_path)
    safe_stem = re.sub(r"[^0-9A-Za-z._-]+", "_", source.stem).strip("._") or "audio"
    target_dir = Path(tempfile.gettempdir()) / "short_drama_asr_audio"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"tencent_asr_{safe_stem}_{int(start_seconds)}_{uuid.uuid4().hex}.wav"
    cmd = [
        str(FFMPEG),
        "-y",
        "-ss",
        str(max(0, start_seconds)),
        "-i",
        str(source),
        "-t",
        str(max_seconds),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-acodec",
        "pcm_s16le",
        str(target),
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0 or not target.exists() or target.stat().st_size <= 0:
        target.unlink(missing_ok=True)
        detail = (result.stderr or result.stdout or "音频提取失败").strip()[-800:]
        raise RuntimeError(f"字幕识别前的音频提取失败：{detail}")
    if target.stat().st_size > 5 * 1024 * 1024:
        raise RuntimeError(f"腾讯云同步识别音频超过 5MB：{target.stat().st_size / 1024 / 1024:.1f}MB，需要改用异步录音文件识别。")
    return target


def tencent_recognize_audio_file(config, audio_path):
    audio_path = Path(audio_path)
    audio_base64 = base64.b64encode(audio_path.read_bytes()).decode("ascii")
    response = tencent_tc3_request(config, "SentenceRecognition", {
        "ProjectId": 0,
        "SubServiceType": 2,
        "EngSerViceType": "16k_zh",
        "SourceType": 1,
        "VoiceFormat": "wav",
        "UsrAudioKey": uuid.uuid4().hex,
        "Data": audio_base64,
        "DataLen": audio_path.stat().st_size,
    }, timeout=90)
    return response


def generate_tencent_transcript_for_video(video_path, asr, chunk_seconds=45):
    config = tencent_config(asr)
    duration = float(ffprobe_duration(video_path) or 0)
    if duration <= 0:
        duration = 55.0
    chunk_seconds = max(15, min(55, int(chunk_seconds or 45)))
    segments = []
    failures = []
    start = 0.0
    while start < duration:
        length = min(chunk_seconds, duration - start)
        audio_path = extract_audio_for_tencent(video_path, max_seconds=length, start_seconds=start)
        try:
            response = tencent_recognize_audio_file(config, audio_path)
            text = str(response.get("Result") or "").strip()
            if text:
                segments.append({"start": round(start, 3), "end": round(start + length, 3), "text": text})
        except Exception as exc:
            failures.append({"start": round(start, 3), "end": round(start + length, 3), "error": str(exc)})
        finally:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
        start += chunk_seconds
    if not segments:
        raise RuntimeError(f"腾讯云 ASR 完成但没有返回有效文本。失败块：{failures[:5]}")
    segments = refine_segments_to_sentences(segments)
    return write_segments_to_srt(video_path, segments), len(segments), ""


def generate_cloud_transcript_for_video(video_path):
    settings = load_settings()
    asr = asr_current_provider(settings)
    if asr.get("provider") == "xfyun":
        return generate_xfyun_transcript_for_video(video_path, asr)
    if asr.get("provider") == "tencent":
        return generate_tencent_transcript_for_video(video_path, asr)
    if asr.get("provider") != "openai":
        raise RuntimeError(f"{asr.get('display_name') or asr.get('provider')} 目前只完成配置检测，尚未开放真实上传转写。")
    test = test_asr_connection(settings, timeout=8)
    if not test.get("ok"):
        raise RuntimeError(f"云端 ASR 不可用：{test.get('detail')}. {test.get('fix', '')}".strip())
    api_key_env = asr.get("api_key_env") or "OPENAI_API_KEY"
    api_key = os.environ.get(api_key_env, "")
    endpoint = asr_endpoint_url(settings)
    boundary = "----shortdramaasrboundary" + uuid.uuid4().hex
    video_path = Path(video_path)
    audio_bytes = video_path.read_bytes()
    fields = [
        (b"model", (asr.get("model_name") or "whisper-1").encode("utf-8")),
        (b"response_format", b"verbose_json"),
        (b"language", b"zh"),
    ]
    body = bytearray()
    for name, value in fields:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(b'Content-Disposition: form-data; name="' + name + b'"\r\n\r\n')
        body.extend(value + b"\r\n")
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(f'Content-Disposition: form-data; name="file"; filename="{video_path.name}"\r\n'.encode("utf-8"))
    body.extend(b"Content-Type: video/mp4\r\n\r\n")
    body.extend(audio_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    opener, proxy_url = urllib_opener_for_proxy_config(asr)
    request = urllib.request.Request(
        endpoint,
        data=bytes(body),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with opener.open(request, timeout=180) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:
        raise RuntimeError(f"云端 ASR 请求失败：{exc}。请检查 API 余额、网络、代理或梯子。")
    segments = []
    for item in payload.get("segments", []) or []:
        start = float(item.get("start", 0))
        end = float(item.get("end", start))
        text = str(item.get("text") or "").strip()
        if end > start and text:
            segments.append({"start": round(start, 3), "end": round(end, 3), "text": text})
    if not segments and payload.get("text"):
        segments = [{"start": 0.0, "end": max(1.0, ffprobe_duration(video_path)), "text": str(payload.get("text")).strip()}]
    if not segments:
        raise RuntimeError("云端 ASR 完成但没有返回有效对白片段。")
    return write_segments_to_srt(video_path, segments), len(segments), proxy_url


def recover_interrupted_transcript_queue(state):
    queue = state.get("transcript_queue") or {}
    items = queue.get("items") or []
    if queue.get("status") not in ("pending", "running") or not items:
        return queue
    active_job_id = queue.get("id") or ""
    with TRANSCRIPT_JOBS_LOCK:
        active_job = TRANSCRIPT_JOBS.get(active_job_id)
    if active_job and active_job.get("status") in ("pending", "running"):
        return queue
    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    changed = False
    for item in items:
        if item.get("status") in ("pending", "running"):
            item["status"] = "interrupted"
            item["message"] = "上次任务中断，可重试"
            item["error"] = item.get("error") or "工具重启或任务中断"
            item["updated_at"] = now_text
            changed = True
    if changed:
        queue["status"] = "interrupted"
        queue["message"] = "上次字幕队列中断，可重试未完成集数"
        queue["updated_at"] = now_text
        state["transcript_queue"] = queue
        persist_review_state(state, "transcript_queue_interrupted_recovered")
    return queue


def transcript_project_summary(state):
    recover_interrupted_transcript_queue(state)
    assets = effective_assets_for_state(state)
    total = len(assets)
    ready = 0
    missing = []
    for asset in assets:
        video = Path(asset.get("path") or "")
        if any(candidate.exists() for candidate in subtitle_candidates_for_video(video)):
            ready += 1
        else:
            missing.append({"filename": asset.get("filename") or video.name, "path": str(video)})
    return {"total": total, "ready": ready, "missing": missing[:40], "engine": transcript_engine_status(), "queue": state.get("transcript_queue") or {}}


def clipping_subtitle_gate(state=None, episode_start=None, episode_end=None, episodes=None):
    state = state or load_review_state()
    assets = refresh_assets(state)
    assets = filter_assets_by_episode_selection(assets, episode_start, episode_end, episodes)
    ready = []
    missing = []
    for asset in assets:
        video = Path(asset.get("path") or "")
        item = {"episode": asset.get("episode"), "filename": asset.get("filename") or video.name, "path": str(video)}
        subtitle_path, manual_imported = trusted_subtitle_for_asset(state, asset)
        if subtitle_path:
            item["subtitle"] = str(subtitle_path)
            item["manual_imported"] = manual_imported
            ready.append(item)
        else:
            missing.append(item)
    asr = asr_current_provider()
    cloud_missing = asr_missing_env_names(asr)
    local_engine = transcript_engine_status()
    cloud_ready = (not cloud_missing) and asr.get("provider") in ("openai", "xfyun", "tencent")
    local_ready = bool(local_engine.get("available"))
    will_prepare = bool(missing) and (cloud_ready or local_ready)
    can_start = bool(assets) and (not missing or will_prepare)
    if missing and will_prepare:
        message = f"还有 {len(missing)} 集需要识别字幕，开始切片后会先补齐。"
    elif can_start:
        message = "字幕已准备，可以开始切片。"
    elif cloud_ready or local_ready:
        message = "字幕将作为智能切片的前置步骤自动准备。"
    else:
        message = "字幕识别未配置，请先在设置中接入字幕识别。"
    return {
        "ok": True,
        "required": True,
        "can_start": can_start,
        "total": len(assets),
        "ready": len(ready),
        "ready_items": ready[:40],
        "missing_count": len(missing),
        "missing": missing[:40],
        "will_prepare": will_prepare,
        "cloud_asr": {
            "ready": cloud_ready,
            "provider": asr.get("provider"),
            "display_name": asr.get("display_name") or asr.get("provider") or "ASR",
            "missing_env": cloud_missing,
        },
        "local_asr": {
            "ready": local_ready,
            "engine": local_engine.get("engine"),
            "missing": local_engine.get("missing") or [],
        },
        "message": message,
    }


def video_has_subtitle(video_path):
    return any(candidate.exists() for candidate in subtitle_candidates_for_video(Path(video_path)))


def asset_has_trusted_subtitle(state, asset):
    subtitle_path, _ = trusted_subtitle_for_asset(state, asset)
    return bool(subtitle_path)


def prepare_missing_subtitles_for_assets(assets, job_id=None):
    settings = load_settings()
    asr = asr_current_provider(settings)
    cloud_missing = asr_missing_env_names(asr)
    cloud_ready = (not cloud_missing) and asr.get("provider") in ("openai", "xfyun", "tencent")
    local_ready = bool(transcript_engine_status().get("available"))
    if not cloud_ready and not local_ready:
        return {"created": [], "skipped": [], "failed": [], "ready": False}
    created = []
    skipped = []
    failed = []
    state = load_review_state()
    missing_assets = [asset for asset in assets if not asset_has_trusted_subtitle(state, asset)]
    total = len(missing_assets)
    for index, asset in enumerate(missing_assets, start=1):
        video_path = safe_path(asset.get("path"))
        label = asset.get("filename") or video_path.name
        if asset_has_trusted_subtitle(state, asset):
            skipped.append({"filename": label, "reason": "已有可信字幕"})
            continue
        if job_id:
            update_clipping_job(
                job_id,
                progress=min(38, 8 + int((index - 1) / max(1, total) * 30)),
                message=f"正在准备第 {asset.get('episode')} 集对白线索",
                current_episode=asset.get("episode"),
            )
        try:
            if cloud_ready:
                result = generate_cloud_transcript_for_video(video_path)
                subtitle_path, count = result[0], result[1]
                engine = asr.get("provider")
            else:
                subtitle_path, count = generate_transcript_for_video(video_path)
                engine = "local"
            created.append({"filename": label, "subtitle": subtitle_path, "segments": count, "engine": engine})
        except Exception as exc:
            failed.append({"filename": label, "error": str(exc)})
    return {"created": created, "skipped": skipped, "failed": failed, "ready": not failed}


def run_transcript_job(job_id, state_path, model_name="small"):
    try:
        update_transcript_job(job_id, status="running", progress=5, message="检查本地 ASR 引擎")
        engine = transcript_engine_status()
        if not engine.get("available"):
            update_transcript_job(job_id, status="error", progress=100, message="本地 ASR 未配置", error=f"缺少依赖：{', '.join(engine.get('missing') or [])}", result={"engine": engine})
            return
        state = load_project(state_path=state_path) if state_path else load_review_state()
        assets = effective_assets_for_state(state)
        total = len(assets)
        created = []
        skipped = []
        for index, asset in enumerate(assets, start=1):
            video_path = safe_path(asset.get("path"))
            if asset_has_trusted_subtitle(state, asset):
                skipped.append({"filename": asset.get("filename") or video_path.name, "reason": "已有可信字幕"})
                continue
            progress = 8 + int((index - 1) / max(1, total) * 87)
            update_transcript_job(job_id, progress=progress, message=f"生成对白线索：{asset.get('filename') or video_path.name}")
            subtitle_path, count = generate_transcript_for_video(video_path, model_name)
            created.append({"filename": asset.get("filename") or video_path.name, "subtitle": subtitle_path, "segments": count})
        state["transcript_status"] = transcript_project_summary(state)
        persist_review_state(state, "transcript_generated")
        update_transcript_job(job_id, status="done", progress=100, message=f"对白线索生成完成：{len(created)} 个字幕文件", result={"created": created, "skipped": skipped, "state": state, "summary": state["transcript_status"]})
    except Exception as exc:
        update_transcript_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def run_cloud_transcript_job(job_id, state_path, asset_path):
    try:
        update_transcript_job(job_id, status="running", progress=5, message="检查云端 ASR 配置")
        state = load_project(state_path=state_path) if state_path else load_review_state()
        if not asset_path:
            assets = effective_assets_for_state(state)
            if not assets:
                raise ValueError("没有可转写的素材")
            asset_path = assets[0].get("path")
        video_path = safe_path(asset_path)
        update_transcript_job(job_id, progress=20, message=f"准备上传单个素材：{video_path.name}")
        subtitle_path, count, proxy_url = generate_cloud_transcript_for_video(video_path)
        update_transcript_job(job_id, progress=90, message="刷新对白线索状态")
        state["transcript_status"] = transcript_project_summary(state)
        persist_review_state(state, "cloud_transcript_generated")
        update_transcript_job(job_id, status="done", progress=100, message=f"云端 ASR 完成：{video_path.name}", result={"subtitle": subtitle_path, "segments": count, "proxy_url": proxy_url, "state": state, "summary": state["transcript_status"]})
    except Exception as exc:
        update_transcript_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def start_transcript_job(state_path=None, model_name="small"):
    job_id = uuid.uuid4().hex
    now = time.time()
    with TRANSCRIPT_JOBS_LOCK:
        TRANSCRIPT_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now}
    thread = threading.Thread(target=run_transcript_job, args=(job_id, state_path, model_name), daemon=True)
    thread.start()
    return get_transcript_job(job_id)


def start_cloud_transcript_job(state_path=None, asset_path=""):
    job_id = uuid.uuid4().hex
    now = time.time()
    with TRANSCRIPT_JOBS_LOCK:
        TRANSCRIPT_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now, "scope": "single_asset_cloud_asr"}
    thread = threading.Thread(target=run_cloud_transcript_job, args=(job_id, state_path, asset_path), daemon=True)
    thread.start()
    return get_transcript_job(job_id)


def select_assets_for_transcript_queue(state, episode_start=None, episode_end=None, episodes=None, include_existing=False):
    assets = effective_assets_for_state(state)
    selected_episodes = set()
    for item in episodes or []:
        try:
            selected_episodes.add(int(item))
        except Exception:
            continue
    if episode_start is not None or episode_end is not None:
        start = int(episode_start or 1)
        end = int(episode_end or 999999)
        assets = [asset for asset in assets if start <= int(asset.get("episode") or 0) <= end]
    if selected_episodes:
        assets = [asset for asset in assets if int(asset.get("episode") or 0) in selected_episodes]
    result = []
    for asset in assets:
        has_subtitle = asset_has_trusted_subtitle(state, asset)
        if has_subtitle and not include_existing:
            continue
        result.append(asset)
    return result


def transcript_queue_preview(state, episode_start=None, episode_end=None, episodes=None, include_existing=False):
    assets = select_assets_for_transcript_queue(state, episode_start, episode_end, episodes, include_existing)
    total_size = sum(int(asset.get("size") or (Path(asset.get("path") or "").stat().st_size if Path(asset.get("path") or "").exists() else 0)) for asset in assets)
    return {
        "ok": True,
        "count": len(assets),
        "total_size": total_size,
        "total_size_label": f"{total_size / 1024 / 1024:.1f} MB",
        "assets": [{
            "episode": asset.get("episode"),
            "filename": asset.get("filename"),
            "path": asset.get("path"),
            "size": asset.get("size"),
            "has_subtitle": any(candidate.exists() for candidate in subtitle_candidates_for_video(Path(asset.get("path") or ""))),
        } for asset in assets[:80]],
        "note": "队列会逐集执行，失败会停止并保留已生成字幕；开始前请确认腾讯云免费额度/余额。",
    }


def transcript_queue_item(asset, status="pending", message="等待生成字幕"):
    video_path = Path(asset.get("path") or "")
    size = int(asset.get("size") or (video_path.stat().st_size if video_path.exists() else 0))
    return {
        "episode": asset.get("episode"),
        "filename": asset.get("filename") or video_path.name,
        "path": str(video_path),
        "size": size,
        "status": status,
        "message": message,
        "subtitle": "",
        "segments": 0,
        "error": "",
        "started_at": "",
        "finished_at": "",
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


def create_transcript_queue_state(job_id, assets, options=None):
    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return {
        "id": job_id,
        "status": "pending",
        "message": f"已创建多集字幕队列：{len(assets)} 集",
        "options": options or {},
        "items": [transcript_queue_item(asset) for asset in assets],
        "created_at": now_text,
        "updated_at": now_text,
    }


def reset_retry_transcript_queue_state(state, job_id, assets, options=None):
    queue = state.setdefault("transcript_queue", create_transcript_queue_state(job_id, [], options))
    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    retry_paths = {str(Path(asset.get("path") or "")) for asset in assets}
    existing_paths = {str(Path(item.get("path") or "")) for item in queue.get("items", [])}
    for asset in assets:
        asset_path = str(Path(asset.get("path") or ""))
        if asset_path not in existing_paths:
            queue.setdefault("items", []).append(transcript_queue_item(asset))
    for item in queue.get("items", []):
        item_path = str(Path(item.get("path") or ""))
        if item_path in retry_paths:
            item.update({
                "status": "pending",
                "message": "等待重试",
                "error": "",
                "started_at": "",
                "finished_at": "",
                "updated_at": now_text,
            })
    queue.update({
        "id": job_id,
        "status": "pending",
        "message": f"已创建失败重试队列：{len(assets)} 集",
        "options": options or {},
        "updated_at": now_text,
    })
    if not queue.get("created_at"):
        queue["created_at"] = now_text
    persist_review_state(state, "transcript_queue_retry_created")
    return queue


def update_transcript_queue_state(state, job_id, status=None, message="", item_path="", item_changes=None):
    queue = state.setdefault("transcript_queue", {
        "id": job_id,
        "status": "idle",
        "message": "",
        "items": [],
        "created_at": "",
        "updated_at": "",
    })
    if job_id:
        queue["id"] = job_id
    if status:
        queue["status"] = status
    if message:
        queue["message"] = message
    now_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    queue["updated_at"] = now_text
    if item_path and item_changes:
        target = str(Path(item_path))
        for item in queue.get("items", []):
            if str(Path(item.get("path") or "")) == target:
                item.update(item_changes)
                item["updated_at"] = now_text
                break
    persist_review_state(state, "transcript_queue_updated")
    return queue


def transcript_queue_status(state):
    recover_interrupted_transcript_queue(state)
    queue = state.get("transcript_queue") or {}
    if not queue:
        queue = {
            "id": "",
            "status": "idle",
            "message": "暂无多集字幕队列",
            "items": [],
            "created_at": "",
            "updated_at": "",
        }
    counts = {}
    for item in queue.get("items") or []:
        status = item.get("status") or "pending"
        counts[status] = counts.get(status, 0) + 1
    return {"ok": True, "queue": queue, "counts": counts}


def run_transcript_queue_job(job_id, state_path, options):
    try:
        update_transcript_job(job_id, status="running", progress=3, message="准备多集 ASR 队列")
        state = load_project(state_path=state_path) if state_path else load_review_state()
        assets = select_assets_for_transcript_queue(
            state,
            options.get("episode_start"),
            options.get("episode_end"),
            options.get("episodes"),
            options.get("include_existing", False),
        )
        if not assets:
            state["transcript_queue"] = create_transcript_queue_state(job_id, [], options)
            update_transcript_queue_state(state, job_id, "done", "没有需要生成字幕的集数")
            update_transcript_job(job_id, status="done", progress=100, message="没有需要生成字幕的集数", result={"created": [], "skipped": [], "state": state, "summary": transcript_project_summary(state), "queue": state.get("transcript_queue")})
            return
        if options.get("retry"):
            reset_retry_transcript_queue_state(state, job_id, assets, options)
        else:
            state["transcript_queue"] = create_transcript_queue_state(job_id, assets, options)
        update_transcript_queue_state(state, job_id, "running", "多集字幕队列执行中")
        created = []
        failed = []
        total = len(assets)
        for index, asset in enumerate(assets, start=1):
            video_path = safe_path(asset.get("path"))
            progress = 5 + int((index - 1) / max(1, total) * 90)
            update_transcript_job(job_id, progress=progress, message=f"生成 EP{asset.get('episode')} 字幕：{video_path.name}")
            update_transcript_queue_state(state, job_id, "running", f"正在生成 EP{asset.get('episode')} 字幕", str(video_path), {
                "status": "running",
                "message": "正在上传并识别",
                "started_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "error": "",
            })
            try:
                subtitle_path, count, proxy_url = generate_cloud_transcript_for_video(video_path)
                result_item = {"episode": asset.get("episode"), "filename": video_path.name, "subtitle": subtitle_path, "segments": count, "proxy_url": proxy_url}
                created.append(result_item)
                update_transcript_queue_state(state, job_id, "running", f"EP{asset.get('episode')} 字幕已完成", str(video_path), {
                    "status": "done",
                    "message": f"已生成 {count} 条对白",
                    "subtitle": subtitle_path,
                    "segments": count,
                    "finished_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "error": "",
                })
            except Exception as exc:
                failed_item = {"episode": asset.get("episode"), "filename": video_path.name, "error": str(exc)}
                failed.append(failed_item)
                update_transcript_queue_state(state, job_id, "failed", f"EP{asset.get('episode')} 字幕生成失败", str(video_path), {
                    "status": "failed",
                    "message": "生成失败，可稍后重试",
                    "error": str(exc),
                    "finished_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                })
                for pending_asset in assets[index:]:
                    pending_path = str(safe_path(pending_asset.get("path")))
                    update_transcript_queue_state(state, job_id, "failed", f"EP{asset.get('episode')} 字幕生成失败", pending_path, {
                        "status": "blocked",
                        "message": "前一集失败，尚未执行",
                        "error": "",
                        "finished_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    })
                update_transcript_job(job_id, status="error", progress=100, message=f"EP{asset.get('episode')} 字幕生成失败", error=str(exc), result={"created": created, "failed": failed, "state": state, "summary": transcript_project_summary(state), "queue": state.get("transcript_queue")})
                return
        state["transcript_status"] = transcript_project_summary(state)
        update_transcript_queue_state(state, job_id, "done", f"多集字幕生成完成：{len(created)} 集")
        persist_review_state(state, "cloud_transcript_queue_generated")
        update_transcript_job(job_id, status="done", progress=100, message=f"多集字幕生成完成：{len(created)} 集", result={"created": created, "failed": failed, "state": state, "summary": state["transcript_status"], "queue": state.get("transcript_queue")})
    except Exception as exc:
        update_transcript_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def start_transcript_queue_job(state_path=None, options=None):
    job_id = uuid.uuid4().hex
    now = time.time()
    with TRANSCRIPT_JOBS_LOCK:
        TRANSCRIPT_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now, "scope": "multi_episode_cloud_asr"}
    thread = threading.Thread(target=run_transcript_queue_job, args=(job_id, state_path, options or {}), daemon=True)
    thread.start()
    return get_transcript_job(job_id)


def retry_transcript_queue_failed(state_path=None, episode=None):
    state = load_project(state_path=state_path) if state_path else load_review_state()
    recover_interrupted_transcript_queue(state)
    queue = state.get("transcript_queue") or {}
    failed_items = [item for item in queue.get("items", []) if item.get("status") in ("failed", "interrupted", "pending")]
    if episode not in (None, ""):
        try:
            episode_number = int(episode)
            failed_items = [item for item in failed_items if int(item.get("episode") or 0) == episode_number]
        except Exception:
            failed_items = []
    if not failed_items:
        return {"ok": False, "message": "没有可重试的失败集数", "queue": transcript_queue_status(state).get("queue")}
    options = {"episodes": [item.get("episode") for item in failed_items], "include_existing": True, "retry": True}
    return start_transcript_queue_job(state_path, options)


def update_ai_job(job_id, **changes):
    with AI_JOBS_LOCK:
        job = AI_JOBS.get(job_id)
        if not job:
            return None
        job.update(changes)
        job["updated_at"] = time.time()
        return dict(job)


def get_ai_job(job_id):
    with AI_JOBS_LOCK:
        job = AI_JOBS.get(job_id)
        return dict(job) if job else None


def run_ai_reselect_job(job_id, state_path, clip_id, intent="complete"):
    try:
        update_ai_job(job_id, status="running", progress=15, message="Loading project state")
        state = load_project(state_path=state_path) if state_path else load_review_state()
        update_ai_job(job_id, progress=35, message="Analyzing visual scene cuts and audio dynamics")
        result = ai_reselect_clip(state, clip_id, intent=intent)
        update_ai_job(job_id, status="done", progress=100, message="AI candidates ready", result=result)
    except Exception as exc:
        update_ai_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


def start_ai_reselect_job(state_path, clip_id, intent="complete"):
    if not clip_id:
        raise ValueError("missing clip id")
    job_id = uuid.uuid4().hex
    now = time.time()
    with AI_JOBS_LOCK:
        AI_JOBS[job_id] = {"id": job_id, "status": "pending", "progress": 0, "message": "Queued", "created_at": now, "updated_at": now}
    thread = threading.Thread(target=run_ai_reselect_job, args=(job_id, state_path, clip_id, intent), daemon=True)
    thread.start()
    return get_ai_job(job_id)

def ai_reselect_clip(state, clip_id, candidate_id=None, intent="complete"):
    clip = find_clip(state, clip_id)
    source_clip = copy.deepcopy(clip)
    candidates = ai_candidate_pool_for_clip(source_clip, intent)
    candidates, model_review = model_review_ai_candidates(source_clip, candidates, intent)
    model_calls = 1 if model_review.get("source") == "live_model" else 0
    if candidate_id:
        selected = next((item for item in candidates if item.get("id") == candidate_id or item.get("key") == candidate_id), None)
        if selected is None:
            raise FileNotFoundError(f"candidate not found: {candidate_id}")
        clip["start"] = selected["start"]
        clip["end"] = selected["end"]
        clip["duration"] = selected["duration"]
        clip["status"] = "needs_edit"
        clip["review_status"] = "changes_requested"
        if clip.get("exported_at") or clip.get("export_path") or clip.get("export_batch_id"):
            clip["export_stale"] = True
            clip["exported_before_edit_at"] = clip.get("exported_at", "")
            clip["previous_export_path"] = clip.get("export_path", "")
            clip.pop("exported_at", None)
            clip.pop("export_path", None)
            clip.pop("export_batch_id", None)
        clip["ai_reselect_intent"] = intent
        clip["note"] = f"{model_review.get('model') or '规则算法'} applied {intent} candidate: {selected['title']}"
        append_task_record(state, "ai_candidate_applied", "done", selected.get("title", "candidate applied"), clip_id, {"model_calls": model_calls, "estimated_tokens": 0}, {"intent": intent, "model_review": model_review})
        persist_review_state(state, "ai_candidate_applied", clip_id)
        return {"ok": True, "model": model_review.get("model") or "规则算法", "model_review": model_review, "clip": clip, "selected": selected, "candidates": candidates}
    clip["ai_candidates"] = candidates
    clip["ai_reselect_intent"] = intent
    clip["ai_candidate_review"] = model_review
    append_task_record(state, "ai_candidates_generated", "done", f"{len(candidates)} candidates", clip_id, {"model_calls": model_calls, "estimated_tokens": 0}, {"intent": intent, "model_review": model_review})
    persist_review_state(state, "ai_candidates_generated", clip_id)
    return {"ok": True, "model": model_review.get("model") or "规则算法", "model_review": model_review, "clip": clip, "candidates": candidates}

def export_clip_video(src, start, duration, output):
    ffmpeg = str(FFMPEG if FFMPEG.exists() else "ffmpeg")
    timeout_seconds = max(45, min(180, int(duration * 3) + 30))
    attempts = [
        (
            "fast_stream_copy",
            [ffmpeg, "-hide_banner", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(src), "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-avoid_negative_ts", "make_zero", str(output)],
        ),
        (
            "fast_seek_h264_ultrafast",
            [ffmpeg, "-hide_banner", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(src), "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264", "-c:a", "aac", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-avoid_negative_ts", "make_zero", str(output)],
        ),
        (
            "accurate_seek_h264_ultrafast",
            [ffmpeg, "-hide_banner", "-y", "-i", str(src), "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "libx264", "-c:a", "aac", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-avoid_negative_ts", "make_zero", str(output)],
        ),
        (
            "fallback_mpeg4",
            [ffmpeg, "-hide_banner", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(src), "-map", "0:v:0?", "-map", "0:a:0?", "-c:v", "mpeg4", "-q:v", "5", "-c:a", "aac", "-pix_fmt", "yuv420p", "-avoid_negative_ts", "make_zero", str(output)],
        ),
    ]
    errors = []
    for mode, cmd in attempts:
        if output.exists():
            try:
                output.unlink()
            except OSError:
                pass
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            errors.append({"mode": mode, "timeout_seconds": timeout_seconds, "stderr": (exc.stderr or exc.stdout or "ffmpeg timeout")[-1200:]})
            continue
        if result.returncode == 0 and output.exists() and output.stat().st_size > 0:
            return {"mode": mode, "timeout_seconds": timeout_seconds}
        errors.append({
            "mode": mode,
            "returncode": result.returncode,
            "timeout_seconds": timeout_seconds,
            "stderr": (result.stderr or result.stdout or "").strip()[-1200:],
        })
    raise RuntimeError("导出失败：ffmpeg 所有策略均未成功 " + json.dumps(errors, ensure_ascii=False))


def export_confirmed(state, episode=None, only_ready=False, unexported_only=False, clip_id=""):
    batch_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = delivery_root_for(state, batch_id, episode)
    out_dir.mkdir(parents=True, exist_ok=True)
    record_dir = export_record_root_for(state, batch_id, episode)
    record_warning = ""
    try:
        record_dir.mkdir(parents=True, exist_ok=True)
    except Exception as exc:
        record_dir = None
        record_warning = f"内部记录未写入：{exc}"
    results = []
    failed = []
    skipped = []
    for clip in state.get("clips", []):
        if clip.get("status") != "confirmed":
            continue
        if clip_id and clip.get("id") != clip_id:
            continue
        if episode is not None and int(clip.get("episode", -1)) != int(episode):
            continue
        if only_ready and clip_delivery_risks(clip):
            skipped.append({"id": clip.get("id"), "episode": clip.get("episode"), "reason": "片段需要复核，未进入可交付导出"})
            continue
        if unexported_only and clip.get("exported_at"):
            skipped.append({"id": clip.get("id"), "episode": clip.get("episode"), "reason": "已导出，按本次设置跳过"})
            continue
        try:
            src = safe_path(clip["source_video"])
            start = float(clip["start"])
            end = float(clip["end"])
            duration = max(0.1, end - start)
            output = unique_child_path(out_dir, export_filename_for_clip(state, clip))
            export_meta = export_clip_video(src, start, duration, output)
            clip["exported_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            clip["export_path"] = str(output)
            clip["export_batch_id"] = batch_id
            clip["export_mode"] = export_meta.get("mode", "")
            clip.pop("export_error", None)
            clip.pop("export_failed_at", None)
            results.append({"id": clip["id"], "path": str(output), "duration": duration, "episode": clip.get("episode"), "batch_id": batch_id, "status": "success", "mode": export_meta.get("mode", "")})
        except Exception as exc:
            clip["export_error"] = str(exc)
            clip["export_failed_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            failed.append({"id": clip.get("id"), "episode": clip.get("episode"), "error": str(exc), "batch_id": batch_id})
    delivery = delivery_manifest(state)
    manifest = ""
    package_files = {}
    if record_dir:
        try:
            manifest_path = record_dir / "review_export_manifest.json"
            manifest_path.write_text(json.dumps({"batch_id": batch_id, "results": results, "failed": failed, "skipped": skipped, "delivery": delivery}, ensure_ascii=False, indent=2), encoding="utf-8")
            manifest = str(manifest_path)
            package_files = write_delivery_package(state, record_dir, batch_id, results, episode, only_ready, failed, skipped, unexported_only)
        except Exception as exc:
            record_warning = f"内部记录未写入：{exc}"
    status = "done" if not failed else ("partial" if results else "failed")
    state["last_export"] = {"batch_id": batch_id, "output_dir": str(out_dir), "record_dir": str(record_dir or ""), "record_warning": record_warning, "count": len(results), "success_count": len(results), "failed_count": len(failed), "skipped_count": len(skipped), "failed": failed, "skipped": skipped, "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "episode": episode, "clip_id": clip_id, "only_ready": bool(only_ready), "unexported_only": bool(unexported_only), "package_files": package_files}
    set_task(state, "export_clips", "done" if results else "error", 100, str(out_dir))
    append_task_record(state, "export", status, f"导出成功 {len(results)} 条，失败 {len(failed)} 条", "", {"model_calls": 0, "estimated_tokens": 0}, {"output_dir": str(out_dir), "record_dir": str(record_dir or ""), "record_warning": record_warning, "only_ready": bool(only_ready), "unexported_only": bool(unexported_only), "package_files": package_files, "failed": failed})
    save_project_state(state)
    return {"ok": not failed, "partial": bool(results and failed), "output_dir": str(out_dir), "record_dir": str(record_dir or ""), "record_warning": record_warning, "count": len(results), "success_count": len(results), "failed_count": len(failed), "skipped_count": len(skipped), "manifest": manifest, "package_files": package_files, "results": results, "failed": failed, "skipped": skipped, "delivery": delivery, "batch_id": batch_id}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if path == "/":
                return redirect_response(self, "/v8/")
            if path in ("/design-compare", "/design-compare/"):
                html = (ROOT / "web" / "design-compare.html").read_text(encoding="utf-8")
                return text_response(self, html, content_type="text/html; charset=utf-8")
            if path == "/review.html":
                html = (ROOT / "web" / "review.html").read_text(encoding="utf-8")
                return text_response(self, html, content_type="text/html; charset=utf-8")
            if path in ("/review.css", "/review.js", "/styles.css", "/v6.css", "/v6.js"):
                static_file = (ROOT / "web" / path.lstrip("/")).resolve()
                web_root = (ROOT / "web").resolve()
                if web_root not in static_file.parents and static_file != web_root:
                    return text_response(self, "Not found", 404)
                if not static_file.exists() or not static_file.is_file():
                    return text_response(self, "Not found", 404)
                content_type = mimetypes.guess_type(str(static_file))[0] or "application/octet-stream"
                if static_file.suffix.lower() == ".js":
                    content_type = "application/javascript; charset=utf-8"
                elif static_file.suffix.lower() == ".css":
                    content_type = "text/css; charset=utf-8"
                data = static_file.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if path in ("/v7", "/v7/"):
                html = (ROOT / "web" / "v7" / "index.html").read_text(encoding="utf-8")
                return text_response(self, html, content_type="text/html; charset=utf-8")
            if path in ("/design-prototype", "/design-prototype/"):
                return text_response(self, "Design prototype is hidden from the normal user entry.", 404)
            if path.startswith("/design-prototype/"):
                return text_response(self, "Design prototype is hidden from the normal user entry.", 404)
            for prefix, folder in (
                ("/v7-design-frozen/", "v7-design-frozen"),
                ("/v7-design/", "v7-design"),
                ("/v7-template/", "v7-template"),
                ("/v8/", "v8"),
            ):
                if path in (prefix.rstrip("/"), prefix):
                    html = (ROOT / "web" / folder / "index.html").read_text(encoding="utf-8")
                    return text_response(self, html, content_type="text/html; charset=utf-8")
                if path.startswith(prefix):
                    relative = path.removeprefix(prefix).strip("/")
                    static_root = (ROOT / "web" / folder).resolve()
                    file_path = (static_root / relative).resolve()
                    if static_root not in file_path.parents and file_path != static_root:
                        return text_response(self, "Not found", 404)
                    if not file_path.exists() or not file_path.is_file():
                        return text_response(self, "Not found", 404)
                    content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
                    if file_path.suffix.lower() == ".js":
                        content_type = "application/javascript; charset=utf-8"
                    elif file_path.suffix.lower() == ".css":
                        content_type = "text/css; charset=utf-8"
                    elif file_path.suffix.lower() == ".html":
                        content_type = "text/html; charset=utf-8"
                    data = file_path.read_bytes()
                    self.send_response(200)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Cache-Control", "no-store, max-age=0")
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                    return
            if path.startswith("/v7/"):
                relative = path.removeprefix("/v7/").strip("/")
                file_path = (ROOT / "web" / "v7" / relative).resolve()
                v7_root = (ROOT / "web" / "v7").resolve()
                if v7_root not in file_path.parents and file_path != v7_root:
                    return text_response(self, "Not found", 404)
                if not file_path.exists() or not file_path.is_file():
                    return text_response(self, "Not found", 404)
                content_type = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
                if file_path.suffix.lower() == ".js":
                    content_type = "application/javascript; charset=utf-8"
                elif file_path.suffix.lower() == ".css":
                    content_type = "text/css; charset=utf-8"
                elif file_path.suffix.lower() == ".html":
                    content_type = "text/html; charset=utf-8"
                data = file_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            if path == "/favicon.ico":
                self.send_response(204)
                self.end_headers()
                return
            if path == "/review.js":
                return text_response(self, "Legacy review asset is hidden from the normal user entry.", 404)
            if path == "/review.css":
                return text_response(self, "Legacy review asset is hidden from the normal user entry.", 404)
            if path == "/v6.js":
                return text_response(self, "Legacy v6 asset is hidden from the normal user entry.", 404)
            if path == "/v6.css":
                return text_response(self, "Legacy v6 asset is hidden from the normal user entry.", 404)
            if path == "/api/state":
                return json_response(self, load_review_state())
            if path == "/api/projects":
                if query.get("light", [""])[0] in ("1", "true", "yes"):
                    return json_response(self, list_review_projects_light())
                return json_response(self, list_review_projects())
            if path == "/api/projects/deleted":
                return json_response(self, list_deleted_projects())
            if path == "/api/portfolio/analytics":
                return json_response(self, portfolio_analytics())
            if path == "/api/delivery/planner":
                target = query.get("target", ["30"])[0]
                only_ready = query.get("only_ready", ["false"])[0].lower() in ("1", "true", "yes")
                return json_response(self, delivery_planner(target, only_ready))
            if path == "/api/delivery/task":
                target = query.get("target", ["30"])[0]
                return json_response(self, delivery_task_summary(load_review_state(), target))
            if path == "/api/review/queue":
                mode = query.get("mode", ["review"])[0]
                limit = query.get("limit", ["50"])[0]
                return json_response(self, review_queue(load_review_state(), mode, limit))
            if path == "/api/clip/readiness":
                state = load_review_state()
                clip = find_clip(state, query.get("id", [""])[0])
                return json_response(self, {"ok": True, "id": clip.get("id"), "readiness": clip_ready_explanation(clip)})
            if path == "/api/clip/quality-gate":
                state = load_review_state()
                return json_response(self, clip_quality_gate(state, query.get("id", [""])[0]))
            if path == "/api/clip/boundary-points":
                state = load_review_state()
                return json_response(self, clip_boundary_points(state, query.get("id", [""])[0]))
            if path == "/api/delivery/check":
                target = query.get("target", ["30"])[0]
                return json_response(self, delivery_check(load_review_state(), target))
            if path == "/api/export/preview":
                target = query.get("target", ["30"])[0]
                only_ready = query.get("only_ready", ["false"])[0].lower() in ("1", "true", "yes")
                unexported_only = query.get("unexported_only", ["false"])[0].lower() in ("1", "true", "yes")
                return json_response(self, export_preview(load_review_state(), target, query.get("episode", [None])[0], only_ready, unexported_only, query.get("clip_id", [""])[0]))
            if path == "/api/delivery/episodes":
                return json_response(self, episode_acceptance_dashboard(load_review_state()))
            if path == "/api/product/self-review":
                target = query.get("target", ["30"])[0]
                return json_response(self, product_self_review(load_review_state(), target))
            if path == "/api/product/acceptance-audit":
                target = query.get("target", ["30"])[0]
                return json_response(self, product_acceptance_audit(load_review_state(), target))
            if path == "/api/product/ai-review":
                target = query.get("target", ["30"])[0]
                return json_response(self, product_ai_review(load_review_state(), target))
            if path == "/api/project/templates":
                return json_response(self, project_templates_payload())
            if path == "/api/tasks":
                state = load_review_state()
                return json_response(self, {"workflow_status": state.get("workflow_status", ""), "tasks": infer_tasks(state)})
            if path == "/api/version":
                return json_response(self, load_version())
            if path == "/api/settings":
                return json_response(self, load_settings())
            if path == "/api/settings/env-status":
                return json_response(self, env_status_payload())
            if path in ("/api/transcript/providers", "/api/asr/providers"):
                return json_response(self, asr_provider_catalog())
            if path == "/api/diagnostics":
                return json_response(self, diagnostic_report())
            if path == "/api/transcript/status":
                return json_response(self, transcript_project_summary(load_review_state()))
            if path == "/api/transcript/queue-status":
                return json_response(self, transcript_queue_status(load_review_state()))
            if path == "/api/transcript/setup-guide":
                return json_response(self, transcript_setup_guide())
            if path == "/api/transcript/cloud-test":
                return json_response(self, test_asr_connection())
            if path == "/api/project/start-clipping/subtitle-gate":
                return json_response(self, clipping_subtitle_gate(
                    load_review_state(),
                    query.get("episode_start", [None])[0],
                    query.get("episode_end", [None])[0],
                    query.get("episodes", [None])[0],
                ))
            if path in ("/api/project/start-clipping/estimate", "/api/project/clipping-estimate"):
                return json_response(self, estimate_clipping_plan(
                    load_review_state(),
                    query.get("per_episode", ["3"])[0],
                    None,
                    query.get("episode_start", [None])[0],
                    query.get("episode_end", [None])[0],
                    query.get("episodes", [None])[0],
                ))
            if path == "/api/transcript/cloud-preview":
                return json_response(self, cloud_transcript_preview(query.get("asset_path", [""])[0]))
            if path == "/api/transcript/queue-preview":
                state = load_review_state()
                episodes = [item for raw in query.get("episodes", []) for item in str(raw).split(",") if item.strip()]
                return json_response(self, transcript_queue_preview(
                    state,
                    query.get("episode_start", [None])[0],
                    query.get("episode_end", [None])[0],
                    episodes,
                    query.get("include_existing", ["false"])[0].lower() in ("1", "true", "yes"),
                ))
            if path == "/api/diagnostics/proxy-autodetect":
                save = query.get("save", ["false"])[0].lower() in ("1", "true", "yes")
                return json_response(self, autodetect_model_proxy(save))
            if path == "/api/diagnostics/export":
                return json_response(self, export_diagnostics_bundle())
            if path == "/api/history":
                return json_response(self, {"history": list_history_snapshots(load_review_state())})
            if path == "/api/delivery/manifest":
                return json_response(self, delivery_manifest(load_review_state()))
            if path == "/api/analytics/summary":
                return json_response(self, analytics_summary(load_review_state()))
            if path == "/api/learning/summary":
                return json_response(self, learning_summary(load_review_state()))
            if path == "/api/feedback/summary":
                return json_response(self, feedback_summary(load_review_state()))
            if path == "/api/review/summary":
                return json_response(self, review_summary(load_review_state()))
            if path == "/api/task-records":
                state = load_review_state()
                return json_response(self, task_record_summary(state))
            if path == "/api/ai-reselect/task":
                job_id = query.get("id", [""])[0]
                job = get_ai_job(job_id)
                return json_response(self, job or {"error": "job not found"}, 404 if not job else 200)
            if path == "/api/media/precompute/task":
                job_id = query.get("id", [""])[0]
                job = get_media_precompute_job(job_id)
                return json_response(self, job or {"error": "job not found"}, 404 if not job else 200)
            if path == "/api/preview-cache/status":
                state = load_review_state()
                return json_response(self, preview_compatibility_summary(state, query.get("path", [""])[0]))
            if path == "/api/preview-cache/task":
                job_id = query.get("id", [""])[0]
                job = get_preview_prepare_job(job_id)
                return json_response(self, job or {"error": "job not found"}, 404 if not job else 200)
            if path == "/api/transcript/task":
                job_id = query.get("id", [""])[0]
                job = get_transcript_job(job_id)
                return json_response(self, job or {"error": "job not found"}, 404 if not job else 200)
            if path == "/api/project/start-clipping/task":
                job_id = query.get("id", [""])[0]
                job = latest_clipping_job() if job_id == "latest" else get_clipping_job(job_id)
                return json_response(self, job or {"error": "job not found"}, 404 if not job else 200)
            if path == "/preview-video":
                src = query.get("path", [""])[0]
                file_path = browser_preview_video(src)
                send_file_response(self, file_path, mimetypes.guess_type(str(file_path))[0] or "video/mp4")
                return
            if path == "/video":
                src = query.get("path", [""])[0]
                file_path = safe_path(src)
                send_file_response(self, file_path, mimetypes.guess_type(str(file_path))[0] or "video/mp4")
                return
            return text_response(self, "Not found", 404)
        except Exception as exc:
            if is_client_disconnect(exc):
                return
            return json_response(self, {"error": str(exc)}, 500)

    def do_POST(self):
        try:
            if self.path == "/api/dev/shutdown":
                if self.client_address[0] not in ("127.0.0.1", "::1"):
                    return json_response(self, {"ok": False, "error": "local only"}, 403)
                server = self.server
                threading.Thread(target=server.shutdown, daemon=True).start()
                return json_response(self, {"ok": True, "message": "server shutting down"})
            if self.path == "/api/assets/upload":
                form = parse_multipart_form(self)
                state = load_review_state()
                originals = writable_upload_dir_for_state(state, state.get("source_root") or (Path(state.get("base_dir") or ROOT) / ASSETS_DIR))
                uploaded = []
                files = form["files"] if "files" in form else []
                if not isinstance(files, list):
                    files = [files]
                for item in files:
                    if not getattr(item, "filename", ""):
                        continue
                    filename = Path(item.filename).name
                    target = unique_child_path(originals, filename)
                    with open(target, "wb") as output:
                        shutil.copyfileobj(item.file, output)
                    uploaded.append({"filename": target.name, "original_filename": filename, "path": str(target.resolve()), "size": target.stat().st_size})
                existing_paths = {str(Path(asset.get("path", "")).resolve()) for asset in state.get("assets", []) if asset.get("path")}
                next_episode = max([int(asset.get("episode") or 0) for asset in state.get("assets", [])] + [0]) + 1
                for item in uploaded:
                    if item["path"] in existing_paths:
                        continue
                    state.setdefault("assets", []).append({
                        "episode": next_episode,
                        "path": item["path"],
                        "filename": item["filename"],
                        "size": item["size"],
                    })
                    next_episode += 1
                state["workflow_status"] = "assets_imported"
                set_task(state, "import_assets", "done", 100, f"\u5df2\u5bfc\u5165 {len(uploaded)} \u4e2a\u7d20\u6750")
                warning = safe_save_project_state(state)
                if warning:
                    state["_save_warning"] = warning
                return json_response(self, {"ok": True, "uploaded": uploaded, "state": state})
            if self.path == "/api/subtitles/import":
                form = parse_multipart_form(self)
                state = load_review_state()
                files = form["file"] if "file" in form else None
                if isinstance(files, list):
                    files = files[0] if files else None
                asset_path = form.getfirst("asset_path", "")
                return json_response(self, import_subtitle_for_asset(state, asset_path, files))
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/api/state":
                history_action = payload.pop("_history_action", "manual_save")
                history_clip_id = payload.pop("_history_clip_id", "")
                persist_review_state(payload, history_action, history_clip_id)
                return json_response(self, {"ok": True, "history": payload.get("last_history_snapshot")})
            if self.path == "/api/project/new":
                return json_response(self, create_empty_project(payload.get("project_name", ""), payload.get("drama_name", ""), payload.get("episode_scope", ""), payload.get("template_id", "custom")))
            if self.path == "/api/settings":
                return json_response(self, save_settings(payload))
            if self.path == "/api/settings/env":
                return json_response(self, save_env_settings(payload))
            if self.path == "/api/transcript/provider":
                return json_response(self, apply_asr_provider(payload.get("provider", "")))
            if self.path == "/api/project/load":
                return json_response(self, load_project(payload.get("base_dir"), payload.get("state_path")))
            if self.path == "/api/project/rename":
                return json_response(self, rename_project(payload.get("project_name", "")))
            if self.path == "/api/project/delete":
                return json_response(self, delete_project(payload.get("base_dir"), payload.get("state_path")))
            if self.path == "/api/project/restore":
                return json_response(self, restore_deleted_project(payload.get("trash_path")))
            if self.path == "/api/project/purge":
                return json_response(self, purge_deleted_project(payload.get("trash_path")))
            if self.path == "/api/project/output-dir":
                return json_response(self, update_project_output_dir(payload.get("output_dir", "")))
            if self.path == "/api/project/choose-output-dir":
                raise RuntimeError("请选择桌面版中的原生导出目录窗口。")
            if self.path == "/api/project/open-output-dir":
                return json_response(self, open_project_output_dir(bool(payload.get("dry_run"))))
            if self.path == "/api/assets/delete":
                state = load_review_state()
                return json_response(self, delete_asset_from_project(state, payload.get("path", "")))
            if self.path == "/api/assets/restore":
                state = load_review_state()
                return json_response(self, restore_deleted_asset_to_project(state, payload.get("trash_path", ""), payload.get("original_path", "")))
            if self.path == "/api/history/undo":
                state = load_review_state()
                return json_response(self, restore_history_snapshot(state, payload.get("id")))
            if self.path == "/api/project/create":
                return json_response(self, create_project_from_source(payload.get("source_root"), payload.get("project_name"), payload.get("max_episodes", 10)))
            if self.path == "/api/project/ingest":
                return json_response(self, copy_project_assets(load_review_state()))
            if self.path == "/api/project/import-reference":
                return json_response(self, import_current_project_reference())
            if self.path == "/api/project/start-clipping/start":
                return json_response(self, start_clipping_job(payload.get("per_episode", 3), payload.get("episode_counts"), payload.get("episode_start"), payload.get("episode_end"), bool(payload.get("append")), payload.get("episodes")))
            if self.path == "/api/project/start-clipping/cancel":
                return json_response(self, cancel_clipping_job(payload.get("id")))
            if self.path == "/api/project/start-clipping/retry":
                return json_response(self, retry_clipping_job(payload.get("id")))
            if self.path == "/api/project/start-clipping":
                state = load_review_state()
                return json_response(self, generate_placeholder_clips(state, payload.get("per_episode", 3), payload.get("episode_counts"), payload.get("episode_start"), payload.get("episode_end"), payload.get("episodes")))
            if self.path == "/api/feedback":
                state = load_review_state()
                return json_response(self, add_clip_feedback(state, payload.get("id"), payload.get("reason", "other"), payload.get("note", "")))
            if self.path == "/api/queue/action":
                state = load_review_state()
                return json_response(self, apply_queue_action(state, payload.get("id"), payload.get("action", "modify"), payload.get("note", "")))
            if self.path == "/api/review":
                state = load_review_state()
                return json_response(self, update_clip_review(state, payload.get("id"), payload.get("review_status", "pending"), payload.get("note", ""), payload.get("reviewer", "Operator"), payload.get("comment", ""), payload.get("start", None), payload.get("end", None)))
            if self.path == "/api/clips/delete":
                state = load_review_state()
                return json_response(self, delete_clip_from_project(state, payload.get("id", "")))
            if self.path == "/api/review/report":
                state = load_review_state()
                return json_response(self, write_review_report(state))
            if self.path == "/api/learning/apply":
                state = load_review_state()
                return json_response(self, save_learning_profile(state, payload.get("rule_ids"), payload.get("note", "")))
            if self.path == "/api/export":
                state = load_review_state()
                return json_response(self, export_confirmed(state, payload.get("episode"), payload.get("only_ready", False), payload.get("unexported_only", False), payload.get("clip_id", "")))
            if self.path == "/api/ai-reselect/start":
                return json_response(self, start_ai_reselect_job(payload.get("state_path"), payload.get("id"), payload.get("intent", "complete")))
            if self.path == "/api/media/precompute/start":
                return json_response(self, start_media_precompute_job(payload.get("state_path")))
            if self.path == "/api/preview-cache/start":
                return json_response(self, start_preview_prepare_job(payload.get("state_path", "")))
            if self.path == "/api/transcript/start":
                return json_response(self, start_transcript_job(payload.get("state_path"), payload.get("model_name", "small")))
            if self.path == "/api/transcript/cloud-start":
                return json_response(self, start_cloud_transcript_job(payload.get("state_path"), payload.get("asset_path", "")))
            if self.path == "/api/transcript/queue-start":
                return json_response(self, start_transcript_queue_job(payload.get("state_path"), payload))
            if self.path == "/api/transcript/queue-retry":
                return json_response(self, retry_transcript_queue_failed(payload.get("state_path"), payload.get("episode")))
            if self.path == "/api/ai-reselect":
                state = load_project(state_path=payload.get("state_path")) if payload.get("state_path") else load_review_state()
                return json_response(self, ai_reselect_clip(state, payload.get("id"), payload.get("candidate_id"), payload.get("intent", "complete")))
            return text_response(self, "Not found", 404)
        except Exception as exc:
            return json_response(self, {"error": str(exc)}, 500)


def main():
    parser = argparse.ArgumentParser(description="短剧切片非破坏式审片台")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    if args.reset and STATE_PATH.exists():
        STATE_PATH.unlink()
    load_review_state()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    version = load_version().get("version", DEFAULT_APP_VERSION)
    print(f"审片台 v{version} 已启动: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()

\n