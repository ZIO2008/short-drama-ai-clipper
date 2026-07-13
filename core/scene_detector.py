"""场景检测模块 - 使用 PySceneDetect 检测镜头切换"""

import os
import json
from typing import List, Dict, Any
from scenedetect import open_video, SceneManager
from scenedetect.detectors import ContentDetector, ThresholdDetector
from scenedetect.scene_manager import save_images

from config import SCENE_DETECTION


def detect_scenes(video_path: str) -> List[Dict[str, Any]]:
    """检测视频中的场景切换

    Returns:
        [{"index": 0, "start_time": 12.3, "end_time": 45.6, "duration": 33.3, "start_frame": 370, "end_frame": 1368}, ...]
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"视频文件不存在: {video_path}")

    video = open_video(video_path)
    fps = video.frame_rate

    scene_manager = SceneManager()
    algo = SCENE_DETECTION["algorithm"]

    if algo == "threshold":
        scene_manager.add_detector(ThresholdDetector())
    else:
        scene_manager.add_detector(ContentDetector(
            threshold=SCENE_DETECTION["threshold"],
            min_scene_len=SCENE_DETECTION["min_scene_len"],
        ))

    scene_manager.detect_scenes(video, show_progress=False)
    scene_list = scene_manager.get_scene_list()

    if not scene_list:
        return [{"index": 0, "start_time": 0.0, "end_time": video.duration,
                 "duration": video.duration, "start_frame": 0, "end_frame": int(video.duration * fps)}]

    scenes = []
    for i, (start, end) in enumerate(scene_list):
        scenes.append({
            "index": i,
            "start_time": float(start.get_seconds()),
            "end_time": float(end.get_seconds()),
            "duration": float(end.get_seconds() - start.get_seconds()),
            "start_frame": int(start.frame_num or (start.get_seconds() * fps)),
            "end_frame": int(end.frame_num or (end.get_seconds() * fps)),
        })

    return scenes


def get_scene_boundaries(scenes: List[Dict]) -> List[float]:
    """提取场景边界时间戳"""
    boundaries = [0.0]
    for s in scenes:
        boundaries.append(s["end_time"])
    return sorted(set(boundaries))


def scene_summary(scenes: List[Dict]) -> str:
    """生成场景摘要"""
    total = sum(s["duration"] for s in scenes)
    lines = [f"检测到 {len(scenes)} 个场景，总时长 {total:.1f}s"]
    for s in scenes:
        lines.append(f"  #{s['index']:02d}  {s['start_time']:.1f}s - {s['end_time']:.1f}s  [{s['duration']:.1f}s]")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法: python scene_detector.py <视频路径>")
        sys.exit(1)
    s = detect_scenes(sys.argv[1])
    print(scene_summary(s))
    json.dump(s, open("scenes.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n已保存到 scenes.json")
