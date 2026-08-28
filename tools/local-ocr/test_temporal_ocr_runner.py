import importlib.util
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('temporal_ocr_runner', Path(__file__).with_name('temporal_ocr_runner.py'))
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class TemporalOcrRunnerTest(unittest.TestCase):
    @staticmethod
    def rectangle(left, top, right, bottom):
        return [[left, top], [right, top], [right, bottom], [left, bottom]]

    def test_normalizes_end_card_text_without_filtering_it(self):
        self.assertEqual(RUNNER.normalized('未 完 待 续'), '未完待续')
        self.assertEqual(RUNNER.normalized('PUA 标题'), 'pua标题')
        self.assertEqual(RUNNER.normalized('未完待续，'), '未完待续，')

    def test_filters_only_vertical_single_character_end_card_fragments(self):
        self.assertTrue(RUNNER.is_vertical_end_card_fragment('未', 100, 130))
        self.assertFalse(RUNNER.is_vertical_end_card_fragment('未', 130, 100))
        self.assertFalse(RUNNER.is_vertical_end_card_fragment('嗯', 100, 130))
        self.assertTrue(RUNNER.is_end_card_fragment('未', 130, 100, 95.5, 96.0))
        self.assertFalse(RUNNER.is_end_card_fragment('未', 130, 100, 90.0, 96.0))

    def test_keeps_vertical_end_card_character_before_the_video_tail(self):
        fragment = sorted(RUNNER.END_CARD_FRAGMENT_TEXTS)[0]
        self.assertFalse(RUNNER.is_end_card_fragment(fragment, 100, 130, 90.0, 96.0))

    def test_copies_bundled_models_into_a_writable_cache_when_missing(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            bundled = root / 'bundled' / 'official_models' / 'PP-OCRv5_server_det'
            for filename in RUNNER.REQUIRED_MODEL_FILES:
                (bundled / filename).parent.mkdir(parents=True, exist_ok=True)
                (bundled / filename).write_text(filename, encoding='utf-8')
            cache = root / 'cache'
            previous = RUNNER.os.environ.get('PADDLE_PDX_CACHE_HOME')
            RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = str(cache)
            try:
                result = RUNNER.ensure_bundled_model_cache(root / 'bundled')
                self.assertEqual(result['copiedModels'], ['PP-OCRv5_server_det'])
                self.assertTrue((cache / 'official_models' / 'PP-OCRv5_server_det' / 'inference.pdiparams').exists())
            finally:
                if previous is None:
                    RUNNER.os.environ.pop('PADDLE_PDX_CACHE_HOME', None)
                else:
                    RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = previous

    def test_uses_configured_ascii_cache_path(self):
        with TemporaryDirectory() as folder:
            previous = RUNNER.os.environ.get('PADDLE_PDX_CACHE_HOME')
            cache = Path(folder) / 'ocr-cache'
            RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = str(cache)
            try:
                self.assertEqual(RUNNER.resolve_model_cache_root(), cache)
            finally:
                if previous is None:
                    RUNNER.os.environ.pop('PADDLE_PDX_CACHE_HOME', None)
                else:
                    RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = previous

    def test_avoids_unicode_configured_cache_path(self):
        previous = RUNNER.os.environ.get('PADDLE_PDX_CACHE_HOME')
        original_shared_root = RUNNER.shared_ascii_model_cache_root
        RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = r'D:\项目\paddlex'
        RUNNER.shared_ascii_model_cache_root = lambda: Path(r'C:\Users\Public\Documents\ShortDramaAI\paddlex')
        try:
            with patch.object(RUNNER.Path, 'home', return_value=Path(r'C:\用户')):
                self.assertEqual(RUNNER.model_cache_candidates(), [Path(r'C:\Users\Public\Documents\ShortDramaAI\paddlex')])
        finally:
            RUNNER.shared_ascii_model_cache_root = original_shared_root
            if previous is None:
                RUNNER.os.environ.pop('PADDLE_PDX_CACHE_HOME', None)
            else:
                RUNNER.os.environ['PADDLE_PDX_CACHE_HOME'] = previous

    def test_refreshes_a_partial_model_cache(self):
        with TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'source'
            target = root / 'target'
            for filename in RUNNER.REQUIRED_MODEL_FILES:
                (source / filename).parent.mkdir(parents=True, exist_ok=True)
                (source / filename).write_bytes(b'valid-model-file')
                (target / filename).parent.mkdir(parents=True, exist_ok=True)
                (target / filename).write_bytes(b'stale')
            self.assertTrue(RUNNER.model_cache_needs_copy(source, target))

    def test_merges_similar_adjacent_text_without_asr_timestamps(self):
        lines = RUNNER.merge_lines([
            {'startSeconds': 2.0, 'endSeconds': 2.4, 'durationSeconds': 0.4, 'text': '你回来了', 'confidence': 0.9},
            {'startSeconds': 2.4, 'endSeconds': 2.8, 'durationSeconds': 0.4, 'text': '你回来了', 'confidence': 0.8},
        ])
        self.assertEqual(lines, [{'startSeconds': 2.0, 'endSeconds': 2.8, 'text': '你回来了', 'confidence': 0.85}])

    def test_merges_same_text_across_a_short_sampling_split(self):
        lines = RUNNER.merge_lines([
            {'startSeconds': 0.24, 'endSeconds': 0.82, 'durationSeconds': 0.58, 'text': '我只能帮你这么多了', 'confidence': 0.9},
            {'startSeconds': 1.20, 'endSeconds': 1.92, 'durationSeconds': 0.72, 'text': '我只能帮你这么多了', 'confidence': 0.8},
        ])
        self.assertEqual(lines, [{'startSeconds': 0.24, 'endSeconds': 1.92, 'text': '我只能帮你这么多了', 'confidence': 0.85}])

    def test_keeps_same_text_separated_by_a_longer_blank_interval(self):
        lines = RUNNER.merge_lines([
            {'startSeconds': 10.0, 'endSeconds': 10.4, 'durationSeconds': 0.4, 'text': '同行文字', 'confidence': 0.9},
            {'startSeconds': 10.86, 'endSeconds': 11.3, 'durationSeconds': 0.44, 'text': '同行文字', 'confidence': 0.8},
        ])
        self.assertEqual(len(lines), 2)

    def test_keeps_a_contiguous_volatile_nonblank_run_as_an_ocr_candidate(self):
        frame_size = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        frames = []
        frames.extend([bytes([255]) * frame_size] * 3)
        for offset in range(6):
            frame = bytearray(frame_size)
            frame[offset * 10:(offset + 1) * 10] = b'\xff' * 10
            frames.append(bytes(frame))
        frames.extend([bytes([255]) * frame_size] * 3)
        raw = b''.join(frames)
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=raw)
        try:
            candidates, sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=5,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(sampled_frames, 12)
        self.assertEqual(candidates, [
            {'startSeconds': 0.0, 'endSeconds': 0.6, 'durationSeconds': 0.6, 'representativeSeconds': 0.3},
            {'startSeconds': 0.6, 'endSeconds': 1.8, 'durationSeconds': 1.2, 'representativeSeconds': 1.2},
            {'startSeconds': 1.8, 'endSeconds': 2.4, 'durationSeconds': 0.6, 'representativeSeconds': 2.1},
        ])

    def test_keeps_leading_volatile_windows_before_the_first_stable_candidate(self):
        frame_size = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        frames = []
        for offset in range(6):
            frame = bytearray(frame_size)
            frame[offset * 10:(offset + 1) * 10] = b'\xff' * 10
            frames.append(bytes(frame))
        frames.extend([bytes([255]) * frame_size] * 3)
        raw = b''.join(frames)
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=raw)
        try:
            candidates, sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=5,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(sampled_frames, 9)
        self.assertEqual(candidates[:3], [
            {'startSeconds': 0.0, 'endSeconds': 0.4, 'durationSeconds': 0.4, 'representativeSeconds': 0.2, 'shortClipCandidate': True},
            {'startSeconds': 0.4, 'endSeconds': 0.8, 'durationSeconds': 0.4, 'representativeSeconds': 0.6, 'shortClipCandidate': True},
            {'startSeconds': 0.8, 'endSeconds': 1.2, 'durationSeconds': 0.4, 'representativeSeconds': 1.0, 'shortClipCandidate': True},
        ])
        self.assertEqual(candidates[3], {
            'startSeconds': 1.2, 'endSeconds': 1.8, 'durationSeconds': 0.6, 'representativeSeconds': 1.5, 'shortClipCandidate': True,
        })

    def test_uses_the_brightest_sample_for_an_ultra_short_all_blank_clip(self):
        frame_size = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        frames = [bytes([0]) * frame_size for _ in range(7)]
        bright = bytearray(frames[2])
        bright[:6] = b'\xff' * 6
        frames[2] = bytes(bright)
        raw = b''.join(frames)
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=raw)
        try:
            candidates, sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=5,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(sampled_frames, 7)
        self.assertEqual(candidates, [
            {'startSeconds': 0.0, 'endSeconds': 0.4, 'durationSeconds': 0.4, 'representativeSeconds': 0.1, 'shortClipFallback': True, 'shortClipCandidate': True},
            {'startSeconds': 0.2, 'endSeconds': 0.8, 'durationSeconds': 0.6, 'representativeSeconds': 0.5, 'shortClipFallback': True, 'shortClipCandidate': True},
        ])

    def test_accepts_one_paddle_detected_line_for_the_bounded_short_clip_fallback(self):
        box = self.rectangle(120, 1410, 960, 1510)
        selected, stats = RUNNER.select_subtitle_boxes([{
            'candidateIndex': 0,
            'candidate': {'shortClipCandidate': True},
            'frameWidth': 1080,
            'frameHeight': 1920,
            'boxes': [box],
        }])

        self.assertEqual(selected, {0: [box]})
        self.assertEqual(stats['trackedSubtitleLineCount'], 1)
        self.assertEqual(stats['selectedTextBoxCount'], 1)

    def test_keeps_the_single_detected_line_rejected_without_the_short_clip_marker(self):
        box = self.rectangle(120, 1410, 960, 1510)
        selected, stats = RUNNER.select_subtitle_boxes([{
            'candidateIndex': 0,
            'candidate': {},
            'frameWidth': 1080,
            'frameHeight': 1920,
            'boxes': [box],
        }])

        self.assertEqual(selected, {})
        self.assertEqual(stats['selectedTextBoxCount'], 0)

    def test_rejects_a_horizontally_separate_print_in_the_same_vertical_subtitle_band(self):
        subtitle = self.rectangle(400, 1410, 900, 1510)
        clothing_print = self.rectangle(20, 1450, 320, 1550)
        detections = [
            {'candidateIndex': index, 'candidate': {}, 'frameWidth': 1080, 'frameHeight': 1920, 'boxes': [subtitle, clothing_print]}
            for index in range(2)
        ]

        selected, stats = RUNNER.select_subtitle_boxes(detections)

        self.assertEqual(selected, {0: [subtitle], 1: [subtitle]})
        self.assertEqual(stats['trackedSubtitleLineCount'], 1)

    def test_does_not_merge_a_horizontally_separate_print_into_the_subtitle_track(self):
        subtitle = self.rectangle(400, 1410, 900, 1510)
        clothing_print = self.rectangle(20, 1450, 320, 1550)
        subtitle_group = RUNNER.visual_line_groups([subtitle], 1080, 1920)[0]
        print_group = RUNNER.visual_line_groups([clothing_print], 1080, 1920)[0]
        track = {'samples': [{**subtitle_group, 'candidateIndex': 0}], 'lastCandidateIndex': 0}

        self.assertFalse(RUNNER.can_join_visual_track(print_group, track))
        self.assertTrue(RUNNER.can_join_visual_track(subtitle_group, track))

    def test_rejects_a_diagonal_clothing_print_before_subtitle_track_selection(self):
        subtitle = self.rectangle(400, 1410, 900, 1510)
        diagonal_print = [[286, 1520], [427, 1410], [468, 1429], [327, 1553]]

        groups = RUNNER.visual_line_groups([subtitle, diagonal_print], 1080, 1920)

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['records'][0]['box'], subtitle)

    def test_rejects_a_shallow_diagonal_patch_that_crosses_a_subtitle_band(self):
        subtitle = self.rectangle(297, 54, 781, 134)
        patch = [[814, 79], [983, 36], [1000, 84], [831, 126]]

        groups = RUNNER.visual_line_groups([subtitle, patch], 1080, 192)

        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['records'][0]['box'], subtitle)

    def test_marks_an_existing_short_clip_candidate_for_the_single_frame_gate(self):
        frame_size = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        raw = b''.join([bytes([255]) * frame_size for _ in range(7)])
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=raw)
        try:
            candidates, _sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=5,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertTrue(candidates[0]['shortClipCandidate'])

    def test_keeps_a_two_sample_subtitle_replacement_between_stable_states(self):
        frame_size = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        stable = bytes([255]) * frame_size
        first_variant = bytearray(stable)
        first_variant[0:1000] = b'\x00' * 1000
        second_variant = bytearray(first_variant)
        second_variant[0:2000] = b'\x00' * 2000
        blank = bytes(frame_size)
        raw = b''.join([stable] * 3 + [bytes(first_variant), bytes(second_variant)] + [blank] * 3)
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=raw)
        try:
            candidates, _sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=5,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(candidates[1], {
            'startSeconds': 0.6,
            'endSeconds': 1.0,
            'durationSeconds': 0.4,
            'representativeSeconds': 0.8,
            'shortClipCandidate': True,
        })

    def test_allows_an_empty_sparse_probe_without_treating_it_as_a_broken_timeline(self):
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0, stdout=b'')
        try:
            candidates, sampled_frames = RUNNER.temporal_candidates(
                {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                sample_rate=0.1,
                allow_empty=True,
            )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(candidates, [])
        self.assertEqual(sampled_frames, 0)

    def test_retries_a_single_frame_short_probe_at_a_bounded_rate(self):
        calls = []
        original_temporal_candidates = RUNNER.temporal_candidates

        def temporal_candidates(request, started=None, sample_rate=RUNNER.FRAME_RATE, allow_empty=False):
            calls.append(sample_rate)
            if sample_rate < 1:
                return [{'startSeconds': 0, 'endSeconds': 0.5, 'durationSeconds': 0.5, 'representativeSeconds': 0.25}], 1
            return [{'startSeconds': 0, 'endSeconds': 0.5, 'durationSeconds': 0.5, 'representativeSeconds': 0.25}], 2

        RUNNER.temporal_candidates = temporal_candidates
        try:
            with TemporaryDirectory() as folder:
                with patch.object(RUNNER, 'extract_representative_frames', return_value=[]), patch.object(RUNNER, 'detect_frame_paths', return_value=([], 0, 0)), patch.object(RUNNER, 'select_subtitle_boxes', return_value=({}, {'visualLineGroupCount': 0, 'trackedSubtitleLineCount': 0, 'selectedTextBoxCount': 0})), patch.object(RUNNER, 'proposed_episode_region', return_value=None):
                    _region, stats = RUNNER.probe_episode_region_at_rate(
                        {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': None},
                        Path(folder),
                        0,
                        RUNNER.REGION_PROBE_FRAME_RATE,
                    )
            self.assertEqual(calls, [RUNNER.REGION_PROBE_FRAME_RATE, 2])
            self.assertEqual(stats['episodeRegionProbeSampleRate'], 2)
        finally:
            RUNNER.temporal_candidates = original_temporal_candidates

    def test_reads_a_single_text_recognition_result(self):
        class Output:
            json = {'res': {'rec_text': '区域内字幕', 'rec_score': 0.94}}

        self.assertEqual(RUNNER.read_recognition(Output()), ('区域内字幕', 0.94))

    def test_keeps_text_detection_boxes_without_semantic_filtering(self):
        class Output:
            json = {'res': {'dt_polys': [[[1, 2], [3, 2], [3, 4], [1, 4]]]}}

        self.assertEqual(RUNNER.detected_boxes(Output()), [[[1, 2], [3, 2], [3, 4], [1, 4]]])

    def test_selects_the_stable_dominant_subtitle_line_without_narrowing_its_width(self):
        subtitle_boxes = [
            self.rectangle(24, 20, 976, 92),
            self.rectangle(12, 22, 988, 94),
            self.rectangle(0, 18, 1000, 90),
        ]
        detections = []
        for candidate_index, subtitle in enumerate(subtitle_boxes):
            detections.append({
                'candidateIndex': candidate_index,
                'frameWidth': 1000,
                'frameHeight': 140,
                'boxes': [subtitle, self.rectangle(720, 52, 835, 86), self.rectangle(210, 92, 360, 128)],
            })

        selected, stats = RUNNER.select_subtitle_boxes(detections)

        self.assertEqual(selected, {index: [box] for index, box in enumerate(subtitle_boxes)})
        self.assertEqual(stats['trackedSubtitleLineCount'], 1)
        self.assertEqual(stats['selectedTextBoxCount'], 3)

    def test_groups_same_line_fragments_but_keeps_different_sized_overlay_text_out(self):
        left = self.rectangle(160, 30, 430, 76)
        right = self.rectangle(444, 31, 810, 77)
        detections = [
            {'candidateIndex': index, 'frameWidth': 1000, 'frameHeight': 140, 'boxes': [left, right, self.rectangle(820, 55, 940, 82)]}
            for index in range(3)
        ]

        selected, _stats = RUNNER.select_subtitle_boxes(detections)

        self.assertEqual(selected, {index: [left, right] for index in range(3)})

    def test_does_not_merge_an_overlapping_but_off_baseline_overlay_into_a_subtitle_line(self):
        subtitle = self.rectangle(140, 30, 800, 100)
        overlay = self.rectangle(720, 55, 880, 105)
        detections = [
            {'candidateIndex': index, 'frameWidth': 1000, 'frameHeight': 140, 'boxes': [subtitle, overlay]}
            for index in range(3)
        ]

        selected, _stats = RUNNER.select_subtitle_boxes(detections)

        self.assertEqual(selected, {index: [subtitle] for index in range(3)})

    def test_does_not_select_text_without_a_stable_visual_track(self):
        detections = [
            {'candidateIndex': 0, 'frameWidth': 1000, 'frameHeight': 140, 'boxes': [self.rectangle(200, 15, 850, 70)]},
            {'candidateIndex': 1, 'frameWidth': 1000, 'frameHeight': 140, 'boxes': [self.rectangle(100, 75, 900, 132)]},
            {'candidateIndex': 2, 'frameWidth': 1000, 'frameHeight': 140, 'boxes': [self.rectangle(40, 5, 960, 48)]},
        ]

        selected, stats = RUNNER.select_subtitle_boxes(detections)

        self.assertEqual(selected, {})
        self.assertEqual(stats['trackedSubtitleLineCount'], 0)

    def test_enforces_the_five_minute_limit(self):
        with self.assertRaises(TimeoutError):
            RUNNER.ensure_within_deadline(0, RUNNER.MAX_RUN_SECONDS + 0.01)

    def test_calculates_remaining_time_from_the_runner_deadline(self):
        original = RUNNER.time.monotonic
        RUNNER.time.monotonic = lambda: 100.0
        try:
            self.assertEqual(RUNNER.remaining_seconds(40.0), 360.0)
        finally:
            RUNNER.time.monotonic = original

    def test_uses_the_verified_cpu_thread_count_for_detection_and_recognition(self):
        constructor_options = {}

        class Detection:
            def __init__(self, **options):
                constructor_options['detection'] = options

        class Recognition:
            def __init__(self, **options):
                constructor_options['recognition'] = options

        original_paddleocr = sys.modules.get('paddleocr')
        sys.modules['paddleocr'] = SimpleNamespace(TextDetection=Detection, TextRecognition=Recognition)
        try:
            with TemporaryDirectory() as directory:
                started = RUNNER.time.monotonic()
                RUNNER.detect_frame_paths([], started)
                RUNNER.recognized_lines(
                    {'videoPath': 'episode.mp4', 'ffmpegPath': 'ffmpeg', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                    [],
                    Path(directory),
                    started,
                )
        finally:
            if original_paddleocr is None:
                del sys.modules['paddleocr']
            else:
                sys.modules['paddleocr'] = original_paddleocr

        self.assertEqual(constructor_options['detection']['cpu_threads'], RUNNER.CPU_THREADS)
        self.assertEqual(constructor_options['recognition']['cpu_threads'], RUNNER.CPU_THREADS)

    def test_extracts_representative_frames_in_candidate_order_when_parallelized(self):
        original_run_process = RUNNER.run_process
        def create_frame(command, *_args):
            Path(command[-1]).write_bytes(b'frame')
            return SimpleNamespace(returncode=0)

        RUNNER.run_process = create_frame
        try:
            with TemporaryDirectory() as directory:
                candidates = [
                    {'representativeSeconds': 0.2},
                    {'representativeSeconds': 1.4},
                    {'representativeSeconds': 2.8},
                ]
                frames = RUNNER.extract_representative_frames(
                    {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                    candidates,
                    Path(directory),
                    RUNNER.time.monotonic(),
                )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual([(index, candidate) for index, candidate, _path in frames], list(enumerate(candidates)))
        self.assertEqual([path.name for _index, _candidate, path in frames], ['00001.png', '00002.png', '00003.png'])

    def test_ignores_a_successful_ffmpeg_exit_when_no_frame_file_was_created(self):
        original_run_process = RUNNER.run_process
        RUNNER.run_process = lambda *_args: SimpleNamespace(returncode=0)
        try:
            with TemporaryDirectory() as directory:
                frames = RUNNER.extract_representative_frames(
                    {'ffmpegPath': 'ffmpeg', 'videoPath': 'episode.mp4', 'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}},
                    [{'representativeSeconds': 75.0}],
                    Path(directory),
                    RUNNER.time.monotonic(),
                )
        finally:
            RUNNER.run_process = original_run_process

        self.assertEqual(frames, [])

    def test_keeps_a_merged_cue_intact_before_boundary_refinement(self):
        lines = RUNNER.merge_lines([
            {'candidateIndex': 3, 'startSeconds': 1.0, 'endSeconds': 1.8, 'durationSeconds': 0.8, 'text': '连续字幕', 'confidence': 0.9},
            {'candidateIndex': 4, 'startSeconds': 1.8, 'endSeconds': 3.0, 'durationSeconds': 1.2, 'text': '连续字幕', 'confidence': 0.9},
        ], retain_candidate_indexes=True)

        self.assertEqual(lines, [{'startSeconds': 1.0, 'endSeconds': 3.0, 'text': '连续字幕', 'confidence': 0.9, '_candidateIndexes': [3, 4]}])

    def test_refines_only_a_merged_cue_boundary_with_local_stable_frames(self):
        length = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        reference = bytearray(length)
        reference[100:160] = b'\xff' * 60
        blank = bytes(length)
        start_frames = [blank] * 4 + [bytes(reference)] * 6
        end_frames = [bytes(reference)] * 7 + [blank] * 3

        self.assertEqual(RUNNER.refine_boundary_from_frames(1.0, 0.8, start_frames, bytes(reference), 'start'), 0.96)
        self.assertEqual(RUNNER.refine_boundary_from_frames(3.0, 2.8, end_frames, bytes(reference), 'end'), 3.08)

    def test_refines_from_a_coarse_interval_edge_to_the_first_confirmed_subtitle_shape(self):
        length = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        reference = bytearray(length)
        reference[100:160] = b'\xff' * 60
        frames = [bytes(length)] * 10 + [bytes(reference)] * 5

        self.assertEqual(RUNNER.refine_boundary_from_frames(1.0, 1.0, frames, bytes(reference), 'start'), 1.4)

    def test_refines_a_start_boundary_back_before_the_coarse_sampling_edge(self):
        length = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        reference = bytearray(length)
        reference[100:160] = b'\xff' * 60
        blank = bytes(length)
        frames = [blank] * 4 + [bytes(reference)] * 6

        self.assertEqual(RUNNER.refine_boundary_from_frames(1.0, 0.8, frames, bytes(reference), 'start'), 0.96)

    def test_start_refinement_window_includes_the_full_coarse_sampling_interval(self):
        line = {'startSeconds': 1.0, 'endSeconds': 2.0, 'text': '短字幕', 'confidence': 0.9, '_candidateIndexes': [0]}
        detections = [{'candidateIndex': 0, 'candidate': {'representativeSeconds': 1.5}, 'framePath': Path('representative.png'), 'frameHeight': 140}]
        length = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        captured = []
        original_extract = RUNNER.extract_refinement_frames
        original_reference = RUNNER.refinement_reference
        RUNNER.extract_refinement_frames = lambda _request, start, end, _band, _started: (captured.append((start, end)) or (start, []))
        RUNNER.refinement_reference = lambda *_args: bytes(length)
        try:
            RUNNER.refine_single_boundary({'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}}, line, detections, {'top': 40, 'bottom': 90, 'frameHeight': 140}, RUNNER.time.monotonic(), 'start')
        finally:
            RUNNER.extract_refinement_frames = original_extract
            RUNNER.refinement_reference = original_reference

        self.assertEqual(captured[0][0], 0.8)

    def test_retries_only_the_unresolved_boundary_with_the_full_confirmed_region(self):
        line = {'startSeconds': 1.0, 'endSeconds': 2.0, 'text': '短字幕', 'confidence': 0.9, '_candidateIndexes': [0]}
        detections = [{'candidateIndex': 0, 'candidate': {'representativeSeconds': 1.5}, 'framePath': Path('representative.png'), 'frameHeight': 140}]
        selected = {0: [self.rectangle(200, 45, 800, 90)]}
        original_pair = RUNNER.refine_line_boundaries
        original_single = RUNNER.refine_single_boundary
        calls = []
        RUNNER.refine_line_boundaries = lambda *_args: (1.0, 1.92, 12)
        def retry(_request, _line, _detections, band, _started, side):
            calls.append((side, band['top'], band['bottom']))
            return (1.04, 8)
        RUNNER.refine_single_boundary = retry
        try:
            refined, stats = RUNNER.refine_merged_lines({'region': {'x': 0, 'y': 0, 'width': 1, 'height': 1}}, [line], detections, selected, RUNNER.time.monotonic())
        finally:
            RUNNER.refine_line_boundaries = original_pair
            RUNNER.refine_single_boundary = original_single

        self.assertEqual(calls, [('start', 0, 140)])
        self.assertEqual(refined[0]['startSeconds'], 1.04)
        self.assertEqual(refined[0]['endSeconds'], 1.92)
        self.assertEqual(stats['refinementSampledFrameCount'], 20)

    def test_keeps_the_coarse_boundary_when_local_visual_evidence_is_not_stable(self):
        length = RUNNER.THUMBNAIL_WIDTH * RUNNER.THUMBNAIL_HEIGHT
        reference = bytes([255]) * length

        self.assertIsNone(RUNNER.refine_boundary_from_frames(1.0, 0.8, [bytes(length)], reference, 'start'))

    def test_proposes_a_full_width_episode_region_from_a_stable_text_band(self):
        box = self.rectangle(120, 1410, 960, 1510)
        detections = [
            {'candidateIndex': index, 'frameWidth': 1080, 'frameHeight': 1920, 'boxes': [box]}
            for index in range(3)
        ]

        region = RUNNER.proposed_episode_region(detections, {index: [box] for index in range(3)})

        self.assertEqual(region['x'], 0)
        self.assertEqual(region['width'], 1)
        self.assertGreater(region['y'], 0.7)
        self.assertLess(region['y'], 0.8)
        self.assertGreater(region['height'], 0.08)

    def test_keeps_the_user_region_when_the_sparse_probe_already_covers_it(self):
        saved = {'x': 0, 'y': 0.6269, 'width': 1, 'height': 0.0741}
        covering_probe = {'x': 0, 'y': 0.619792, 'width': 1, 'height': 0.0875}
        displaced_probe = {'x': 0, 'y': 0.659896, 'width': 1, 'height': 0.107292}

        self.assertTrue(RUNNER.proposed_region_covers_saved_region(covering_probe, saved))
        self.assertFalse(RUNNER.proposed_region_covers_saved_region(displaced_probe, saved))
        self.assertFalse(RUNNER.can_use_episode_override(covering_probe, saved, {'episodeRegionProbeSelectedTextBoxCount': 15}))
        self.assertFalse(RUNNER.can_use_episode_override(displaced_probe, saved, {'episodeRegionProbeSelectedTextBoxCount': 5}))
        self.assertTrue(RUNNER.can_use_episode_override(displaced_probe, saved, {'episodeRegionProbeSelectedTextBoxCount': 15}))

    def test_confirms_only_a_displaced_region_with_insufficient_coarse_evidence(self):
        saved = {'x': 0, 'y': 0.6269, 'width': 1, 'height': 0.0741}
        displaced_probe = {'x': 0, 'y': 0.659896, 'width': 1, 'height': 0.107292}

        self.assertTrue(RUNNER.should_confirm_episode_region(displaced_probe, saved, {'episodeRegionProbeSelectedTextBoxCount': 3}))
        self.assertFalse(RUNNER.should_confirm_episode_region(displaced_probe, saved, {'episodeRegionProbeSelectedTextBoxCount': 6}))
        self.assertFalse(RUNNER.should_confirm_episode_region(None, saved, {'episodeRegionProbeSelectedTextBoxCount': 0}))

    def test_confirms_an_unproposed_band_only_when_the_sparse_pass_saw_real_text(self):
        self.assertFalse(RUNNER.should_confirm_episode_region(None, None, {
            'episodeRegionProbeSelectedTextBoxCount': 0,
            'episodeRegionProbeDetectedFrameCount': 0,
            'episodeRegionProbeDetectedBoxCount': 0,
        }))
        self.assertTrue(RUNNER.should_confirm_episode_region(None, None, {
            'episodeRegionProbeSelectedTextBoxCount': 0,
            'episodeRegionProbeDetectedFrameCount': 2,
            'episodeRegionProbeDetectedBoxCount': 6,
        }))

    def test_uses_a_lower_gate_only_for_a_stable_high_frequency_confirmation(self):
        self.assertEqual(RUNNER.probe_box_requirement({
            'episodeRegionProbeSampledFrameCount': 3,
            'episodeRegionProbeShortClipFallback': 1,
        }), 1)
        self.assertEqual(RUNNER.probe_box_requirement({
            'episodeRegionProbeSampledFrameCount': 25,
            'episodeRegionProbeConfirmationUsed': 1,
            'episodeRegionProbeTrackedSubtitleLineCount': 1,
        }), 4)
        self.assertEqual(RUNNER.probe_box_requirement({
            'episodeRegionProbeSampledFrameCount': 25,
            'episodeRegionProbeConfirmationUsed': 1,
            'episodeRegionProbeTrackedSubtitleLineCount': 0,
        }), 6)

    def test_automatic_region_mode_accepts_a_stable_machine_region_without_saved_baseline(self):
        proposed = {'x': 0, 'y': 0.66, 'width': 1, 'height': 0.1}
        evidence = {'episodeRegionProbeSelectedTextBoxCount': 6}
        self.assertTrue(RUNNER.can_use_episode_override(proposed, None, evidence))
        self.assertFalse(RUNNER.should_confirm_episode_region(proposed, None, evidence))

    def test_automatic_region_mode_requires_confirmation_when_probe_evidence_is_sparse(self):
        proposed = {'x': 0, 'y': 0.66, 'width': 1, 'height': 0.1}
        self.assertFalse(RUNNER.can_use_episode_override(proposed, None, {'episodeRegionProbeSelectedTextBoxCount': 5}))
        self.assertTrue(RUNNER.should_confirm_episode_region(proposed, None, {'episodeRegionProbeSelectedTextBoxCount': 5}))

    def test_uses_the_denser_confirmation_rate_for_a_sparse_automatic_probe(self):
        coarse_region = {'x': 0, 'y': 0.66, 'width': 1, 'height': 0.1}
        confirmation_region = {'x': 0, 'y': 0.658, 'width': 1, 'height': 0.11}
        coarse_stats = {'episodeRegionProbeSelectedTextBoxCount': 3, 'episodeRegionProbeSampledFrameCount': 13}
        confirmation_stats = {'episodeRegionProbeSelectedTextBoxCount': 12, 'episodeRegionProbeSampledFrameCount': 66}

        with TemporaryDirectory() as folder, patch.object(RUNNER, 'probe_episode_region_at_rate', side_effect=[(coarse_region, coarse_stats), (confirmation_region, confirmation_stats)]) as probe:
            region, stats = RUNNER.probe_episode_region({'region': None}, Path(folder), 0)

        self.assertEqual(region, confirmation_region)
        self.assertEqual(stats['episodeRegionProbeConfirmationUsed'], 1)
        self.assertEqual([call.args[3] for call in probe.call_args_list], [RUNNER.REGION_PROBE_FRAME_RATE, RUNNER.REGION_PROBE_CONFIRMATION_FRAME_RATE])
        self.assertEqual(len(probe.call_args_list[0].args), 4)
        self.assertEqual(probe.call_args_list[1].args[4], coarse_region)

    def test_uses_full_frame_confirmation_when_sparse_evidence_has_no_coarse_region(self):
        confirmation_region = {'x': 0, 'y': 0.615625, 'width': 1, 'height': 0.095833}
        coarse_stats = {'episodeRegionProbeSelectedTextBoxCount': 0, 'episodeRegionProbeDetectedFrameCount': 2, 'episodeRegionProbeDetectedBoxCount': 6}
        confirmation_stats = {'episodeRegionProbeSelectedTextBoxCount': 4, 'episodeRegionProbeDetectedFrameCount': 4, 'episodeRegionProbeDetectedBoxCount': 4, 'episodeRegionProbeTrackedSubtitleLineCount': 1}

        with TemporaryDirectory() as folder, patch.object(RUNNER, 'probe_episode_region_at_rate', side_effect=[(None, coarse_stats), (confirmation_region, confirmation_stats)]) as probe:
            region, stats = RUNNER.probe_episode_region({'region': None}, Path(folder), 0)

        self.assertEqual(region, confirmation_region)
        self.assertEqual(stats['episodeRegionProbeConfirmationUsed'], 1)
        self.assertEqual(stats['episodeRegionProbeSelectedTextBoxCount'], 4)
        self.assertTrue(RUNNER.can_use_episode_override(region, None, stats))
        self.assertIsNone(probe.call_args_list[1].args[4])


if __name__ == '__main__':
    unittest.main()
