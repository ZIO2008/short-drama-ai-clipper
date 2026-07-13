"""导出模块 - 剪辑视频、烧录字幕、生成封面"""

import os, json, subprocess, tempfile, shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image, ImageDraw, ImageFont

import config
from config import EXPORT, OUTPUT_BASE


def _get_ffmpeg_path() -> str:
    try:
        from imageio_ffmpeg import get_ffmpeg_exe
        return get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


FFMPEG_PATH = _get_ffmpeg_path()
# 系统临时目录（纯 ASCII 路径，避免中文路径问题）
SYSTEM_TEMP = tempfile.gettempdir()


def export_clip(video_path: str, clip: Dict, scenes: List[Dict], segments: List[Dict], output_name: Optional[str] = None) -> Dict[str, str]:
    os.makedirs(config.FINISHED_DIR, exist_ok=True)
    os.makedirs(config.SUBTITLE_DIR, exist_ok=True)
    os.makedirs(config.THUMBNAIL_DIR, exist_ok=True)

    clip_index = clip["clip_index"]
    start = clip["start_time"]
    end = clip["end_time"]
    duration = end - start
    base = output_name or f"clip_{clip_index:02d}"
    output_video = os.path.join(config.FINISHED_DIR, f"{base}.mp4")

    print(f"  [{clip_index}] 剪切视频 {start:.1f}s -> {end:.1f}s ...")
    _cut_video(video_path, start, duration, output_video)

    if EXPORT.get("add_subtitles", True) and segments:
        print(f"  [{clip_index}] 生成字幕 ...")
        srt_path = os.path.join(config.SUBTITLE_DIR, f"{base}.srt")
        _generate_srt(segments, start, end, srt_path)
        # 复制到系统临时目录（纯 ASCII 路径）
        ascii_srt = os.path.join(SYSTEM_TEMP, f"clip_{base}.srt")
        shutil.copy2(srt_path, ascii_srt)
        output_with_sub = output_video.replace(".mp4", "_sub.mp4")
        try:
            _burn_subtitles(output_video, ascii_srt, output_with_sub)
            os.replace(output_with_sub, output_video)
        except Exception as e:
            print(f"  [!] 字幕烧录失败（已跳过）: {e}")
            if os.path.exists(output_with_sub):
                os.remove(output_with_sub)
        finally:
            if os.path.exists(ascii_srt):
                os.remove(ascii_srt)

    watermark = EXPORT.get("watermark_text", "")
    if watermark:
        print(f"  [{clip_index}] 添加水印 ...")
        output_wm = output_video.replace(".mp4", "_wm.mp4")
        _add_watermark(output_video, watermark, output_wm)
        os.replace(output_wm, output_video)

    thumbnail = os.path.join(config.THUMBNAIL_DIR, f"{base}.jpg")
    _generate_thumbnail(video_path, start, thumbnail, clip_index, clip)

    return {"video": output_video, "thumbnail": thumbnail}


def _cut_video(input_path: str, start: float, duration: float, output_path: str):
    cmd = [FFMPEG_PATH, "-y", "-ss", str(start), "-t", str(duration), "-i", input_path,
           "-c:v", EXPORT["video_codec"], "-c:a", EXPORT["audio_codec"],
           "-preset", "fast", "-pix_fmt", "yuv420p", "-avoid_negative_ts", "1", output_path]
    subprocess.run(cmd, capture_output=True, check=True)


