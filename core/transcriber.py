"""语音识别模块 - 使用 Whisper 进行中文语音转文字"""

import os, json, time
from typing import List, Dict, Any, Optional

from config import TRANSCRIBE, ROOT_DIR

# 确保 ffmpeg 在 PATH 上（项目 models 目录下有 ffmpeg.exe 副本）
_models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
if _models_dir not in os.environ.get("PATH", ""):
    os.environ["PATH"] = _models_dir + os.pathsep + os.environ.get("PATH", "")

# 设置 Whisper 缓存到项目目录
os.environ.setdefault("XDG_CACHE_HOME", os.path.join(ROOT_DIR, "models"))
os.environ.setdefault("WHISPER_CACHE_DIR", os.path.join(ROOT_DIR, "models", "whisper"))

MODEL_CACHE = {}


def load_model():
    model_name = TRANSCRIBE["model"]
    if model_name not in MODEL_CACHE:
        cache_dir = os.path.join(ROOT_DIR, "models", "whisper")
        os.makedirs(cache_dir, exist_ok=True)
        print(f"  加载 Whisper 模型: {model_name} ...")
        t0 = time.time()
        import whisper
        MODEL_CACHE[model_name] = whisper.load_model(model_name, download_root=cache_dir)
        print(f"  模型加载完成（耗时 {time.time()-t0:.1f}s）")
    return MODEL_CACHE[model_name]


def transcribe(audio_path: str) -> Dict[str, Any]:
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"音频文件不存在: {audio_path}")

    model = load_model()
    print(f"  正在转录（语言: {TRANSCRIBE['language'] or '自动'}）...")
    t0 = time.time()

    result = model.transcribe(audio_path, language=TRANSCRIBE["language"] or None, verbose=False, word_timestamps=True)

    duration = time.time() - t0
    audio_len = result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0
    print(f"  转录完成，耗时 {duration:.1f}s（音频长度 {audio_len:.0f}s）")

    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": seg["start"], "end": seg["end"], "text": seg["text"].strip(),
            "words": [{"word": w["word"], "start": w["start"], "end": w["end"]} for w in seg.get("words", [])],
        })

    return {"text": result["text"].strip(), "segments": segments}


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("用法: python transcriber.py <音频路径>")
        sys.exit(1)
    r = transcribe(sys.argv[1])
    print(f"\n全文: {r['text'][:100]}...")
    json.dump(r, open("transcript.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\n已保存到 transcript.json")
