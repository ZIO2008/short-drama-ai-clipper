"""Clip analysis based on complete story scenes.

Visual scene detection usually returns shots, not full drama scenes. This module
scores each shot first, then groups adjacent shots into longer story-scene
candidates before choosing exports. Clip boundaries always land on detected shot
boundaries so we avoid hard cuts in the middle of action/dialogue.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

from config import CLIP_ANALYSIS, HOOK_KEYWORDS, STORY_SCENE
from core.audio_scorer import compute_audio_scores
from core.visual_scorer import compute_visual_scores


def analyze_clips(
    scenes: List[Dict],
    transcript: Dict[str, Any],
    video_duration: float,
    video_path: Optional[str] = None,
    audio_path: Optional[str] = None,
) -> List[Dict]:
    """Pick high-value clips as complete story scenes, not single shots."""
    cfg = CLIP_ANALYSIS
    return analyze_candidate_pool(
        scenes,
        transcript,
        video_duration,
        video_path,
        audio_path,
        pool_count=int(cfg["target_clip_count"]),
        overlap_threshold=0.35,
    )


def analyze_candidate_pool(
    scenes: List[Dict],
    transcript: Dict[str, Any],
    video_duration: float,
    video_path: Optional[str] = None,
    audio_path: Optional[str] = None,
    pool_count: Optional[int] = None,
    overlap_threshold: float = 0.58,
) -> List[Dict]:
    """Build a wider candidate pool so later audit can backfill rejected clips."""
    segments = transcript.get("segments", [])
    text_index = _build_text_index(segments)
    cfg = CLIP_ANALYSIS
    target = int(pool_count or cfg["target_clip_count"])
    min_dur = max(float(cfg["min_clip_duration"]), float(STORY_SCENE.get("min_duration", 24)))
    max_dur = float(cfg["max_clip_duration"])

    visual_scores = compute_visual_scores(video_path, scenes) if video_path else {}
    audio_scores = compute_audio_scores(audio_path, scenes) if audio_path else {}

    for scene in scenes:
        scene_text = _get_range_text(scene["start_time"], scene["end_time"], text_index)
        scores = _score_scene(scene, scene_text, video_duration)
        dialogue_score = scores["overall_score"]
        visual_score = visual_scores.get(scene["index"], 0)
        audio_score = audio_scores.get(scene["index"], 0)
        scores["overall_score"] = round(dialogue_score * 0.35 + visual_score * 0.35 + audio_score * 0.30, 3)
        scores["visual_score"] = visual_score
        scores["audio_score"] = audio_score
        scores["dialogue_score"] = dialogue_score
        scene.update(scores)
        scene["dialogue"] = scene_text[:200]
        scene["origin_score"] = scores["overall_score"]

    first_real_start = _first_real_start(scenes)
    candidates = _build_story_scene_candidates(scenes, text_index, video_duration, min_dur, max_dur, first_real_start)
    candidates = sorted(candidates, key=lambda c: c["score"], reverse=True)

    recommendations = []
    used_ranges: List[Tuple[float, float]] = []

    for candidate in candidates:
        if len(recommendations) >= target:
            break
        if _has_large_overlap(candidate["start_time"], candidate["end_time"], used_ranges, overlap_threshold):
            continue
        used_ranges.append((candidate["start_time"], candidate["end_time"]))
        recommendations.append({
            "clip_index": len(recommendations),
            "candidate_rank": len(recommendations),
            "start_time": round(candidate["start_time"], 1),
            "end_time": round(candidate["end_time"], 1),
            "duration": round(candidate["end_time"] - candidate["start_time"], 1),
            "score": round(candidate["score"], 3),
            "scene_index": candidate["main_scene_index"],
            "shot_start_index": candidate["shot_start_index"],
            "shot_end_index": candidate["shot_end_index"],
            "shot_count": candidate["shot_count"],
        })

    return sorted(recommendations, key=lambda r: r["start_time"])


def _build_story_scene_candidates(
    scenes: List[Dict],
    text_index: List[Dict],
    video_duration: float,
    min_dur: float,
    max_dur: float,
    first_real_start: float,
) -> List[Dict]:
    ordered = [s for s in sorted(scenes, key=lambda x: x["start_time"]) if s["end_time"] > first_real_start]
    candidates = []
    if not ordered:
        return candidates

    preferred = min(float(STORY_SCENE.get("preferred_duration", 45)), max_dur)
    boundary_silence = float(STORY_SCENE.get("boundary_silence", 1.2))

    for start_pos, start_scene in enumerate(ordered):
        group: List[Dict] = []
        last_end = start_scene["start_time"]
        for scene in ordered[start_pos:]:
            if group and scene["start_time"] - last_end > 3.0:
                break
            next_duration = scene["end_time"] - start_scene["start_time"]
            if group and next_duration > max_dur:
                break
            group.append(scene)
            last_end = scene["end_time"]

            duration = last_end - start_scene["start_time"]
            if duration < min_dur:
                continue

            is_preferred_length = duration >= preferred
            has_pause_after = _has_dialogue_pause(last_end, text_index, boundary_silence)
            at_video_end = last_end >= video_duration - 1.0
            enough_shots = len(group) >= 2 or duration >= min_dur * 1.3

            if enough_shots and (is_preferred_length or has_pause_after or at_video_end):
                protected_group = _protect_dialogue_edges(group, ordered, text_index, video_duration, max_dur)
                candidates.append(_score_candidate(protected_group, text_index, video_duration))
                break

        if group and last_end - start_scene["start_time"] >= min_dur and not _same_range_exists(candidates, group):
            protected_group = _protect_dialogue_edges(group, ordered, text_index, video_duration, max_dur)
            candidates.append(_score_candidate(protected_group, text_index, video_duration))

    return _dedupe_candidates(candidates)


def _protect_dialogue_edges(
    group: List[Dict],
    ordered_scenes: List[Dict],
    text_index: List[Dict],
    video_duration: float,
    max_dur: float,
) -> List[Dict]:
    protected = list(group)
    original_start = protected[0]["start_time"]
    original_end = protected[-1]["end_time"]
    target_start = min(
        _dialogue_safe_start(original_start, text_index),
        original_start - float(STORY_SCENE.get("head_padding", 2.2)),
    )
    target_end = max(
        _dialogue_safe_end(original_end, text_index, video_duration),
        original_end + float(STORY_SCENE.get("tail_padding", 2.2)),
    )

    if target_start < original_start - 0.05:
        for scene in reversed(ordered_scenes):
            if scene["index"] >= protected[0]["index"]:
                continue
            if protected[-1]["end_time"] - scene["start_time"] > max_dur:
                break
            protected.insert(0, scene)
            if scene["start_time"] <= max(target_start, 0.0):
                break

    max_allowed_end = min(video_duration, protected[0]["start_time"] + max_dur)
    if target_end > original_end + 0.05:
        for scene in ordered_scenes:
            if scene["index"] <= protected[-1]["index"]:
                continue
            if scene["end_time"] - protected[0]["start_time"] > max_dur:
                break
            protected.append(scene)
            if scene["end_time"] >= min(target_end, max_allowed_end):
                break

    return protected


def _dialogue_safe_start(start: float, text_index: List[Dict]) -> float:
    guard_window = float(STORY_SCENE.get("speech_guard_window", 1.8))
    head_padding = float(STORY_SCENE.get("head_padding", 2.2))
    max_extension = float(STORY_SCENE.get("max_head_extension", 10.0))
    safe_start = start

    for seg in reversed(text_index):
        seg_start = float(seg["start"])
        seg_end = float(seg["end"])
        if seg_end >= start - guard_window and seg_start <= start + guard_window:
            safe_start = min(safe_start, seg_start - head_padding)
        elif seg_end < start - guard_window:
            break

    return max(safe_start, start - max_extension, 0.0)


def _dialogue_safe_end(end: float, text_index: List[Dict], video_duration: float) -> float:
    guard_window = float(STORY_SCENE.get("speech_guard_window", 1.8))
    tail_padding = float(STORY_SCENE.get("tail_padding", 2.2))
    max_extension = float(STORY_SCENE.get("max_tail_extension", 10.0))
    safe_end = end

    for seg in text_index:
        seg_start = float(seg["start"])
        seg_end = float(seg["end"])
        if seg_start <= end + guard_window and seg_end >= end - guard_window:
            safe_end = max(safe_end, seg_end + tail_padding)
        elif seg_start > end + guard_window:
            break

    return min(safe_end, end + max_extension, video_duration)

def _score_candidate(group: List[Dict], text_index: List[Dict], video_duration: float) -> Dict:
    start = group[0]["start_time"]
    end = group[-1]["end_time"]
    duration = end - start
    weighted_score = sum(s.get("origin_score", 0) * max(s.get("duration", 0.1), 0.1) for s in group) / max(duration, 0.1)
    peak_score = max((s.get("origin_score", 0) for s in group), default=0)
    text = _get_range_text(start, end, text_index)
    text_score = min(len(text) / 180, 0.25)
    duration_score = _duration_score(duration)
    position_score = _position_score(start, end, video_duration)
    opening_boost = float(STORY_SCENE.get("opening_boost", 0.12)) if start <= float(STORY_SCENE.get("opening_boost_seconds", 25)) else 0.0
    score = weighted_score * 0.55 + peak_score * 0.25 + text_score + duration_score + position_score + opening_boost
    main_scene = max(group, key=lambda s: s.get("origin_score", 0))
    return {
        "start_time": start,
        "end_time": end,
        "score": round(score, 3),
        "main_scene_index": main_scene["index"],
        "shot_start_index": group[0]["index"],
        "shot_end_index": group[-1]["index"],
        "shot_count": len(group),
    }


def _duration_score(duration: float) -> float:
    preferred = float(STORY_SCENE.get("preferred_duration", 45))
    if duration <= 0:
        return 0.0
    distance = abs(duration - preferred) / max(preferred, 1.0)
    return max(0.0, 0.18 * (1.0 - distance))


def _position_score(start: float, end: float, video_duration: float) -> float:
    if video_duration <= 0:
        return 0.0
    mid = ((start + end) / 2) / video_duration
    return max(0.0, 0.10 * (1.0 - 4.0 * (mid - 0.55) ** 2))


def _has_dialogue_pause(at_time: float, text_index: List[Dict], pause_seconds: float) -> bool:
    before = None
    after = None
    for seg in text_index:
        if seg["end"] <= at_time:
            before = seg
        elif seg["start"] >= at_time:
            after = seg
            break
    if before and after:
        return after["start"] - before["end"] >= pause_seconds
    return False


def _first_real_start(scenes: List[Dict]) -> float:
    for scene in scenes:
        if scene.get("duration", 0) >= 2.0 and scene.get("start_time", 0) > 5:
            return float(scene["start_time"])
    return 0.0


def _same_range_exists(candidates: List[Dict], group: List[Dict]) -> bool:
    start = group[0]["start_time"]
    end = group[-1]["end_time"]
    return any(abs(c["start_time"] - start) < 0.2 and abs(c["end_time"] - end) < 0.2 for c in candidates)


def _dedupe_candidates(candidates: List[Dict]) -> List[Dict]:
    unique = []
    for candidate in sorted(candidates, key=lambda c: c["score"], reverse=True):
        if not _has_large_overlap(candidate["start_time"], candidate["end_time"], [(c["start_time"], c["end_time"]) for c in unique], 0.65):
            unique.append(candidate)
    return unique


def _has_large_overlap(start: float, end: float, used_ranges: List[Tuple[float, float]], threshold: float = 0.35) -> bool:
    duration = max(end - start, 0.1)
    for used_start, used_end in used_ranges:
        overlap = min(end, used_end) - max(start, used_start)
        if overlap > 0 and overlap / duration > threshold:
            return True
    return False


def _build_text_index(segments):
    return [{"start": s["start"], "end": s["end"], "text": s["text"]} for s in segments if s.get("text", "").strip()]


def _get_scene_text(scene, text_index):
    return _get_range_text(scene["start_time"], scene["end_time"], text_index)


def _get_range_text(start: float, end: float, text_index: List[Dict]) -> str:
    texts = []
    for seg in text_index:
        if seg["start"] >= start and seg["end"] <= end:
            texts.append(seg["text"])
        elif seg["start"] < end and seg["end"] > start:
            texts.append(seg["text"])
    return " ".join(texts)


def _score_scene(scene, text, video_duration):
    duration = scene["duration"]
    if duration <= 0:
        return dict.fromkeys(["dialogue_intensity", "keyword_density", "pace_score", "position_score", "overall_score"], 0)
    cfg = CLIP_ANALYSIS
    intensity = min(text.count("！") * 0.15 + text.count("!") * 0.15, 0.4) + min(text.count("？") * 0.08 + text.count("?") * 0.08, 0.2) + min(len(re.findall(r"([啊呀嗯不一]){3,}", text)) * 0.1, 0.2) + min((text.count("…") + text.count("——")) * 0.05, 0.1) + min(len(text) / 50 * 0.1, 0.1)
    intensity = min(intensity, 1.0)
    if not text.strip():
        keyword_score = 0.0
    else:
        total = 0.0
        matched = set()
        for cat, kws in HOOK_KEYWORDS.items():
            for kw in kws:
                if kw in text and kw not in matched:
                    matched.add(kw)
                    total += 0.25 if cat in ("高潮词", "冲突词") else 0.2 if cat == "反转词" else 0.12
        keyword_score = min(total + min(total / max(len(text) / 15, 1), 0.5), 1.0)
    pace = 0.9 if duration <= 5 else 0.7 if duration <= 10 else 0.5 if duration <= 20 else 0.3 if duration <= 40 else 0.1
    pos_ratio = ((scene["start_time"] + scene["end_time"]) / 2) / video_duration if video_duration > 0 else 0.5
    position = max(0.0, 1.0 - 4.0 * (pos_ratio - 0.7) ** 2)
    overall = cfg["dialogue_intensity_weight"] * intensity + cfg["keyword_density_weight"] * keyword_score + cfg["pace_weight"] * pace + cfg["position_bias"] * position
    return {"dialogue_intensity": round(intensity, 3), "keyword_density": round(keyword_score, 3), "pace_score": round(pace, 3), "position_score": round(position, 3), "overall_score": round(overall, 3)}


def recommendation_summary(recommendations):
    if not recommendations:
        return "  No recommended clips"
    lines = [f"Recommended {len(recommendations)} complete story-scene clips"]
    for rec in recommendations:
        t_start = f"{int(rec['start_time'] // 60):02d}:{int(rec['start_time'] % 60):02d}"
        t_end = f"{int(rec['end_time'] // 60):02d}:{int(rec['end_time'] % 60):02d}"
        stars = "*" * max(1, int(rec["score"] * 5 + 0.5))
        shot_info = f" shots:{rec.get('shot_count', 1)}" if "shot_count" in rec else ""
        lines.append(f"  #{rec['clip_index']} [{t_start}->{t_end}] {rec['duration']:.0f}s score:{rec['score']:.2f}{shot_info} {stars}")
    return "\n".join(lines)


if __name__ == "__main__":
    scenes = json.load(open("scenes.json", encoding="utf-8"))
    transcript = json.load(open("transcript.json", encoding="utf-8"))
    vd = max(s["end_time"] for s in scenes)
    import sys

    recs = analyze_clips(
        scenes,
        transcript,
        vd,
        sys.argv[1] if len(sys.argv) > 1 else None,
        sys.argv[2] if len(sys.argv) > 2 else None,
    )
    print(recommendation_summary(recs))
    json.dump(recs, open("recommendations.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

\n