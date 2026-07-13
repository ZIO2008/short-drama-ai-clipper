"""音频波形分析 - 检测声音能量的高潮段落"""

import os
import numpy as np
from typing import List, Dict, Optional
from pydub import AudioSegment


def compute_audio_scores(audio_path: str, scenes: List[Dict]) -> Dict[int, float]:
    """分析音频波形，给每个场景打声音能量分（0~1）

    分析维度：
    - 平均能量：场景整体音量（大音量=激烈）
    - 峰值能量：场景内最高音量（爆炸/尖叫）
    - 能量波动：极静→极动的变化幅度（戏剧张力）
    """
    if not os.path.exists(audio_path):
        return {s["index"]: 0.0 for s in scenes}

    try:
        audio = AudioSegment.from_file(audio_path)
    except Exception:
        return {s["index"]: 0.0 for s in scenes}

    sr = audio.frame_rate
    samples = np.array(audio.get_array_of_samples()).astype(float)
    duration = len(samples) / sr

    scores = {}
    all_rms = []

    # 先算所有场景的 RMS
    for sc in scenes:
        start_s = int(sc["start_time"] * sr)
        end_s = int(sc["end_time"] * sr)
        end_s = min(end_s, len(samples))
        if end_s - start_s < 100:
            all_rms.append(0.0)
            continue

        seg = samples[start_s:end_s]
        if len(seg) == 0:
            all_rms.append(0.0)
            continue

        # 分帧计算 RMS（每帧 50ms）
        frame_len = int(sr * 0.05)
        frames = []
        for i in range(0, len(seg) - frame_len + 1, frame_len // 2):
            frame = seg[i:i + frame_len]
            rms = float(np.sqrt(np.mean(frame ** 2)))
            frames.append(rms)

        if not frames:
            all_rms.append(0.0)
            continue

        avg_rms = float(np.mean(frames))
        peak_rms = float(np.max(frames))
        std_rms = float(np.std(frames))

        all_rms.append({
            "avg": avg_rms,
            "peak": peak_rms,
            "std": std_rms,
        })

    # 归一化
    avgs = [r["avg"] for r in all_rms if r != 0.0]
    peaks = [r["peak"] for r in all_rms if r != 0.0]
    stds = [r["std"] for r in all_rms if r != 0.0]

    max_avg = max(avgs) if avgs else 1
    max_peak = max(peaks) if peaks else 1
    max_std = max(stds) if stds else 1

    for i, sc in enumerate(scenes):
        r = all_rms[i]
        if r == 0.0:
            scores[sc["index"]] = 0.0
            continue

        norm_avg = min(r["avg"] / max_avg, 1.0)
        norm_peak = min(r["peak"] / max_peak, 1.0)
        norm_std = min(r["std"] / max_std, 1.0)

        # 综合音频分 = 平均能量*0.3 + 峰值能量*0.3 + 波动幅度*0.4
        score = norm_avg * 0.3 + norm_peak * 0.3 + norm_std * 0.4
        scores[sc["index"]] = round(min(score, 1.0), 3)

    return scores


if __name__ == "__main__":
    import json, sys
    scenes = json.load(open("scenes.json"))
    audio = sys.argv[1] if len(sys.argv) > 1 else input("音频路径: ")
    as_ = compute_audio_scores(audio, scenes)
    for s in scenes:
        s["audio_score"] = as_.get(s["index"], 0)
    print("场景音频评分:")
    for s in scenes:
        bar = "█" * int(s["audio_score"] * 30 + 0.5) or "▏"
        print(f"  #{s['index']:02d}  {s['start_time']:6.1f}s  {s['audio_score']:.3f} {bar}")
    json.dump([{"index": s["index"], "audio_score": round(s.get("audio_score", 0), 3)} for s in scenes],
              open("audio_scores.json", "w"), indent=2)
    print("\n已保存到 audio_scores.json")
