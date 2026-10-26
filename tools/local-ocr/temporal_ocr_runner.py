import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from math import ceil
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from statistics import median

os.environ['PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK'] = 'True'

FRAME_RATE = 5
REFINEMENT_FRAME_RATE = 25
REFINEMENT_MAX_EDGE_SECONDS = 0.2
REFINEMENT_MIN_STABLE_FRAMES = 2
REFINEMENT_SIMILARITY_PERCENT = 65
THUMBNAIL_WIDTH = 96
THUMBNAIL_HEIGHT = 35
BRIGHTNESS_MINIMUM = 190
BLANK_FRACTION = 0.002
IMAGE_SIMILARITY_PERCENT = 92
MIN_DURATION_SECONDS = 0.25
SHORT_CLIP_FALLBACK_MAX_FRAMES = 10
SHORT_CLIP_FALLBACK_CANDIDATE_COUNT = 2
# A subtitle can legitimately replace another subtitle in two samples (0.4 s
# at the coarse 5 fps pass). Keep the existing minimum duration, but still
# require stable nonblank states on both sides before retaining the short run.
VOLATILE_CANDIDATE_MIN_DURATION_SECONDS = MIN_DURATION_SECONDS
TEXT_SIMILARITY_PERCENT = 80
# A 5 fps candidate split can leave a short visual gap even while the
# subtitle remains continuously visible. Keep this bounded so genuinely
# repeated subtitles separated by a longer blank interval stay separate.
MAX_TEXT_GAP_SECONDS = 0.45
DETECTION_LIMIT_SIDE_LEN = 480
DETECTION_BATCH_SIZE = 2
RECOGNITION_BATCH_SIZE = 16
CPU_THREADS = 16
MAX_RUN_SECONDS = 420
PROMINENT_GROUP_FRACTION = 0.28
END_CARD_FRAGMENT_TEXTS = frozenset(('未', '完', '待', '续'))
END_CARD_VERTICAL_RATIO = 1.15
END_CARD_TAIL_SECONDS = 2.0
# A sparse full-frame probe locates this episode's text band before the normal
# OCR run. Ten-second sampling keeps it bounded; its region is transient and
# must still pass the normal Paddle OCR path afterwards.
REGION_PROBE_FRAME_RATE = 0.1
# The confirmation pass is only used when the sparse probe has a plausible
# displaced band but too little evidence. A 0.2 fps pass can miss short-lived
# dialogue lines; 0.3 fps keeps the stable-track gate while giving the band
# enough temporal coverage to be confirmed.
REGION_PROBE_CONFIRMATION_FRAME_RATE = 0.3
REGION_PROBE_VERTICAL_PADDING_FRACTION = 0.02
MIN_EPISODE_OVERRIDE_PROBE_BOXES = 6
MIN_SHORT_EPISODE_OVERRIDE_PROBE_BOXES = 2
# A confirmation pass only reaches this lower threshold after the coarse pass
# already saw text, and only if high-frequency sampling forms one stable band.
MIN_SPARSE_CONFIRMATION_PROBE_BOXES = 4
REQUIRED_MODEL_FILES = ('config.json', 'inference.json', 'inference.pdiparams')
RUNNER_BUILD_ID = 'local-paddleocr-pyinstaller-20260810-r8'


def fail(message):
    return {'ok': False, 'error': {'message': message}}


def create_ocr_detector():
    from paddleocr import TextDetection
    return TextDetection(enable_mkldnn=False, limit_side_len=DETECTION_LIMIT_SIDE_LEN, limit_type='max', cpu_threads=CPU_THREADS)


def create_ocr_recognizer():
    from paddleocr import TextRecognition
    return TextRecognition(enable_mkldnn=False, cpu_threads=CPU_THREADS)


def run_self_test():
    try:
        cache = ensure_bundled_model_cache()
        detector = create_ocr_detector()
        recognizer = create_ocr_recognizer()
        del detector, recognizer
        return {
            'ok': True,
            'runnerBuildId': RUNNER_BUILD_ID,
            'engine': 'paddleocr',
            'detector': True,
            'recognizer': True,
            'cacheRoot': cache['cacheRoot'] if cache else None,
        }
    except Exception as error:
        return {
            'ok': False,
            'runnerBuildId': RUNNER_BUILD_ID,
            'engine': 'paddleocr',
            'detector': False,
            'recognizer': False,
            'error': {'message': str(error)},
        }


def is_ascii_path(path):
    return str(path).isascii()


def shared_ascii_model_cache_root():
    configured_drive = os.environ.get('SystemDrive', 'C:')
    system_drive = f'{configured_drive[0].upper()}:' if len(configured_drive) >= 2 and configured_drive[0].isalpha() and configured_drive[1] == ':' else 'C:'
    return Path(f'{system_drive}\\Users\\Public\\Documents') / 'ShortDramaAI' / 'paddlex'


def model_cache_candidates():
    configured_root = os.environ.get('PADDLE_PDX_CACHE_HOME')
    candidates = []
    if configured_root and is_ascii_path(configured_root):
        candidates.append(Path(configured_root))
    default_root = Path.home() / '.paddlex'
    if is_ascii_path(default_root):
        candidates.append(default_root)
    candidates.append(shared_ascii_model_cache_root())
    return candidates


def is_writable_directory(path):
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / '.shortdrama-write-probe'
        probe.write_bytes(b'')
        probe.unlink()
        return True
    except OSError:
        return False


def resolve_model_cache_root():
    for candidate in model_cache_candidates():
        if is_writable_directory(candidate):
            return candidate
    raise RuntimeError('未找到可写的 ASCII 本地 OCR 模型缓存目录')


def model_cache_needs_copy(source, target):
    return any(not (target / filename).exists() or (target / filename).stat().st_size != (source / filename).stat().st_size for filename in REQUIRED_MODEL_FILES)


