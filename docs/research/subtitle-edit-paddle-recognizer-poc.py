import json
import os
import subprocess
import sys
import time
from pathlib import Path

from paddleocr import PaddleOCR


def normalized(value):
    return ''.join(value.lower().split())


def similarity(left, right):
    left = normalized(left)
    right = normalized(right)
    if not left and not right:
        return 100
    if not left or not right:
        return 0
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_index, right_character in enumerate(right, start=1):
            current.append(min(current[-1] + 1, previous[right_index] + 1, previous[right_index - 1] + (left_character != right_character)))
        previous = current
    return round(100 * (max(len(left), len(right)) - previous[-1]) / max(len(left), len(right)))


def merge_lines(recognized, max_gap_seconds=0.25, text_similarity_percent=80, min_duration_seconds=0.25):
    merged = []
    current = None
    for cue in recognized:
        text = cue['text'].strip()
        if not text:
            continue
        if current and cue['startSeconds'] - current['endSeconds'] <= max_gap_seconds and similarity(current['majorityText'], text) >= text_similarity_percent:
            current['endSeconds'] = cue['endSeconds']
            current['variants'][text] = current['variants'].get(text, 0) + cue['durationSeconds']
            current['majorityText'] = max(current['variants'], key=current['variants'].get)
            continue
        current = {
            'startSeconds': cue['startSeconds'],
            'endSeconds': cue['endSeconds'],
            'majorityText': text,
            'variants': {text: cue['durationSeconds']},
        }
        merged.append(current)
    return [
        {'startSeconds': line['startSeconds'], 'endSeconds': line['endSeconds'], 'text': line['majorityText']}
        for line in merged
        if line['endSeconds'] - line['startSeconds'] >= min_duration_seconds
    ]


def read_text(result):
    payload = result.json.get('res', {})
    texts = [text.strip() for text in payload.get('rec_texts', []) if text and text.strip()]
    scores = payload.get('rec_scores', [])
    return '\n'.join(texts), scores


def main():
    if len(sys.argv) != 6:
        raise SystemExit('Usage: subtitle-edit-paddle-recognizer-poc.py <ffmpeg.exe> <video.mp4> <timeline.json> <work-dir> <result.json>')
    ffmpeg, video_path, timeline_path, work_dir, result_path = sys.argv[1:]
    os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'
    timeline = json.loads(Path(timeline_path).read_text(encoding='utf-8'))
    frame_dir = Path(work_dir) / 'representative-frames'
    frame_dir.mkdir(parents=True, exist_ok=True)
    crop = timeline['config']['crop']
    crop_filter = f"crop={crop['width']}:{crop['height']}:{crop['x']}:{crop['y']}"
    started = time.monotonic()
    ocr = PaddleOCR(lang='ch', enable_mkldnn=False, use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=False)
    recognized = []
    extraction_failures = []
    for index, candidate in enumerate(timeline['candidates'], start=1):
        frame_path = frame_dir / f'{index:04d}.png'
        command = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-ss', str(candidate['representativeSeconds']), '-i', video_path, '-frames:v', '1', '-vf', crop_filter, '-y', str(frame_path)]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            extraction_failures.append({'index': index, 'reason': completed.stderr.strip() or f'ffmpeg exit {completed.returncode}'})
            continue
        output = list(ocr.predict(str(frame_path)))
        text, scores = read_text(output[0]) if output else ('', [])
        recognized.append({**candidate, 'text': text, 'scores': scores})
    lines = merge_lines(recognized)
    result = {
        'kind': 'subtitle-edit-style-temporal-and-paddle-poc',
        'boundary': 'All video decoding and Paddle OCR are local. Imported SRT, ASR, cloud APIs and product storage are not read or written by this script.',
        'timelineInput': timeline_path,
        'candidateCount': len(timeline['candidates']),
        'recognizedFrameCount': len(recognized),
        'nonEmptyRecognitionCount': sum(1 for cue in recognized if cue['text']),
        'frameExtractionFailures': extraction_failures,
        'lineCount': len(lines),
        'elapsedSeconds': round(time.monotonic() - started, 3),
        'recognized': recognized,
        'lines': lines,
    }
    Path(result_path).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({key: result[key] for key in ('candidateCount', 'recognizedFrameCount', 'nonEmptyRecognitionCount', 'lineCount', 'elapsedSeconds')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
