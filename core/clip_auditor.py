"""Clip quality auditor for short-drama exports.

The cutter is good at finding energetic regions, but clip usability depends on
whether the beginning and ending feel complete. This auditor inspects each
candidate with local ASR, boundary timing, screenshots, and an optional
OpenAI-compatible model review.
"""

import base64
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2

import config
from core.transcriber import transcribe


def audit_clips(
    video_path: str,
    result_path: str,
    output_dir: Optional[str] = None,
    context_seconds: float = 10.0,
    clip_indexes: Optional[List[int]] = None,
    use_llm: bool = True,
) -> Dict[str, Any]:
    video_path = os.path.abspath(video_path)
    result_path = os.path.abspath(result_path)
    with open(result_path, "r", encoding="utf-8") as f:
        result_data = json.load(f)

    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(result_path), "audit")
    os.makedirs(output_dir, exist_ok=True)
    frame_dir = os.path.join(output_dir, "frames")
    os.makedirs(frame_dir, exist_ok=True)

    recommendations = result_data.get("recommendations", [])
    selected = []
    for clip in recommendations:
        if clip_indexes is None or int(clip.get("clip_index", -1)) in clip_indexes:
            selected.append(clip)

    audits = []
    for clip in selected:
        audits.append(_audit_one_clip(video_path, clip, frame_dir, context_seconds, use_llm))

    summary = {
        "video": video_path,
        "result": result_path,
        "context_seconds": context_seconds,
        "clip_count": len(audits),
        "audits": audits,
    }
    out_path = os.path.join(output_dir, f"{Path(result_path).stem}_audit.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    summary["audit_path"] = out_path
    return summary


def _audit_one_clip(video_path: str, clip: Dict[str, Any], frame_dir: str, context_seconds: float, use_llm: bool) -> Dict[str, Any]:
    start = float(clip["start_time"])
    end = float(clip["end_time"])
    video_duration = _video_duration(video_path)
    context_start = max(0.0, start - context_seconds)
    context_end = min(video_duration, end + context_seconds)
    context_audio = _extract_context_audio(video_path, context_start, context_end)

    try:
        transcript = transcribe(context_audio)
    finally:
        if os.path.exists(context_audio):
            os.remove(context_audio)

    absolute_segments = _absolute_segments(transcript.get("segments", []), context_start)
    local_review = _local_boundary_review(start, end, absolute_segments, video_duration, clip)
    frames = _extract_review_frames(video_path, clip, frame_dir, video_duration)
    llm_review = _llm_review(video_path, clip, absolute_segments, frames, local_review) if use_llm else None

    suggested_start = local_review["suggested_start"]
    suggested_end = local_review["suggested_end"]
    if llm_review and isinstance(llm_review.get("suggested_start"), (int, float)):
        suggested_start = min(suggested_start, float(llm_review["suggested_start"]))
    if llm_review and isinstance(llm_review.get("suggested_end"), (int, float)):
        suggested_end = max(suggested_end, float(llm_review["suggested_end"]))

    return {
        "clip_index": clip.get("clip_index"),
        "original_start": round(start, 2),
        "original_end": round(end, 2),
        "original_duration": round(end - start, 2),
        "verdict": _final_verdict(local_review, llm_review),
        "issues": local_review["issues"],
        "suggested_start": round(max(0.0, suggested_start), 2),
        "suggested_end": round(min(video_duration, suggested_end), 2),
        "suggested_duration": round(min(video_duration, suggested_end) - max(0.0, suggested_start), 2),
        "near_start_text": _text_window(absolute_segments, start - 5, start + 5),
        "inside_text": _text_window(absolute_segments, start, end),
        "near_end_text": _text_window(absolute_segments, end - 5, end + 8),
        "frames": frames,
        "local_review": local_review,
        "llm_review": llm_review,
    }


def _local_boundary_review(start: float, end: float, segments: List[Dict[str, Any]], video_duration: float, clip: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    head_padding = float(config.STORY_SCENE.get("head_padding", 2.2))
    tail_padding = float(config.STORY_SCENE.get("tail_padding", 2.2))
    chain_gap = float(config.STORY_SCENE.get("dialogue_chain_gap", 3.0))
    max_head_extension = float(config.STORY_SCENE.get("max_head_extension", 10.0))
    max_tail_extension = float(config.STORY_SCENE.get("max_tail_extension", 18.0))
    internal_gap_threshold = float(config.STORY_SCENE.get("internal_gap_threshold", 8.0))

    issues = []
    suggested_start = start
    suggested_end = end

    start_chain = _dialogue_chain_around_start(start, segments, chain_gap)
    if start_chain:
        chain_start = min(s["start"] for s in start_chain)
        first_text = " ".join(s.get("text", "") for s in start_chain).strip()
        if chain_start < start - 0.25:
            issues.append({
                "type": "incomplete_start_dialogue",
                "message": "开头附近有一句话已经在切点前开始，可能吃掉起句。",
                "text": first_text,
                "chain_start": round(chain_start, 2),
            })
            suggested_start = min(suggested_start, max(0.0, chain_start - head_padding))

    internal_gaps = _internal_dialogue_gaps(start, end, segments, internal_gap_threshold)
    for gap in internal_gaps:
        issues.append({
            "type": "internal_dialogue_gap",
            "message": "片段内部存在明显对白断层，可能跨了多场戏或多个情节点。",
            "gap_start": round(gap[0], 2),
            "gap_end": round(gap[1], 2),
            "gap_seconds": round(gap[1] - gap[0], 2),
        })

    if clip and clip.get("audit_adjusted") and "original_end_time" in clip:
        original_end = float(clip["original_end_time"])
        bleed_chain = _dialogue_chain_after_end(original_end, segments, chain_gap)
        if bleed_chain:
            bleed_start = min(s["start"] for s in bleed_chain)
            bleed_end = max(s["end"] for s in bleed_chain)
            if bleed_start >= original_end - 0.5 and bleed_end >= end - 0.5:
                issues.append({
                    "type": "scene_bleed_after_extension",
                    "message": "片段为修正尾句被延长，但延长内容疑似进入下一场戏且在新结尾仍未完整收住。",
                    "original_end": round(original_end, 2),
                    "bleed_start": round(bleed_start, 2),
                    "bleed_end": round(bleed_end, 2),
                    "text": " ".join(s.get("text", "") for s in bleed_chain).strip(),
                })
    end_chain = _dialogue_chain_after_end(end, segments, chain_gap)
    if end_chain:
        chain_start = min(s["start"] for s in end_chain)
        chain_end = max(s["end"] for s in end_chain)
        chain_text = " ".join(s.get("text", "") for s in end_chain).strip()
        if chain_start <= end + chain_gap:
            issues.append({
                "type": "incomplete_end_dialogue",
                "message": "结尾后仍有连续对白，当前切点可能截断下一句话或情绪收束。",
                "text": chain_text,
                "chain_start": round(chain_start, 2),
                "chain_end": round(chain_end, 2),
            })
            suggested_end = max(suggested_end, min(video_duration, chain_end + tail_padding))

    suggested_start = max(start - max_head_extension, suggested_start)
    suggested_end = min(end + max_tail_extension, suggested_end)
    return {
        "verdict": "needs_adjustment" if issues else "likely_ok",
        "issues": issues,
        "suggested_start": suggested_start,
        "suggested_end": suggested_end,
    }


def _internal_dialogue_gaps(start: float, end: float, segments: List[Dict[str, Any]], threshold: float) -> List[Tuple[float, float]]:
    inside = [seg for seg in segments if seg["end"] >= start and seg["start"] <= end and seg.get("text", "").strip()]
    inside = sorted(inside, key=lambda seg: seg["start"])
    gaps = []
    for previous, current in zip(inside, inside[1:]):
        gap_start = max(float(previous["end"]), start)
        gap_end = min(float(current["start"]), end)
        if gap_end - gap_start >= threshold:
            gaps.append((gap_start, gap_end))
    return gaps

def _dialogue_chain_around_start(start: float, segments: List[Dict[str, Any]], chain_gap: float) -> List[Dict[str, Any]]:
    anchor = None
    for index, seg in enumerate(segments):
        if seg["start"] <= start + 1.2 and seg["end"] >= start - 1.2:
            anchor = index
            break
    if anchor is None:
        return []

    chain = [segments[anchor]]
    cursor = anchor - 1
    while cursor >= 0 and chain[0]["start"] - segments[cursor]["end"] <= chain_gap:
        chain.insert(0, segments[cursor])
        cursor -= 1
    return chain


def _dialogue_chain_after_end(end: float, segments: List[Dict[str, Any]], chain_gap: float) -> List[Dict[str, Any]]:
    anchor = None
    for index, seg in enumerate(segments):
        if seg["end"] >= end - 1.2 and seg["start"] <= end + chain_gap:
            anchor = index
            break
    if anchor is None:
        return []

    chain = [segments[anchor]]
    cursor = anchor + 1
    while cursor < len(segments) and segments[cursor]["start"] - chain[-1]["end"] <= chain_gap:
        chain.append(segments[cursor])
        cursor += 1
    return chain


def _llm_review(
    video_path: str,
    clip: Dict[str, Any],
    segments: List[Dict[str, Any]],
    frames: List[str],
    local_review: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")
    if not api_key:
        return {"enabled": False, "reason": "missing OPENAI_API_KEY or LLM_API_KEY"}

    base_url = (os.environ.get("OPENAI_BASE_URL") or os.environ.get("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    model = os.environ.get("OPENAI_MODEL") or os.environ.get("LLM_MODEL") or "gpt-4o-mini"
    start = float(clip["start_time"])
    end = float(clip["end_time"])

    payload = {
        "model": model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": "你是短剧投流剪辑质检员。只输出 JSON，不要 Markdown。判断片段开头和结尾是否完整，尤其关注一句话是否被截断、下一句话是否已经开始、情绪点是否收住。",
            },
            {
                "role": "user",
                "content": _llm_content(video_path, start, end, segments, frames, local_review),
            },
        ],
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        return _parse_llm_json(content)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, KeyError, json.JSONDecodeError) as exc:
        return {"enabled": True, "error": str(exc), "model": model, "base_url": base_url}


def _llm_content(video_path: str, start: float, end: float, segments: List[Dict[str, Any]], frames: List[str], local_review: Dict[str, Any]) -> str:
    context = {
        "video": video_path,
        "clip_start": start,
        "clip_end": end,
        "near_start_text": _text_window(segments, start - 8, start + 8),
        "inside_text": _text_window(segments, start, end),
        "near_end_text": _text_window(segments, end - 8, end + 12),
        "local_review": local_review,
        "required_json_schema": {
            "verdict": "usable | needs_adjustment | reject",
            "reason": "中文说明",
            "suggested_start": "number seconds, optional",
            "suggested_end": "number seconds, optional",
            "start_complete": "boolean",
            "end_complete": "boolean",
        },
    }
    frame_note = "\n关键帧文件：" + ", ".join(frames) if frames else ""
    return json.dumps(context, ensure_ascii=False) + frame_note


def _parse_llm_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.startswith("json"):
            content = content[4:].strip()
    start = content.find("{")
    end = content.rfind("}")
    if start >= 0 and end > start:
        return json.loads(content[start:end + 1])
    return {"raw": content}


def _extract_context_audio(video_path: str, start: float, end: float) -> str:
    fd, temp_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    duration = max(0.5, end - start)
    cmd = [
        _ffmpeg_path(), "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", video_path,
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", temp_path,
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return temp_path


def _extract_review_frames(video_path: str, clip: Dict[str, Any], frame_dir: str, video_duration: float) -> List[str]:
    start = float(clip["start_time"])
    end = float(clip["end_time"])
    times = [
        max(0.0, start - 2.0),
        min(video_duration, start + 0.5),
        (start + end) / 2,
        max(0.0, end - 0.5),
        min(video_duration, end + 2.0),
    ]
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    paths = []
    for offset, at_time in enumerate(times):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(at_time * fps))
        ok, frame = cap.read()
        if not ok:
            continue
        out = os.path.join(frame_dir, f"{Path(video_path).stem}_{clip.get('clip_index')}_{offset}_{at_time:.1f}.jpg")
        cv2.imwrite(out, frame)
        paths.append(out)
    cap.release()
    return paths


def _absolute_segments(segments: List[Dict[str, Any]], context_start: float) -> List[Dict[str, Any]]:
    absolute = []
    for seg in segments:
        item = dict(seg)
        item["start"] = float(seg["start"]) + context_start
        item["end"] = float(seg["end"]) + context_start
        item["words"] = [
            {"word": w.get("word", ""), "start": float(w.get("start", 0)) + context_start, "end": float(w.get("end", 0)) + context_start}
            for w in seg.get("words", [])
        ]
        absolute.append(item)
    return absolute


def _text_window(segments: List[Dict[str, Any]], start: float, end: float) -> str:
    texts = []
    for seg in segments:
        if seg["end"] < start or seg["start"] > end:
            continue
        texts.append(f"[{seg['start']:.1f}-{seg['end']:.1f}] {seg.get('text', '').strip()}")
    return "\n".join(texts)


def _video_duration(video_path: str) -> float:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    return float(frames / fps) if fps else 0.0


def _ffmpeg_path() -> str:
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        local = os.path.join(config.ROOT_DIR, "models", "ffmpeg.exe")
        return local if os.path.exists(local) else "ffmpeg"


def _final_verdict(local_review: Dict[str, Any], llm_review: Optional[Dict[str, Any]]) -> str:
    if llm_review and llm_review.get("verdict") in {"usable", "needs_adjustment", "reject"}:
        return llm_review["verdict"]
    return local_review.get("verdict", "unknown")