def ensure_bundled_model_cache(bundled_root=None):
    bundled_root = Path(bundled_root) if bundled_root is not None else Path(__file__).resolve().parent / 'model-cache'
    bundled_models = bundled_root / 'official_models'
    if not bundled_models.exists():
        return None
    # Paddle Inference on Windows fails to load its JSON model graph from a
    # Unicode path. The packaged source can live anywhere; its writable cache
    # must use an ASCII path before PaddleOCR is imported.
    cache_root = resolve_model_cache_root()
    target_models = cache_root / 'official_models'
    target_models.mkdir(parents=True, exist_ok=True)
    copied = []
    for model_name in ('PP-OCRv5_server_det', 'PP-OCRv5_server_rec'):
        source = bundled_models / model_name
        target = target_models / model_name
        if not source.exists():
            continue
        if model_cache_needs_copy(source, target):
            shutil.copytree(source, target, dirs_exist_ok=True)
            copied.append(model_name)
    os.environ['PADDLE_PDX_CACHE_HOME'] = str(cache_root)
    return {'cacheRoot': str(cache_root), 'copiedModels': copied}


def normalized(text):
    return ''.join(text.lower().split())


def text_similarity(left, right):
    left, right = normalized(left), normalized(right)
    if not left and not right:
        return 100
    if not left or not right:
        return 0
    previous = list(range(len(right) + 1))
    for left_index, left_character in enumerate(left, start=1):
        current = [left_index]
        for right_character_index, right_character in enumerate(right, start=1):
            current.append(min(current[-1] + 1, previous[right_character_index] + 1, previous[right_character_index - 1] + (left_character != right_character)))
        previous = current
    return round(100 * (max(len(left), len(right)) - previous[-1]) / max(len(left), len(right)))


def is_blank(frame):
    return sum(pixel >= BRIGHTNESS_MINIMUM for pixel in frame) < len(frame) * BLANK_FRACTION


def mask_similarity(left, right):
    intersection = union = 0
    for left_pixel, right_pixel in zip(left, right):
        left_bright = left_pixel >= BRIGHTNESS_MINIMUM
        right_bright = right_pixel >= BRIGHTNESS_MINIMUM
        if left_bright or right_bright:
            union += 1
            intersection += left_bright and right_bright
    return 100 if union == 0 else round(100 * intersection / union)


def remaining_seconds(started):
    return MAX_RUN_SECONDS - (time.monotonic() - started)


