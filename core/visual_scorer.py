"""视觉分析模块 - 通过画面分析给场景打视觉分"""

import cv2
import numpy as np
from typing import List, Dict


def compute_visual_scores(video_path: str, scenes: List[Dict]) -> Dict[int, float]:
    """对每个场景做画面分析，返回视觉能量分（0~1）

    分析维度：
    - 运动量：帧间像素差异（动作戏=高分）
    - 亮度：画面亮度（异常亮/暗=扣分）
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {s["index"]: 0.0 for s in scenes}

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30

    scores = {}
    for sc in scenes:
        if sc["duration"] <= 0.3:
            scores[sc["index"]] = 0.0
            continue

        start_f = int(sc["start_time"] * fps)
        end_f = int(sc["end_time"] * fps)
        n_samples = min(5, max(2, end_f - start_f))
        step = max(1, (end_f - start_f) // n_samples)

        prev_gray = None
        motions = []
        brightnesses = []

        for f in range(start_f, end_f, step):
            cap.set(cv2.CAP_PROP_POS_FRAMES, f)
            ret, frame = cap.read()
            if not ret:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(float)
            brightnesses.append(float(np.mean(gray) / 255.0))

            if prev_gray is not None:
                diff = float(np.mean(np.abs(gray - prev_gray)) / 255.0)
                motions.append(diff)
            prev_gray = gray

        if not motions:
            scores[sc["index"]] = 0.0
            continue

        avg_motion = float(np.mean(motions))
        avg_bright = float(np.mean(brightnesses)) if brightnesses else 0.5
        bright_penalty = abs(avg_bright - 0.5) * 0.3

        # 最终视觉分 = 运动能量 * 0.7 + (1 - 亮度异常) * 0.3
        visual_score = min(1.0, avg_motion * 3.0 * 0.7 + max(0, 1 - bright_penalty) * 0.3)
        scores[sc["index"]] = round(visual_score, 3)

    cap.release()
    return scores


if __name__ == "__main__":
    import json, sys
    scenes = json.load(open("scenes.json"))
    video = sys.argv[1] if len(sys.argv) > 1 else input("视频路径: ")
    vs = compute_visual_scores(video, scenes)
    for s in scenes:
        s["visual_score"] = vs.get(s["index"], 0)
    print("场景视觉评分:")
    for s in scenes:
        bar = "█" * int(s["visual_score"] * 30 + 0.5) or "▏"
        print(f"  #{s['index']:02d}  {s['start_time']:6.1f}s  {s['visual_score']:.3f} {bar}")
    json.dump([{"index": s["index"], "visual_score": round(s.get("visual_score", 0), 3)} for s in scenes],
              open("visual_scores.json", "w"), indent=2)
    print("\n已保存到 visual_scores.json")