def _generate_srt(segments: List[Dict], start: float, end: float, srt_path: str):
    lines = []
    idx = 1
    for seg in segments:
        if seg["end"] < start or seg["start"] > end:
            continue
        s_start = max(seg["start"] - start, 0)
        s_end = min(seg["end"] - start, end - start)
        if s_end - s_start < 0.5:
            continue
        def _fmt(t):
            h, m = int(t // 3600), int((t % 3600) // 60)
            s, ms = int(t % 60), int((t % 1) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
        text = seg.get("text", "").strip()
        if text:
            lines.append(f"{idx}\n{_fmt(s_start)} --> {_fmt(s_end)}\n{text}\n")
            idx += 1
    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _burn_subtitles(video_path: str, srt_path: str, output_path: str):
    fs = EXPORT.get("subtitle_font_size", 28)
    cmd = [FFMPEG_PATH, "-y", "-i", video_path,
           "-vf", f"subtitles={srt_path}:force_style='FontSize={fs},FontName=Microsoft YaHei,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1.5,Shadow=0.5'",
           "-c:v", "libx264", "-c:a", "copy", "-preset", "fast", output_path]
    subprocess.run(cmd, capture_output=True, check=True)


def _add_watermark(video_path: str, text: str, output_path: str):
    cmd = [FFMPEG_PATH, "-y", "-i", video_path,
           "-vf", f"drawtext=text='{text}':fontsize=16:fontcolor=white@0.4:x=w-tw-10:y=h-th-10:fontfile='C\\:/Windows/Fonts/msyh.ttc'",
           "-c:v", "libx264", "-c:a", "copy", "-preset", "fast", output_path]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
    except subprocess.CalledProcessError:
        subprocess.run([FFMPEG_PATH, "-y", "-i", video_path, "-c", "copy", output_path], check=True)


def _generate_thumbnail(video_path: str, at_time: float, output_path: str, clip_index: int, clip: Dict):
    temp_frame = os.path.join(SYSTEM_TEMP, f"_frame_{clip_index:02d}.jpg")
    cmd = [FFMPEG_PATH, "-y", "-ss", str(at_time + 1.0), "-i", video_path, "-vframes", "1", "-q:v", "2", temp_frame]
    try:
        subprocess.run(cmd, capture_output=True, check=True)
        img = Image.open(temp_frame)
        draw = ImageDraw.Draw(img)
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 36)
            font_small = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 24)
        except Exception:
            font = ImageFont.load_default()
            font_small = ImageFont.load_default()
        w, h = img.size
        overlay = Image.new("RGBA", (w, 120), (0, 0, 0, 160))
        img.paste(overlay, (0, h - 120), overlay)
        draw.text((20, h - 100), f"精彩片段 #{clip_index}  评分: {clip.get('score', 0):.2f}", fill="white", font=font)
        draw.text((20, h - 50), f"{int(clip['start_time']//60):02d}:{int(clip['start_time']%60):02d} - {int(clip['end_time']//60):02d}:{int(clip['end_time']%60):02d}", fill=(200, 200, 200), font=font_small)
        img.save(output_path, "JPEG", quality=85)
    except Exception as e:
        print(f"  封面生成失败: {e}")
    finally:
        if os.path.exists(temp_frame):
            os.remove(temp_frame)


def export_all(video_path: str, recommendations: List[Dict], scenes: List[Dict], transcript: Dict[str, Any], parallel: bool = False) -> List[Dict]:
    segments = transcript.get("segments", [])
    video_name = Path(video_path).stem
    print(f"\n开始导出 {len(recommendations)} 个片段到: {config.FINISHED_DIR}")
    results = []
    for rec in recommendations:
        try:
            results.append(export_clip(video_path, rec, scenes, segments, f"{video_name}_{rec['clip_index']:02d}"))
        except Exception as e:
            print(f"  FAIL 片段 #{rec['clip_index']}: {e}")
    return results


def print_export_summary(results: List[Dict]):
    print(f"\n{'='*50}")
    print(f"  导出完成！共 {len(results)} 个片段")
    print(f"{'='*50}")
    for r in results:
        print(f"  OK {os.path.basename(r['video'])}")
        print(f"    封面: {os.path.basename(r['thumbnail'])}")
    print(f"\n  输出目录: {config.FINISHED_DIR}")
    print(f"  封面目录: {config.THUMBNAIL_DIR}")