def run_process(command, started=None):
    timeout = None
    if started is not None:
        ensure_within_deadline(started)
        timeout = max(0.1, remaining_seconds(started))
    try:
        return subprocess.run(command, capture_output=True, check=False, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        raise TimeoutError(f'本地 OCR 超过 {MAX_RUN_SECONDS} 秒上限，未创建字幕轨。请缩小已校准字幕区域或改用更短的单集验证。') from error


def temporal_candidates(request, started=None, sample_rate=FRAME_RATE, allow_empty=False):
    region = request['region']
    crop = f"crop=iw*{region['width']:.6f}:ih*{region['height']:.6f}:iw*{region['x']:.6f}:ih*{region['y']:.6f}"
    command = [request['ffmpegPath'], '-hide_banner', '-loglevel', 'error', '-i', request['videoPath'], '-vf', f'{crop},fps={sample_rate},scale={THUMBNAIL_WIDTH}:{THUMBNAIL_HEIGHT},format=gray', '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']
    completed = run_process(command, started)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode('utf-8', errors='replace').strip() or f'FFmpeg 退出码 {completed.returncode}')
    raw = completed.stdout
    frame_size = THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT
    if not raw:
        if allow_empty:
            return [], 0
        raise RuntimeError('FFmpeg 未返回完整的 OCR 时间轴帧')
    if len(raw) % frame_size:
        raise RuntimeError('FFmpeg 未返回完整的 OCR 时间轴帧')
    groups, previous, current = [], None, None
    for index in range(len(raw) // frame_size):
        frame = raw[index * frame_size:(index + 1) * frame_size]
        blank = is_blank(frame)
        same = current is not None and previous is not None and current['isBlank'] == blank and (blank or mask_similarity(previous, frame) >= IMAGE_SIMILARITY_PERCENT)
        if same:
            current['endFrame'] = index
        else:
            if current:
                groups.append(current)
            current = {'startFrame': index, 'endFrame': index, 'isBlank': blank}
        previous = frame
    if current:
        groups.append(current)
    candidates = []
    volatile_start_frame = None
    volatile_end_frame = None

    def append_candidate(start_frame, end_frame, representative_frame=None, short_clip_fallback=False):
        duration = (end_frame - start_frame + 1) / sample_rate
        candidate = {
            'startSeconds': round(start_frame / sample_rate, 3),
            'endSeconds': round((end_frame + 1) / sample_rate, 3),
            'durationSeconds': round(duration, 3),
            'representativeSeconds': round(((start_frame + end_frame + 1) / 2 if representative_frame is None else representative_frame + 0.5) / sample_rate, 3)
        }
        if short_clip_fallback:
            candidate['shortClipFallback'] = True
        candidates.append(candidate)

    def append_leading_volatile_candidates(start_frame, end_frame):
        # The opening can contain several real subtitles while the scene is
        # still changing, so each short visual run is not a safe OCR anchor.
        # Use bounded windows only for the normal 5 fps pass; later detection,
        # recognition, merging, and boundary refinement remain authoritative.
        if sample_rate < FRAME_RATE:
            return
        window_frames = max(2, ceil(VOLATILE_CANDIDATE_MIN_DURATION_SECONDS * sample_rate))
        for window_start in range(start_frame, end_frame + 1, window_frames):
            window_end = min(window_start + window_frames - 1, end_frame)
            if window_end - window_start + 1 < window_frames:
                break
            append_candidate(window_start, window_end)

    volatile_has_stable_before = False

    def flush_volatile(has_stable_after=False):
        nonlocal volatile_start_frame, volatile_end_frame, volatile_has_stable_before
        duration = 0 if volatile_start_frame is None or volatile_end_frame is None else (volatile_end_frame - volatile_start_frame + 1) / sample_rate
        if volatile_start_frame is not None and volatile_end_frame is not None and duration >= VOLATILE_CANDIDATE_MIN_DURATION_SECONDS:
            if volatile_has_stable_before and has_stable_after:
                append_candidate(volatile_start_frame, volatile_end_frame)
            elif not candidates and has_stable_after:
                append_leading_volatile_candidates(volatile_start_frame, volatile_end_frame)
        volatile_start_frame = None
        volatile_end_frame = None
        volatile_has_stable_before = False

    for group in groups:
        duration = (group['endFrame'] - group['startFrame'] + 1) / sample_rate
        if group['isBlank']:
            # A short subtitle may end directly into a blank frame. The blank
            # is evidence that the volatile run ended, not a reason to drop it.
            flush_volatile(has_stable_after=True)
            continue
        if duration < MIN_DURATION_SECONDS:
            if volatile_start_frame is None:
                volatile_start_frame = group['startFrame']
                volatile_has_stable_before = bool(candidates) and not group['isBlank']
            volatile_end_frame = group['endFrame']
            continue
        flush_volatile(has_stable_after=True)
        append_candidate(group['startFrame'], group['endFrame'])
    flush_volatile()
    # A very short clip can keep a small subtitle on screen for its entire
    # duration. The thumbnail brightness mask may classify every frame as
    # blank, leaving Paddle nothing to inspect. Use one bounded middle-frame
    # candidates only for that case. Keep at most two local windows around the
    # brightest sampled frames rather than one middle frame: a one-line subtitle
    # can disappear before midpoint, and two matching detections can still form
    # a bounded temporal cue. Paddle remains the authority for any written text.
    if not candidates and len(raw) // frame_size <= SHORT_CLIP_FALLBACK_MAX_FRAMES:
        frame_count = len(raw) // frame_size
        ranked_frames = sorted(range(frame_count), key=lambda index: sum(pixel >= BRIGHTNESS_MINIMUM for pixel in raw[index * frame_size:(index + 1) * frame_size]), reverse=True)
        for representative_frame in sorted(ranked_frames[:SHORT_CLIP_FALLBACK_CANDIDATE_COUNT]):
            append_candidate(max(0, representative_frame - 1), min(frame_count - 1, representative_frame + 1), representative_frame=representative_frame, short_clip_fallback=True)
    if len(raw) // frame_size <= SHORT_CLIP_FALLBACK_MAX_FRAMES:
        for candidate in candidates:
            candidate['shortClipCandidate'] = True
    return candidates, len(raw) // frame_size


def crop_filter(region):
    return f"crop=iw*{region['width']:.6f}:ih*{region['height']:.6f}:iw*{region['x']:.6f}:ih*{region['y']:.6f}"


def ensure_within_deadline(started, now=None):
    elapsed = (time.monotonic() if now is None else now) - started
    if elapsed > MAX_RUN_SECONDS:
        raise TimeoutError(f'本地 OCR 超过 {MAX_RUN_SECONDS} 秒上限，未创建字幕轨。请缩小已校准字幕区域或改用更短的单集验证。')


def extract_representative_frames(request, candidates, frame_directory, started):
    def extract_one(item):
        candidate_index, candidate = item
        ensure_within_deadline(started)
        frame_path = frame_directory / f'{candidate_index + 1:05d}.png'
        command = [request['ffmpegPath'], '-hide_banner', '-loglevel', 'error', '-ss', str(candidate['representativeSeconds']), '-i', request['videoPath'], '-frames:v', '1', '-vf', crop_filter(request['region']), '-y', str(frame_path)]
        extracted = run_process(command, started)
        if extracted.returncode == 0 and frame_path.is_file() and frame_path.stat().st_size > 0:
            return candidate_index, candidate, frame_path
        return None

    with ThreadPoolExecutor(max_workers=2) as executor:
        extracted_frames = list(executor.map(extract_one, enumerate(candidates)))
    return [frame for frame in extracted_frames if frame is not None]


def detected_boxes(output):
    result = output.json.get('res', {})
    return result.get('dt_polys', []) if isinstance(result, dict) else []


def box_record(box, frame_width, frame_height):
    if not isinstance(box, list) or len(box) < 3:
        return None
    try:
        left = max(0, min(float(point[0]) for point in box))
        top = max(0, min(float(point[1]) for point in box))
        right = min(float(frame_width), max(float(point[0]) for point in box))
        bottom = min(float(frame_height), max(float(point[1]) for point in box))
    except (IndexError, TypeError, ValueError):
        return None
    width, height = right - left, bottom - top
    if width <= 0 or height <= 0:
        return None
    top_edge = abs(float(box[1][1]) - float(box[0][1])) if len(box) >= 2 else 0
    bottom_edge = abs(float(box[-1][1]) - float(box[-2][1])) if len(box) >= 2 else 0
    return {
        'box': box, 'left': left, 'top': top, 'right': right, 'bottom': bottom,
        'width': width, 'height': height, 'centerY': (top + bottom) / 2, 'area': width * height,
        # Dialogue captions are horizontal; slanted clothing logos are not.
        'nearHorizontal': max(top_edge, bottom_edge) <= max(3, width * 0.2),
    }


def update_group_geometry(group):
    records = group['records']
    group['left'] = min(record['left'] for record in records)
    group['top'] = min(record['top'] for record in records)
    group['right'] = max(record['right'] for record in records)
    group['bottom'] = max(record['bottom'] for record in records)
    group['width'] = group['right'] - group['left']
    group['height'] = group['bottom'] - group['top']
    group['centerY'] = (group['top'] + group['bottom']) / 2
    group['area'] = sum(record['area'] for record in records)


def belongs_to_same_visual_line(record, group):
    height_ratio = min(record['height'], group['height']) / max(record['height'], group['height'])
    vertical_overlap = max(0, min(record['bottom'], group['bottom']) - max(record['top'], group['top']))
    overlap_ratio = vertical_overlap / min(record['height'], group['height'])
    center_distance = abs(record['centerY'] - group['centerY'])
    horizontal_gap = max(0, max(record['left'], group['left']) - min(record['right'], group['right']))
    return height_ratio >= 0.6 and overlap_ratio >= 0.55 and center_distance <= min(record['height'], group['height']) * 0.25 and horizontal_gap <= max(record['height'], group['height']) * 2


def visual_line_groups(boxes, frame_width, frame_height):
    records = [record for box in boxes if (record := box_record(box, frame_width, frame_height)) and record['nearHorizontal']]
    groups = []
    for record in sorted(records, key=lambda value: (value['top'], value['left'])):
        matches = [group for group in groups if belongs_to_same_visual_line(record, group)]
        if matches:
            group = min(matches, key=lambda value: abs(value['centerY'] - record['centerY']))
            group['records'].append(record)
            update_group_geometry(group)
        else:
            group = {'records': [record]}
            update_group_geometry(group)
            groups.append(group)
    return groups


def track_geometry(track):
    samples = track['samples']
    return {
        'left': median(sample['left'] for sample in samples),
        'right': median(sample['right'] for sample in samples),
        'centerY': median(sample['centerY'] for sample in samples),
        'height': median(sample['height'] for sample in samples),
        'area': median(sample['area'] for sample in samples),
    }


def can_join_visual_track(group, track):
    geometry = track_geometry(track)
    height_ratio = min(group['height'], geometry['height']) / max(group['height'], geometry['height'])
    center_distance = abs(group['centerY'] - geometry['centerY'])
    horizontal_overlap = max(0, min(group['right'], geometry['right']) - max(group['left'], geometry['left']))
    shared_horizontal_space = horizontal_overlap / min(group['width'], geometry['right'] - geometry['left'])
    return height_ratio >= 0.5 and center_distance <= min(group['height'], geometry['height']) * 0.35 and shared_horizontal_space >= 0.25


def required_track_samples(frame_count):
    return 2 if frame_count <= 12 else max(3, (frame_count + 12 - 1) // 12)


def track_score(track):
    geometry = track_geometry(track)
    positions = [sample['centerY'] for sample in track['samples']]
    vertical_spread = max(positions) - min(positions)
    stability = max(0.25, 1 - vertical_spread / max(geometry['height'], 1))
    return geometry['area'] * len(track['samples']) * stability


def select_subtitle_boxes(frame_detections):
    grouped_detections = []
    for detection in frame_detections:
        groups = visual_line_groups(detection['boxes'], detection['frameWidth'], detection['frameHeight'])
        if groups:
            max_area = max(group['area'] for group in groups)
            groups = [group for group in groups if group['area'] >= max_area * PROMINENT_GROUP_FRACTION]
        grouped_detections.append({**detection, 'groups': groups})

    tracks = []
    for detection in grouped_detections:
        for group in detection['groups']:
            candidates = [track for track in tracks if track['lastCandidateIndex'] < detection['candidateIndex'] and can_join_visual_track(group, track)]
            if candidates:
                track = max(candidates, key=track_score)
            else:
                track = {'samples': [], 'lastCandidateIndex': -1}
                tracks.append(track)
            track['samples'].append({**group, 'candidateIndex': detection['candidateIndex']})
            track['lastCandidateIndex'] = detection['candidateIndex']

    # A <=2s all-blank fallback has exactly one intentionally chosen frame.
    # It cannot establish a temporal track, but it may still contain a real
    # subtitle. This exception is bounded to that marker and still requires
    # Paddle detection plus recognition before a cue can be written.
    allow_single_short_fallback = len(grouped_detections) == 1 and bool(grouped_detections[0]['candidate'].get('shortClipCandidate'))
    minimum_samples = 1 if allow_single_short_fallback else required_track_samples(len(grouped_detections))
    eligible_tracks = [track for track in tracks if len(track['samples']) >= minimum_samples]
    if not eligible_tracks:
        return {}, {'visualLineGroupCount': sum(len(item['groups']) for item in grouped_detections), 'trackedSubtitleLineCount': 0, 'selectedTextBoxCount': 0}

    primary_track = max(eligible_tracks, key=track_score)
    primary_geometry = track_geometry(primary_track)
    selected_tracks = []
    for track in eligible_tracks:
        geometry = track_geometry(track)
        same_subtitle_band = abs(geometry['centerY'] - primary_geometry['centerY']) <= max(geometry['height'], primary_geometry['height']) * 0.8
        comparable_prominence = geometry['area'] >= primary_geometry['area'] * PROMINENT_GROUP_FRACTION
        horizontal_overlap = max(0, min(geometry['right'], primary_geometry['right']) - max(geometry['left'], primary_geometry['left']))
        shared_horizontal_space = horizontal_overlap / min(geometry['right'] - geometry['left'], primary_geometry['right'] - primary_geometry['left'])
        if same_subtitle_band and comparable_prominence and shared_horizontal_space >= 0.25:
            selected_tracks.append(track)

    selected = {}
    for track in selected_tracks:
        for sample in track['samples']:
            selected.setdefault(sample['candidateIndex'], []).extend(record['box'] for record in sample['records'])
    for candidate_index, boxes in selected.items():
        deduplicated = []
        seen = set()
        for box in boxes:
            key = tuple(tuple(point) for point in box)
            if key not in seen:
                seen.add(key)
                deduplicated.append(box)
        selected[candidate_index] = deduplicated
    return selected, {'visualLineGroupCount': sum(len(item['groups']) for item in grouped_detections), 'trackedSubtitleLineCount': len(selected_tracks), 'selectedTextBoxCount': sum(len(boxes) for boxes in selected.values())}


def frame_size(frame_path):
    from PIL import Image
    with Image.open(frame_path) as image:
        return image.width, image.height


def selected_vertical_band(boxes, frame_height):
    records = [record for box in boxes if (record := box_record(box, 1_000_000, frame_height))]
    if not records:
        return None
    padding = max(1, median(record['height'] for record in records) * 0.2)
    return {
        'top': max(0, min(record['top'] for record in records) - padding),
        'bottom': min(frame_height, max(record['bottom'] for record in records) + padding)
    }


def refinement_reference(frame_path, band):
    from PIL import Image
    with Image.open(frame_path) as image:
        top = max(0, int(band['top']))
        bottom = min(image.height, max(top + 1, int(band['bottom'])))
        return image.crop((0, top, image.width, bottom)).convert('L').resize((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT)).tobytes()


def extract_refinement_frames(request, start_seconds, end_seconds, band, started):
    start_seconds = max(0, start_seconds)
    duration_seconds = end_seconds - start_seconds
    if duration_seconds <= 0:
        return start_seconds, []
    band_height = max(0.001, (band['bottom'] - band['top']) / band['frameHeight'])
    band_top = max(0, band['top'] / band['frameHeight'])
    filters = f"{crop_filter(request['region'])},crop=iw:ih*{band_height:.6f}:0:ih*{band_top:.6f},fps={REFINEMENT_FRAME_RATE},scale={THUMBNAIL_WIDTH}:{THUMBNAIL_HEIGHT},format=gray"
    command = [request['ffmpegPath'], '-hide_banner', '-loglevel', 'error', '-ss', str(start_seconds), '-i', request['videoPath'], '-t', str(duration_seconds), '-vf', filters, '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']
    completed = run_process(command, started)
    if completed.returncode != 0:
        return start_seconds, []
    frame_size_bytes = THUMBNAIL_WIDTH * THUMBNAIL_HEIGHT
    if not completed.stdout or len(completed.stdout) % frame_size_bytes:
        return start_seconds, []
    return start_seconds, [completed.stdout[index * frame_size_bytes:(index + 1) * frame_size_bytes] for index in range(len(completed.stdout) // frame_size_bytes)]


def stable_matching_runs(frames, reference):
    matching = [not is_blank(frame) and mask_similarity(reference, frame) >= REFINEMENT_SIMILARITY_PERCENT for frame in frames]
    runs, run_start = [], None
    for index, matched in enumerate(matching + [False]):
        if matched and run_start is None:
            run_start = index
        elif not matched and run_start is not None:
            if index - run_start >= REFINEMENT_MIN_STABLE_FRAMES:
                runs.append((run_start, index - 1))
            run_start = None
    return runs


def refine_boundary_from_frames(boundary_seconds, window_start_seconds, frames, reference, side):
    matches = []
    for run_start, run_end in stable_matching_runs(frames, reference):
        run_start_seconds = window_start_seconds + run_start / REFINEMENT_FRAME_RATE
        run_end_seconds = window_start_seconds + (run_end + 1) / REFINEMENT_FRAME_RATE
        if side == 'start' and run_end_seconds >= boundary_seconds + 1 / REFINEMENT_FRAME_RATE:
            return round(run_start_seconds, 3)
        if side == 'end' and run_start_seconds <= boundary_seconds - 1 / REFINEMENT_FRAME_RATE:
            matches.append(round(run_end_seconds, 3))
    return matches[-1] if matches else None


def refine_single_boundary(request, line, cue_detections, band, started, side):
    if side == 'start':
        window = (max(0, line['startSeconds'] - REFINEMENT_MAX_EDGE_SECONDS), min(line['endSeconds'], cue_detections[0]['candidate']['representativeSeconds'] + 1 / REFINEMENT_FRAME_RATE))
        reference_frame = cue_detections[0]['framePath']
    else:
        window = (max(line['startSeconds'], cue_detections[-1]['candidate']['representativeSeconds'] - 1 / REFINEMENT_FRAME_RATE), line['endSeconds'])
        reference_frame = cue_detections[-1]['framePath']
    window_start, frames = extract_refinement_frames(request, *window, band, started)
    boundary = refine_boundary_from_frames(line['startSeconds'] if side == 'start' else line['endSeconds'], window_start, frames, refinement_reference(reference_frame, band), side)
    return boundary, len(frames)


def refine_line_boundaries(request, line, cue_detections, band, started):
    with ThreadPoolExecutor(max_workers=2) as executor:
        boundaries = list(executor.map(
            lambda side: refine_single_boundary(request, line, cue_detections, band, started, side),
            ('start', 'end'),
        ))
    return boundaries[0][0], boundaries[1][0], boundaries[0][1] + boundaries[1][1]


def is_refined_start(line, boundary):
    return boundary is not None and boundary != line['startSeconds'] and boundary >= 0 and boundary < line['endSeconds']


def is_refined_end(line, boundary):
    return boundary is not None and boundary < line['endSeconds'] and boundary > line['startSeconds']


def refine_merged_lines(request, lines, detections, selected_boxes, started):
    detection_by_index = {item['candidateIndex']: item for item in detections}
    refined = []
    sampled_frames = refined_count = fallback_count = 0
    total_boundary_delta_ms = 0
    for line in lines:
        ensure_within_deadline(started)
        candidate_indexes = line.get('_candidateIndexes', [])
        cue_detections = [detection_by_index[index] for index in candidate_indexes if index in detection_by_index and selected_boxes.get(index)]
        if not cue_detections:
            fallback_count += 1
            refined.append(line)
            continue
        frame_height = cue_detections[0]['frameHeight']
        boxes = [box for detection in cue_detections for box in selected_boxes[detection['candidateIndex']]]
        band = selected_vertical_band(boxes, frame_height)
        if not band:
            fallback_count += 1
            refined.append(line)
            continue
        band['frameHeight'] = frame_height
        # Start with Paddle's narrow band. If the text box is incomplete at the
        # transition edge, retry against the full user-confirmed subtitle region.
        start_boundary, end_boundary, sampled = refine_line_boundaries(request, line, cue_detections, band, started)
        sampled_frames += sampled
        if not is_refined_start(line, start_boundary) or not is_refined_end(line, end_boundary):
            full_region_band = {'top': 0, 'bottom': frame_height, 'frameHeight': frame_height}
            if not is_refined_start(line, start_boundary):
                start_boundary, broad_sampled = refine_single_boundary(request, line, cue_detections, full_region_band, started, 'start')
                sampled_frames += broad_sampled
            if not is_refined_end(line, end_boundary):
                end_boundary, broad_sampled = refine_single_boundary(request, line, cue_detections, full_region_band, started, 'end')
                sampled_frames += broad_sampled
        refined_line = dict(line)
        if start_boundary is not None and start_boundary < refined_line['endSeconds']:
            refined_line['startSeconds'] = start_boundary
        if end_boundary is not None and end_boundary > refined_line['startSeconds']:
            refined_line['endSeconds'] = end_boundary
        if refined_line['startSeconds'] != line['startSeconds'] or refined_line['endSeconds'] != line['endSeconds']:
            refined_count += 1
            total_boundary_delta_ms += round((abs(refined_line['startSeconds'] - line['startSeconds']) + abs(refined_line['endSeconds'] - line['endSeconds'])) * 1000)
        else:
            fallback_count += 1
        refined.append(refined_line)
    return refined, {
        'refinementSampledFrameCount': sampled_frames,
        'refinedCueCount': refined_count,
        'refinementFallbackCount': fallback_count,
        'totalBoundaryAdjustmentMilliseconds': total_boundary_delta_ms
    }


def crop_detected_boxes(frame_path, boxes, crop_directory, candidate_index):
    from PIL import Image
    crops = []
    with Image.open(frame_path) as image:
        for box_index, box in enumerate(boxes, start=1):
            if not isinstance(box, list) or len(box) < 3:
                continue
            left = max(0, int(min(point[0] for point in box)))
            top = max(0, int(min(point[1] for point in box)))
            right = min(image.width, int(max(point[0] for point in box)))
            bottom = min(image.height, int(max(point[1] for point in box)))
            if right <= left or bottom <= top:
                continue
            crop_path = crop_directory / f'{candidate_index:05d}-{box_index:02d}.png'
            image.crop((left, top, right, bottom)).save(crop_path)
            crops.append((crop_path, top, left, right - left, bottom - top))
    return crops


def read_recognition(output):
    result = output.json.get('res', {})
    if not isinstance(result, dict):
        return '', None
    text = result.get('rec_text')
    score = result.get('rec_score')
    return (text.strip() if isinstance(text, str) else ''), (float(score) if isinstance(score, (float, int)) else None)


def is_vertical_end_card_fragment(text, width, height):
    return normalized(text) in END_CARD_FRAGMENT_TEXTS and height >= width * END_CARD_VERTICAL_RATIO


def is_end_card_fragment(text, width, height, candidate_end_seconds=None, tail_end_seconds=None):
    return normalized(text) in END_CARD_FRAGMENT_TEXTS and candidate_end_seconds is not None and tail_end_seconds is not None and candidate_end_seconds >= tail_end_seconds - END_CARD_TAIL_SECONDS


def detect_frame_paths(frame_paths, started):
    detector = create_ocr_detector()
    detections = []
    detected_frame_count = 0
    detected_box_count = 0
    for offset in range(0, len(frame_paths), DETECTION_BATCH_SIZE):
        ensure_within_deadline(started)
        batch = frame_paths[offset:offset + DETECTION_BATCH_SIZE]
        outputs = list(detector.predict([str(frame_path) for _, _, frame_path in batch], batch_size=DETECTION_BATCH_SIZE))
        for (candidate_index, candidate, frame_path), output in zip(batch, outputs):
            boxes = detected_boxes(output)
            if not boxes:
                continue
            width, height = frame_size(frame_path)
            valid_boxes = [box for box in boxes if box_record(box, width, height)]
            if valid_boxes:
                detections.append({'candidateIndex': candidate_index, 'candidate': candidate, 'framePath': frame_path, 'frameWidth': width, 'frameHeight': height, 'boxes': valid_boxes})
                detected_frame_count += 1
                detected_box_count += len(valid_boxes)
    return detections, detected_frame_count, detected_box_count


def proposed_episode_region(detections, selected_boxes):
    records = []
    frame_height = None
    for detection in detections:
        boxes = selected_boxes.get(detection['candidateIndex'], [])
        if not boxes:
            continue
        frame_height = detection['frameHeight']
        records.extend(record for box in boxes if (record := box_record(box, detection['frameWidth'], detection['frameHeight'])))
    if not records or not frame_height:
        return None
    padding = max(frame_height * REGION_PROBE_VERTICAL_PADDING_FRACTION, median(record['height'] for record in records) * 0.5)
    top = max(0, min(record['top'] for record in records) - padding)
    bottom = min(frame_height, max(record['bottom'] for record in records) + padding)
    if bottom <= top:
        return None
    return {'x': 0, 'y': round(top / frame_height, 6), 'width': 1, 'height': round((bottom - top) / frame_height, 6)}


def proposed_region_covers_saved_region(proposed, saved):
    overlap_top = max(proposed['y'], saved['y'])
    overlap_bottom = min(proposed['y'] + proposed['height'], saved['y'] + saved['height'])
    overlap_height = max(0, overlap_bottom - overlap_top)
    return overlap_height / saved['height'] >= 0.85


def can_use_episode_override(proposed, saved, probe_stats):
    return proposed is not None and probe_stats['episodeRegionProbeSelectedTextBoxCount'] >= probe_box_requirement(probe_stats) and (saved is None or not proposed_region_covers_saved_region(proposed, saved))


def probe_box_requirement(probe_stats):
    if probe_stats.get('episodeRegionProbeShortClipFallback'):
        return 1
    if probe_stats.get('episodeRegionProbeConfirmationUsed') and probe_stats.get('episodeRegionProbeTrackedSubtitleLineCount', 0) >= 1:
        return MIN_SPARSE_CONFIRMATION_PROBE_BOXES
    return MIN_SHORT_EPISODE_OVERRIDE_PROBE_BOXES if probe_stats.get('episodeRegionProbeSampledFrameCount', 999) <= 3 else MIN_EPISODE_OVERRIDE_PROBE_BOXES


def probe_episode_region_at_rate(request, work_directory, started, sample_rate, probe_region=None):
    probe_request = {**request, 'region': probe_region or {'x': 0, 'y': 0, 'width': 1, 'height': 1}}
    candidates, sampled_frame_count = temporal_candidates(probe_request, started, sample_rate, allow_empty=True)
    actual_sample_rate = sample_rate
    if sample_rate < 1 and sampled_frame_count <= 1:
        # Very short clips can legitimately produce one or zero frames at a
        # tenth-of-a-frame-per-second probe. Retry at a bounded rate before
        # declaring the probe empty; the normal OCR pass remains unchanged.
        actual_sample_rate = 2
        candidates, sampled_frame_count = temporal_candidates(probe_request, started, actual_sample_rate, allow_empty=True)
    elif not candidates and sample_rate < 1:
        actual_sample_rate = 1
        candidates, sampled_frame_count = temporal_candidates(probe_request, started, actual_sample_rate, allow_empty=True)
    if not candidates:
        return None, {
            'episodeRegionProbeSampledFrameCount': sampled_frame_count,
            'episodeRegionProbeDetectedFrameCount': 0,
            'episodeRegionProbeDetectedBoxCount': 0,
            'episodeRegionProbeVisualLineGroupCount': 0,
            'episodeRegionProbeTrackedSubtitleLineCount': 0,
            'episodeRegionProbeSelectedTextBoxCount': 0,
            'episodeRegionProbeSampleRate': actual_sample_rate,
            'episodeRegionProbeShortClipFallback': 0
        }
    short_clip_fallback = any(candidate.get('shortClipCandidate') for candidate in candidates)
    frame_directory = work_directory / 'episode-region-probe'
    frame_directory.mkdir(parents=True, exist_ok=True)
    frame_paths = extract_representative_frames(probe_request, candidates, frame_directory, started)
    detections, detected_frame_count, detected_box_count = detect_frame_paths(frame_paths, started)
    selected_boxes, selection_stats = select_subtitle_boxes(detections)
    # A confirmation run only needs to validate the coarse subtitle band. It
    # intentionally keeps that band as the effective region so long episodes
    # do not pay for a second full-frame Paddle detection pass.
    region = probe_region or proposed_episode_region(detections, selected_boxes)
    return region, {
        'episodeRegionProbeSampledFrameCount': sampled_frame_count,
        'episodeRegionProbeDetectedFrameCount': detected_frame_count,
        'episodeRegionProbeDetectedBoxCount': detected_box_count,
        'episodeRegionProbeVisualLineGroupCount': selection_stats['visualLineGroupCount'],
        'episodeRegionProbeTrackedSubtitleLineCount': selection_stats['trackedSubtitleLineCount'],
        'episodeRegionProbeSelectedTextBoxCount': selection_stats['selectedTextBoxCount'],
        'episodeRegionProbeSampleRate': actual_sample_rate,
        'episodeRegionProbeShortClipFallback': 1 if short_clip_fallback else 0
    }


def should_confirm_episode_region(proposed, saved, probe_stats):
    sparse_text_evidence = probe_stats.get('episodeRegionProbeDetectedFrameCount', 0) > 0 and probe_stats.get('episodeRegionProbeDetectedBoxCount', 0) > 0
    if proposed is None:
        # Do not expand an empty probe into a costly scan. A sparse probe that
        # did see text can be a real subtitle band sampled between short cues.
        return sparse_text_evidence
    return (saved is None or not proposed_region_covers_saved_region(proposed, saved)) and probe_stats['episodeRegionProbeSelectedTextBoxCount'] < probe_box_requirement(probe_stats)


def probe_episode_region(request, work_directory, started):
    coarse_region, coarse_stats = probe_episode_region_at_rate(request, work_directory, started, REGION_PROBE_FRAME_RATE)
    if not should_confirm_episode_region(coarse_region, request['region'], coarse_stats):
        return coarse_region, {**coarse_stats, 'episodeRegionProbeConfirmationUsed': 0}

    confirmation_directory = work_directory / 'episode-region-probe-confirmation'
    confirmation_region, confirmation_stats = probe_episode_region_at_rate(request, confirmation_directory, started, REGION_PROBE_CONFIRMATION_FRAME_RATE, coarse_region)
    confirmation_stats = {**confirmation_stats, 'episodeRegionProbeConfirmationUsed': 1}
    use_confirmation = confirmation_region is not None and (coarse_region is None or confirmation_stats['episodeRegionProbeSelectedTextBoxCount'] >= coarse_stats['episodeRegionProbeSelectedTextBoxCount'])
    selected_region, selected_stats = (confirmation_region, confirmation_stats) if use_confirmation else (coarse_region, coarse_stats)
    return selected_region, {
        **selected_stats,
        'episodeRegionProbeConfirmationUsed': 1,
        'episodeRegionProbeCoarseSelectedTextBoxCount': coarse_stats['episodeRegionProbeSelectedTextBoxCount']
    }


def recognized_lines(request, candidates, work_directory, started):
    recognizer = create_ocr_recognizer()
    frame_directory = work_directory / 'representative-frames'
    crop_directory = work_directory / 'detected-text-crops'
    frame_directory.mkdir(parents=True, exist_ok=True)
    crop_directory.mkdir(parents=True, exist_ok=True)
    frame_paths = extract_representative_frames(request, candidates, frame_directory, started)
    detections, detected_frame_count, detected_box_count = detect_frame_paths(frame_paths, started)
    selected_boxes, selection_stats = select_subtitle_boxes(detections)
    crops_by_candidate = {}
    for detection in detections:
        candidate_index = detection['candidateIndex']
        boxes = selected_boxes.get(candidate_index, [])
        if boxes:
            candidate_crops = crop_detected_boxes(detection['framePath'], boxes, crop_directory, candidate_index + 1)
            if candidate_crops:
                crops_by_candidate[candidate_index] = candidate_crops
    crop_inputs = [(candidate_index, crop_path, top, left, width, height) for candidate_index, crops in crops_by_candidate.items() for crop_path, top, left, width, height in crops]
    recognized_by_candidate = {}
    tail_end_seconds = max((candidate['endSeconds'] for candidate in candidates), default=None)
    for offset in range(0, len(crop_inputs), RECOGNITION_BATCH_SIZE):
        ensure_within_deadline(started)
        batch = crop_inputs[offset:offset + RECOGNITION_BATCH_SIZE]
        outputs = list(recognizer.predict([str(crop_path) for _, crop_path, _, _, _, _ in batch], batch_size=RECOGNITION_BATCH_SIZE))
        for (candidate_index, _crop_path, top, left, width, height), output in zip(batch, outputs):
            text, confidence = read_recognition(output)
            candidate_end_seconds = candidates[candidate_index]['endSeconds']
            if text and not is_end_card_fragment(text, width, height, candidate_end_seconds, tail_end_seconds):
                recognized_by_candidate.setdefault(candidate_index, []).append((top, left, text, confidence))
    recognized = []
    for candidate_index, candidate in enumerate(candidates):
        boxes = recognized_by_candidate.get(candidate_index)
        if not boxes:
            continue
        boxes.sort(key=lambda value: (value[0], value[1]))
        text = '\n'.join(value[2] for value in boxes)
        confidences = [value[3] for value in boxes if value[3] is not None]
        confidence = sum(confidences) / len(confidences) if confidences else None
        recognized.append({**candidate, 'candidateIndex': candidate_index, 'text': text, 'confidence': confidence})
    return recognized, {'candidateFrameCount': len(candidates), 'extractedFrameCount': len(frame_paths), 'unavailableFrameCount': max(0, len(candidates) - len(frame_paths)), 'textDetectedFrameCount': detected_frame_count, 'textDetectedBoxCount': detected_box_count, **selection_stats, 'recognizedFrameCount': len(recognized)}, {'detections': detections, 'selectedBoxes': selected_boxes}


def merge_lines(recognized, retain_candidate_indexes=False):
    merged, current = [], None
    for cue in recognized:
        if current and cue['startSeconds'] - current['endSeconds'] <= MAX_TEXT_GAP_SECONDS and text_similarity(current['text'], cue['text']) >= TEXT_SIMILARITY_PERCENT:
            current['endSeconds'] = cue['endSeconds']
            current['variants'][cue['text']] = current['variants'].get(cue['text'], 0) + cue['durationSeconds']
            current['text'] = max(current['variants'], key=current['variants'].get)
            if 'candidateIndex' in cue:
                current['candidateIndexes'].append(cue['candidateIndex'])
            if cue['confidence'] is not None:
                current['confidences'].append(cue['confidence'])
            continue
        current = {'startSeconds': cue['startSeconds'], 'endSeconds': cue['endSeconds'], 'text': cue['text'], 'variants': {cue['text']: cue['durationSeconds']}, 'candidateIndexes': [cue['candidateIndex']] if 'candidateIndex' in cue else [], 'confidences': [] if cue['confidence'] is None else [cue['confidence']]}
        merged.append(current)
    result = []
    for line in merged:
        if line['endSeconds'] - line['startSeconds'] < MIN_DURATION_SECONDS:
            continue
        merged_line = {'startSeconds': line['startSeconds'], 'endSeconds': line['endSeconds'], 'text': line['text'], 'confidence': round(sum(line['confidences']) / len(line['confidences']), 4) if line['confidences'] else None}
        if retain_candidate_indexes:
            merged_line['_candidateIndexes'] = line['candidateIndexes']
        result.append(merged_line)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input')
    parser.add_argument('--output')
    parser.add_argument('--self-test', action='store_true')
    arguments = parser.parse_args()
    if arguments.self_test:
        result = run_self_test()
        print(json.dumps(result, ensure_ascii=False), flush=True)
        raise SystemExit(0 if result['ok'] else 1)
    if not arguments.input or not arguments.output:
        parser.error('--input and --output are required unless --self-test is used')
    output_path = Path(arguments.output)
    started = time.monotonic()
    try:
        ensure_bundled_model_cache()
        request = json.loads(Path(arguments.input).read_text(encoding='utf-8-sig'))
        for key in ('ffmpegPath', 'videoPath'):
            if key not in request:
                raise ValueError(f'缺少 OCR 执行参数：{key}')
        saved_region = request.get('region')
        if saved_region is not None and not isinstance(saved_region, dict):
            raise ValueError('OCR 区域参数无效')
        stage_started = time.monotonic()
        proposed_region, probe_stats = probe_episode_region(request, output_path.parent, started)
        probe_elapsed_seconds = time.monotonic() - stage_started
        # Preserve the user-confirmed drama region whenever the sparse probe
        # already covers it. A different region is only needed for a genuine
        # per-episode vertical displacement such as episode 85.
        use_proposed_region = can_use_episode_override(proposed_region, saved_region, probe_stats)
        if saved_region is None and not use_proposed_region:
            raise RuntimeError('自动区域检测没有获得足够稳定的字幕带；未创建字幕轨。请为该集手动校准后重试。')
        effective_region = proposed_region if use_proposed_region else saved_region
        request = {**request, 'region': effective_region}
        region_stats = {
            **probe_stats,
            'episodeRegionProbeUsed': 1 if proposed_region else 0,
            'episodeRegionProbeOverrideEligible': 1 if proposed_region and probe_stats['episodeRegionProbeSelectedTextBoxCount'] >= probe_box_requirement(probe_stats) else 0,
            'episodeRegionFallbackUsed': 1 if use_proposed_region else 0,
            'effectiveRegionXPercent': round(effective_region['x'] * 100, 3),
            'effectiveRegionYPercent': round(effective_region['y'] * 100, 3),
            'effectiveRegionWidthPercent': round(effective_region['width'] * 100, 3),
            'effectiveRegionHeightPercent': round(effective_region['height'] * 100, 3)
        }
        stage_started = time.monotonic()
        candidates, frame_count = temporal_candidates(request, started)
        candidate_elapsed_seconds = time.monotonic() - stage_started
        ensure_within_deadline(started)
        stage_started = time.monotonic()
        recognized, recognition_stats, refinement_context = recognized_lines(request, candidates, output_path.parent / 'effective-region', started)
        recognition_elapsed_seconds = time.monotonic() - stage_started
        ensure_within_deadline(started)
        merged_lines = merge_lines(recognized, retain_candidate_indexes=True)
        stage_started = time.monotonic()
        lines, refinement_stats = refine_merged_lines(request, merged_lines, refinement_context['detections'], refinement_context['selectedBoxes'], started)
        refinement_elapsed_seconds = time.monotonic() - stage_started
        lines = [{key: value for key, value in line.items() if key != '_candidateIndexes'} for line in lines]
        timing_stats = {
            'regionProbeElapsedSeconds': round(probe_elapsed_seconds, 3),
            'candidateElapsedSeconds': round(candidate_elapsed_seconds, 3),
            'recognitionElapsedSeconds': round(recognition_elapsed_seconds, 3),
            'refinementElapsedSeconds': round(refinement_elapsed_seconds, 3)
        }
        if not lines:
            result = {**fail('当前剧集未选出可用字幕行；未创建字幕轨。请检查该集字幕位置或视频清晰度。'), 'stats': {'sampledFrameCount': frame_count, 'textSampleCount': len(candidates), **region_stats, **recognition_stats, **refinement_stats, **timing_stats, 'elapsedSeconds': round(time.monotonic() - started, 3), 'deadlineSeconds': MAX_RUN_SECONDS}}
        else:
            result = {'ok': True, 'cues': lines, 'stats': {'sampledFrameCount': frame_count, 'textSampleCount': len(candidates), **region_stats, **recognition_stats, **refinement_stats, **timing_stats, 'elapsedSeconds': round(time.monotonic() - started, 3), 'deadlineSeconds': MAX_RUN_SECONDS}}
    except Exception as error:
        message = f'本地 Paddle OCR 未完成：{error}'
        if os.environ.get('SHORTDRAMA_OCR_DEBUG_TRACEBACK') == '1':
            message = f'{message}\n{traceback.format_exc()}'
        result = fail(message)
    output_path.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
