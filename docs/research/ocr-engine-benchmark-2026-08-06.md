# OCR Engine Benchmark Research (2026-08-06)

## Scope and Decision

This is an evidence record for local hard-subtitle OCR. It evaluates whether a local engine can independently produce visual subtitle timing and text. It does not change the product, UI, database, existing OCR executor, source media, or cloud-provider behaviour.

**Decision: continue evaluating a detector-plus-recognizer architecture; do not integrate, bundle, or distribute any candidate now.**

The decision is technical and distribution-related:

- VideoSubFinder can independently find visual timing on this sample, and PaddleOCR can recognize many corresponding frames. The composed compatibility run is useful research evidence, not a releasable product integration.
- The stock VSE runner has reproducibility defects; the compatibility runner also shows candidates from an unconfirmed broad ROI, empty segments, over-splitting, and recognition errors.
- The VSE payload contains a VideoSubFinder executable and un-audited DLLs. Its root Apache-2.0 file does not prove that the whole payload may be distributed under Apache-2.0.

## Fixed Protocol

| Item | Value |
|---|---|
| Read-only source | `E:\剪辑盘\20260623_短剧切片投流\《嗨,被纯情少爷盯上了》\标准版\02.mp4` |
| Staged copy | Temporary ASCII-only path under `%LOCALAPPDATA%\ShortDramaOcrVseAudit\input\episode02.mp4` |
| Source/copy SHA-256 | `024E9A2F5868D56871247AE70436785BEF5B0388417B0759CF28A770011D90A5` for both files |
| Video | 1072 x 1920, 25 fps, 172.88 s |
| Fixed ROI | Normalized `{ "x": 0.08, "y": 0.58, "width": 0.84, "height": 0.17 }`; pixels `86,1114` to `986,1440` |
| Privacy | Local decoding and local recognition only. No media upload and no cloud OCR request. |
| Imported SRT | `字幕\02.srt` was read only after visual results existed, for post-hoc timing comparison. It never selected frames, supplied timing/text, or merged cues. |

All experimental source, dependencies, frames, models and JSON results are temporary. The source video and SRT remain read-only.

## Candidate and License Audit

| Candidate | Observed source / payload | Status for local research | Status for product distribution |
|---|---|---|---|
| VSE (`YaoFANGUK/video-subtitle-extractor`, `85746f7df5bf85978fd05f3ca6ce66e321a87a72`) | Root `LICENSE` is Apache-2.0. README says Windows/Linux/macOS detection uses VideoSubFinder. Checkout ships `backend/subfinder/windows/VideoSubFinderWXW.exe`, FFmpeg/OpenCV/CUDA DLLs and MSVC runtime DLLs. | Allowed only in the isolated audit directory. | **Not approved.** Root Apache text is insufficient for its bundled third-party executable/DLL payload. |
| VideoSubFinder (`SWHL/VideoSubFinder`, `d6ca256a87d2e3ab71c4544bc7379fb5475fcf09`) | Root `LICENSE` is GNU GPL version 2. Its source also contains heterogeneous per-file notices, including public-domain/non-commercial wording in `Components/FFMPEGVideo/*` and third-party copyright headers. | Allowed for local inspection and a one-off local run. | **Not approved.** GPLv2 source-offer/notice duties and third-party file/DLL provenance are not fully audited. The repository root does not establish whether every work is v2-only or v2-or-later. |
| PaddleOCR 3.4.1 / PaddlePaddle 3.3.1 | Installed in the isolated Python runtime; local PP-OCRv5 mobile models used by VSE. Their own packaging/model licence and Windows redistribution still need a separate release audit. | Used as recognizer benchmark. | Not an integration decision. |
| tesseract.js 7.0.0 | Isolated local JavaScript worker, used only as a Tesseract-family comparison. Its Chinese language-data run emitted loading warnings and poor output. | Used as comparison. | Not a replacement for the product's native Tesseract path. |

### Distribution-path conclusion

| Path | Current conclusion |
|---|---|
| Local isolated research | Permitted for this audit; nothing was shipped or published. |
| User self-installs an external tool | Potentially feasible only as a documented external-tool boundary: the product must not copy, bundle, or patch the tool; the user must choose and install it separately. A release-time legal review is still required for invocation/adapter design. |
| Ship VSE/VideoSubFinder with this product | Not approved. The package carries a GPLv2 detector and DLLs without a complete provenance/notice/source-offer audit. |
| Make the whole product GPL | Not selected and not proven necessary. GPL scope depends on the final integration and distribution relationship; this requires a licence decision and legal review before any public release. It is not a shortcut that makes the bundled payload automatically compliant. |

This is engineering risk analysis, not legal advice. Any distribution route requires release-time licence review of exact source commits, binaries, models, notices, source-offer obligations and integration architecture.

## VideoSubFinder + VSE Research Run

### What actually ran

The Windows VideoSubFinder binary from the VSE checkout processed the staged video and wrote 80 visual candidate segments plus RGB/ILA/ISA frames. Its `raw_vsf.srt` contains only `sub duration: ...`; those are genuine picture-detection time ranges, not final text cues.

The stock VSE orchestration did not qualify as a Windows-reproducible runner:

1. `backend/main.py` declared `manage_process(pid)` without `self`, causing an immediate `TypeError`.
2. After that one-line isolated repair, the OCR loop stalled with oneDNN/MKLDNN. Disabling MKLDNN in the isolated copy let the model run.
3. The original runner then re-opened the video with `cv2.CAP_PROP_POS_MSEC`; the extracted frame and the re-read frame diverged. For example a visual candidate at 8.8 s was `PUA`, while the re-read path returned text from around 17.6 s. That output is invalid and retained only as failure evidence.

The compatibility runner instead performed only the architecture that was being tested: it read the VideoSubFinder-exported RGB image for each detector-derived filename, parsed the time range from that filename, and ran the local Paddle recognizer on that image. It did not read ASR/import data.

| Result | Value |
|---|---:|
| Detector-derived segments | 80 |
| RGB-frame OCR non-empty | 71 |
| RGB-frame OCR empty | 9 |
| Recognition elapsed time | 47.102 s |
| First / last detected segment | 8.800 s / 168.919 s |
| Post-hoc imported-SRT comparison | 75 of 80 detector segments overlap at least one of 63 imported cues; 5 do not. This is not visual ground truth. |

The five non-overlapping segments are indexes 7, 8, 18, 73 and 74. A later direct check against the same SHA-256 source could not reproduce the earlier claim that `26.760–27.039` contained a cemetery name; that claim is withdrawn and must not be used as evidence. The separately reproduced non-subtitle text case is recorded in the next round at 29.4 s; it occurred inside an unconfirmed broad ROI and cannot satisfy the required “subtitle with no ASR counterpart” case.

## Rebuilt Fixed-sample Controls

Both controls decoded the staged video into exactly the same 116 cropped 1.5-second frames before recognition. Frame SHA-256 values are recorded in the temporary result JSON. Neither control read the imported SRT.

Temporary evidence paths before cleanup:

- `%LOCALAPPDATA%\ShortDramaOcrVseAudit\vse\output\episode02\subtitle\raw_vsf.srt` and `RGBImages\`: detector output.
- `%LOCALAPPDATA%\ShortDramaOcrVseAudit\results-vsf-rgb-vse-ocr.json`: detector-frame compatibility OCR output.
- `%LOCALAPPDATA%\ShortDramaOcrVseAudit\results-vsf-vse-sequential.json`: invalid original re-read runner failure evidence.
- `%LOCALAPPDATA%\ShortDramaOcrVseAudit\results-fixed-sample-paddle.json` and `results-fixed-sample-tesseractjs.json`: rebuilt control outputs.
- `%LOCALAPPDATA%\ShortDramaOcrVseAudit\results-vsf-posthoc-import-comparison.json`: post-hoc temporal overlap only.

| Candidate | Runtime / method | Non-empty of 116 frames | Elapsed | Outcome |
|---|---|---:|---:|---|
| PaddleOCR | Python 3.12.10, PaddlePaddle 3.3.1 CPU, PaddleOCR 3.4.1, PP-OCRv5 mobile, MKLDNN disabled | 64 | 65.135 s | Text recognition is useful, but 1.5-second sampling cannot independently provide onset/offset segments. |
| Tesseract-family | tesseract.js 7.0.0 local worker over the same crops | 111 | 24.640 s | Unusable: emits text on a no-subtitle frame and has low-confidence nonsense across the sample. The worker also emitted Chinese language-data loading warnings. |

Representative manual checks:

| Case | Visual observation | Paddle fixed sample | VideoSubFinder RGB + Paddle | Assessment |
|---|---|---|---|---|
| Narrative hard subtitle, 9.0 s | `PUA` visible | `PUA` (0.9979) | `PUA`, 8.800–9.959 (0.9959) | Correct recognition; detector timing exists. |
| Normal dialogue, 90.0 s | `我公司还有个会` visible | `我公司还有个会` (0.9996) | Same text, 89.200–90.319 (0.9997) | Correct representative result. |
| No hard subtitle, 25.5 s | Cemetery image with no readable subtitle | Empty | No detector candidate at that time | Correct negative sample for Paddle fixed frame. |
| No imported-SRT overlap, prior 26.76 s claim | Not reproducible against the source hash in the follow-up run | Not used as a success claim | Withdrawn as unreliable evidence | Cannot support a product conclusion. |

The detector also over-splits many lines (`爸妈` / `对不起`, `我会` / `鼎立相助`), produces empty segments, and occasionally misrecognizes text. It found no verified real dialogue hard subtitle that lacks an ASR/import counterpart. Therefore the fourth acceptance case is **checked and failed to establish a pass**, not silently omitted.

## Acceptance Gate and Follow-up

The five gates are: independent visual timing, parseable text/time range, reproducible Windows run, acceptable licence/distribution path, and explainable failure behaviour.

| Gate | Current evidence | Result |
|---|---|---|
| Independent visual timing | VideoSubFinder produced 80 detector-originated ranges without ASR/import input. | Partial pass for research architecture. |
| Parseable text and timing | RGB-frame compatibility output has both, but contains empty/over-split/misread cues and text admitted by an unconfirmed broad ROI. | Fail for product quality. |
| Reproducible Windows run | Stock VSE has a method-signature error and timestamp re-read defect; the compatible route needed isolated changes. | Fail. |
| Distribution eligibility | VSE ships GPLv2 VideoSubFinder and un-audited DLLs; no release plan is approved. | Fail. |
| Explainable failure | Failures were identified, but no product-grade adapter/error contract exists. | Fail. |

No candidate may replace the current OCR executor until one local, distributable detector/recognizer path passes every gate on the same protocol. The next research phase must first screen a bounded candidate set for a complete distribution path, then evaluate a single clean run and one reproduction. It must not use ASR timing anchors, and its licence must be approved before product integration is reconsidered.

## Bounded Candidate Screen and POC (2026-08-06)

This follow-up uses the same read-only source, hash, ROI and local-only boundary. The candidate set is deliberately capped at three routes; no route was retuned after its first run.

| Route | Exact source checked | Pre-run licence / packaging result | POC decision |
|---|---|---|---|
| RapidVideOCR | `SWHL/RapidVideOCR` main `4df344a8d7f37e11dbe39cbb9bb8f14676da2fc2`, Apache-2.0 | README explicitly requires `RGBImages` or `TXTImages` produced by VideoSubFinder. It therefore inherits the GPL detector boundary for the intended video-extraction path. | Reference only; not run as a product candidate. |
| RapidOCR | `RapidAI/RapidOCR` main `3efd66a6ba32ff6b7ae1c7a36b8a3cb54c93e53c`, Apache-2.0 | README states the OCR-model copyright belongs to Baidu but does not provide a separate model redistribution grant in the checked repository. | Reference only; no product POC until model distribution terms are evidenced. |
| Tesseract.js + OpenCV | `naptha/tesseract.js` `a1ca80d9e31c34512d0ded75ff8821ddcf3f2f91`, Tesseract `64ed93b68c01f359d924fc1bfcf0d5931eb77211`, tessdata_fast `87416418657359cb625c412a48b6e1d6d41c29bd`, OpenCV `4bee6895ebf48f998ab8cfeccf2b5eb56b9dfa3a` | Checked direct source/package metadata: Tesseract, tessdata_fast, Tesseract.js 7.0.0, Tesseract.js-core 7.0.0 and `opencv-python-headless` 4.10.0.84 all declare Apache-2.0. The exact Python wheel/transitive binary redistribution still requires a release audit. | Eligible for an isolated quality POC only; rejected after the two-run result below. |

Pre-run five-gate admission table. A route stopped by an earlier gate is not installed or rerun; `not run` is a deliberate rejection, not missing work.

| Route | Independent visual timing | Parseable cue output | Windows repeatability | Licence / distribution | Explainable stop | Product-admission result |
|---|---|---|---|---|---|---|
| RapidVideOCR | Blocked: its documented input is VideoSubFinder output, not source video | Not run | Not run | Fail: intended detector path inherits GPL VideoSubFinder | Yes: documented RGBImages/TXTImages dependency | Reject before POC |
| RapidOCR | Fail: OCR recognizer alone is not a video subtitle detector | Not run | Not run | Fail: model redistribution grant not evidenced | Yes: direct README copyright statement | Reject before POC |
| Tesseract.js + OpenCV | Evaluated below | Evaluated below | Evaluated below | Evaluated below | Evaluated below | POC only |

### Tesseract.js + OpenCV POC

- **Clean local installation:** Python 3.12.13 virtual environment with `opencv-python-headless==4.10.0.84` and `numpy==1.26.4`; isolated Node package `tesseract.js@7.0.0`; `chi_sim.traineddata` fetched from the Apache-2.0 `tessdata_fast` repository. No media left the machine.
- **Hardware:** AMD Ryzen 7 8845HS, 8 cores / 16 logical processors; CPU path only. AMD Radeon 780M was not used.
- **Detector:** OpenCV grayscale `220..255` mask and fixed `3 x 9` close operation at 5 fps, fixed ROI, threshold 180 white pixels, maximum temporal gap 0.45 s. It reads no ASR/import data.
- **Recognition:** Tesseract.js reads only one crop chosen from each detector segment. It records raw text and confidence, then merges identical adjacent usable strings; no imported text or time is read.

| Run | Detector observations / segments | Detector time | OCR candidates / non-empty / merged | OCR time |
|---|---:|---:|---:|---:|
| Clean run | 865 / 53 | 22.583 s | 53 / 48 / 16 | 6.934 s |
| Reproduction | 865 / 53 | 21.639 s | 53 / 48 / 16 | 5.429 s |

Both detector time ranges, 53 generated crop hashes, recognition text and recognition confidence were identical between the two runs. Reproducibility alone does not mean quality is acceptable.

| Fixed review case | Direct visual evidence | POC result | Assessment |
|---|---|---|---|
| Narrative hard subtitle, 9.4 s | `PUA` appears in the crop | Detector found 8.8–10.2 s; Tesseract read `4` at confidence 1 | Text fail. |
| Dialogue, 89.8 s | `我公司还有个会` appears in the crop | Detector found 88.6–91.2 s; Tesseract read `有...` at confidence 49 | Text fail. |
| No subtitle, 25.5 s | Funeral scene has no readable subtitle in the ROI | No detector candidate | Correct negative result for this frame. |
| Non-subtitle text, 29.4 s | Tombstone text `沐南` appears inside the overly broad experimental ROI | Detector produced a candidate; Tesseract produced low-confidence noise | This proves the experimental ROI was not a confirmed subtitle region. It is not evidence for a word-meaning classifier. |
| No imported-SRT overlap, 171 s | A late visual text crop exists after imported SRT ends at 168.866 s | Tesseract read `末` at confidence 34; OpenCV random seek also failed near the tail | Not a successful cue and not sufficient proof of a real dialogue subtitle without ASR/import. |

### Five-gate Result and Decision

| Gate | Tesseract.js + OpenCV result |
|---|---|
| Independent visual timing | Pass for this limited detector: 53 time segments came only from video pixels. |
| Parseable text and timing | Fail: title and ordinary dialogue are wrong; only 16 low-threshold merged cues remain. |
| Windows reproducibility | Partial pass: two full runs are deterministic, but tail random seeking failed during manual inspection. |
| Licence / distribution path | Fail for product admission: direct code/model licences are permissive, but the actual OpenCV Python wheel and transitive redistribution plan are not audited. |
| Explainable failure | Pass for research: all failures are recorded; it does not fall back to ASR or cloud OCR. |

**Unique follow-up decision: continue evaluating; do not enter minimal product integration.** The two Apache reference routes have incomplete detector/model distribution paths, and the one eligible local POC fails quality plus product-package eligibility. The current product OCR executor, UI and data contracts remain unchanged.

## Video-level OCR and hard-subtitle extraction screen (2026-08-06)

The product requirement is more precise than generic OCR: it is **video hard-subtitle extraction**. The system must discover text appearance/change/disappearance in consecutive video frames, recognize the text, and produce a subtitle cue with independent start/end times. A service that recognizes one uploaded image is only a recognizer and is not sufficient.

### Direct video-capable services

| Candidate | What the official capability provides | Fit to this product | Decision |
|---|---|---|---|
| Google Cloud Video Intelligence - Text Detection | Accepts a video in Cloud Storage; returns `textAnnotations` with text segments, frame-level observations, bounding boxes and confidence. The returned segment start/end offsets are video-time data, not ASR time. Official reference: `https://cloud.google.com/video-intelligence/docs/text-detection` | Technically the closest verified cloud API to the requirement. It detects text in the whole video, not only dialogue subtitles, so scene text, signs and overlays still require subtitle-region and temporal filtering. It requires source-video upload to Cloud Storage, which conflicts with the current product boundary that only user-confirmed candidate images may leave the machine. | **Isolated POC candidate only.** Do not add to the product or change upload policy yet. |
| Tencent Cloud GeneralBasicOCR | Recognizes an image request. It does not, by itself, provide video scanning, subtitle appearance/disappearance detection, or video-time segments. | Useful only as the recognition stage after a local detector has already produced candidate frames and time windows. It is not a video OCR solution. | **Recognizer stage only; not the complete solution.** |
| Alibaba Cloud / Model Studio image OCR configuration | The currently configured image OCR-style credentials and endpoints do not establish a verified video text-detection result with subtitle time segments. | Must not be presented as video OCR until an official API contract proves video input plus time-coded text output. | **Not selected without a verified official contract.** |

### Mature desktop and open-source references

| Candidate | Evidence | Licence / integration boundary | Decision |
|---|---|---|---|
| Subtitle Edit 5.1 Video OCR | MIT project. Its documented Video OCR samples a configured scan area at a few frames per second, collapses near-identical frames, OCRs one representative frame per group, and merges near-identical consecutive text into lines with start/end times. It supports local Paddle OCR and other engines. Source paths include `VideoOcrFrameGrouper`, `VideoOcrLineBuilder`, and regression tests under `tests/UI/Features/VideoOcrTests.cs`. Official references: `https://github.com/SubtitleEdit/subtitleedit` and `https://raw.githubusercontent.com/SubtitleEdit/subtitleedit/main/docs/features/video-ocr.md` | MIT source is a strong integration/reference starting point. Exact OCR engine binaries/models still need their own redistribution audit. It is a desktop application rather than a ready Electron service. | **Primary algorithm and UX reference; highest-priority local POC.** |
| YaoFANGUK/video-subtitle-extractor | Apache-2.0 project explicitly advertises hard-subtitle extraction, temporal detection, non-subtitle filtering and SRT output. Its README says Windows/Linux/macOS modes use VideoSubFinder for detection. | The advertised complete path inherits the GPL-2.0 VideoSubFinder dependency; the root Apache label does not clear the packaged detector and DLL payload for distribution. | **Reference only; do not bundle.** |
| SWHL/RapidVideOCR | Apache-2.0 recognizer/pipeline that explicitly takes `RGBImages` or `TXTImages` generated by VideoSubFinder and outputs SRT/ASS/TXT. | It is not an independent video detector; its intended complete route inherits the VideoSubFinder GPL boundary. | **Reference only; do not treat as a complete distributable engine.** |

### Research conclusion

There is a real “video OCR” category, but it splits into two different products:

1. **Video text detection service**: sends the video to a cloud provider and receives time-coded text observations. Google is the first verified candidate, but it changes the data boundary and needs a Chinese hard-subtitle quality test.
2. **Hard-subtitle extraction pipeline**: keeps video local, detects subtitle regions and temporal changes locally, then uses a local or cloud recognizer. Subtitle Edit provides the clearest mature, permissively licensed reference for this exact pipeline.

For this product, the next bounded experiment is therefore not “call Tencent OCR on a frame.” It is a Subtitle Edit-style local temporal pipeline on the fixed sample, with the recognizer swappable between local Paddle OCR and Tencent image OCR. The pipeline must prove subtitle-region filtering and timing first; the recognizer cannot invent timing. No product code, UI, database, or upload policy changes are authorized by this research note.

## Subtitle Edit-style temporal pipeline POC (2026-08-06)

This POC implements the published Subtitle Edit 5.1 `VideoOcrFrameGrouper` and `VideoOcrLineBuilder` approach in two isolated research scripts:

- `docs/research/subtitle-edit-time-axis-poc.mjs`: uses the project-local FFmpeg binary to crop and sample the fixed video, then groups consecutive frames by the Subtitle Edit bright-mask Jaccard rule. It creates no product data and sends no media outside the machine.
- `docs/research/subtitle-edit-paddle-recognizer-poc.py`: extracts only the visual group's representative frame, uses local PaddleOCR 3.4.1 / PaddlePaddle 3.3.1 CPU recognition, then applies the published text-similarity merge rule. `enable_mkldnn=False` is required because the CPU oneDNN path throws `ConvertPirAttribute2RuntimeAttribute` on this machine.

### Fixed run configuration

| Setting | Value |
|---|---|
| Source video | Same read-only episode 02 video and SHA-256 as the fixed protocol above |
| Sampling | 5 fps |
| Scan region | Existing fixed subtitle ROI: `900 x 326` at pixel `86,1114` |
| Thumbnail / temporal detector | `96 x 35` grayscale, brightness minimum `190`, blank fraction `0.002`, bright-mask similarity `92%` |
| Text merge | Text Levenshtein similarity `80%`, maximum gap `250 ms`, minimum line duration `250 ms` |
| OCR | Local PaddleOCR 3.4.1, PP-OCRv5 server detector/recognizer, CPU, oneDNN disabled |
| Privacy | Video, frames and recognition remain local. No ASR, imported SRT, cloud OCR, provider key, application database or UI is read/written by either execution path. |

### Two-run result

| Measure | Run 1 | Run 2 | Repeatability |
|---|---:|---:|---|
| Sampled frames | 864 | 864 | Identical |
| Visual frame groups | 394 | 394 | Identical |
| Non-blank visual candidates | 58 | 58 | Identical timeline |
| Representative frames extracted | 58 | 58 | Identical; no extraction failures |
| Non-empty Paddle results | 51 | 51 | Identical text and confidence values |
| Merged OCR lines | 43 | 43 | Identical text and time ranges |
| Wall time | 215.172 s | 209.891 s | CPU research timing only; not a production performance claim |

Direct visual checks were correct on two deliberately clear frames: `这种日子我过够了` at 13.8 s (0.988 confidence in the full run) and `我公司还有个会` at 89.8 s (0.994). This is materially better than the earlier Tesseract.js control and proves that local temporal grouping plus a stronger recognizer can produce independent time-coded text.

### Quality gates that still fail

This is **not** a product-admission result:

| Finding | Evidence | Required follow-up |
|---|---|---|
| Unwanted end-card output is still accepted | At 171.0–172.8 s the end-card text was returned as `未` from `未完待续`. | After the subtitle region is confirmed, apply only the user-approved narrow `未完待续` output exclusion. Do not create a generic semantic classifier. |
| Dynamic subtitle segments can fragment | The same text `是南烟自己发病跳了楼` appears as two unmerged ranges, `53.0–53.4` and `53.8–54.6`; the fixed 250 ms Subtitle Edit merge gap correctly did not bridge the measured 400 ms gap. | Build a labelled acceptance set before changing thresholds; do not tune the production value around one clip. |
| Imported SRT is not valid visual ground truth | Read only after the output: 42 of 43 generated lines overlap an imported cue, but only 12 match its normalized text exactly and only 34 of 63 imported cues overlap an output line. The imported file often joins or segments text differently from the visible progressive subtitle. | Establish a small human-labelled visual hard-subtitle set with the confirmed subtitle region, cue boundaries, one out-of-region label, an end-card and a no-text frame. Do not use ASR/import subtitles to select frames or mutate output. |
| Distribution remains unresolved | Subtitle Edit source is MIT, but PaddleOCR/PaddlePaddle binaries/models and their Windows packaging are not release-approved in this repository. | Perform a release-specific model/binary licence and packaging audit before any product bundle decision. |

### First-principles correction: subtitle region comes before word meaning

The 9.4 s sequence must not be treated as a removable title. Direct visual inspection shows `PUA` at 9.4 s, `凌辱` at 11.0 s, and `家暴` at 12.6 s, each separated by blank frames. Together they are deliberately paced narrative hard subtitles and must remain in the OCR subtitle track as detector-originated cues. The POC's failure is that it did not reconstruct or retain the whole progressive sequence reliably; it is not evidence that the sequence should be filtered.

The initial text-taxonomy proposal was still wrong at its root: it tried to decide whether a detected word was a subtitle from its meaning. In this product, a short drama normally uses one stable hard-subtitle region per drama, while other text is outside that region. Therefore the product must decide the region first and interpret all ordinary detected text inside it as subtitle material. The POC's `900 x 326` ROI was an experimental broad crop, not an operator-confirmed subtitle region; the tombstone case is calibration evidence, not a scene-text classification test.

For the product acceptance set:

1. A candidate locator may propose subtitle regions from representative frames, but the operator must select and fine-tune one rectangle for the current drama before OCR runs. The confirmed rectangle applies to all episodes of that drama; a new drama starts without inheriting it.
2. Text inside the confirmed rectangle is kept as OCR subtitle material, including normal dialogue and progressive word-by-word or phrase-by-phrase text. A progressive display may be represented by multiple raw cues until a labelled test proves a safe reconstruction rule; text must never be guessed or forcibly concatenated.
3. Text outside the confirmed rectangle, including character/identity labels and other visual context, is out of scope for this subtitle pipeline. It may become a separate future narrative-context pipeline, not an OCR subtitle exception handler.
4. `未完待续` is excluded only by the explicit approved phrase rule after recognition; no generic title/scene-text semantic filter is allowed.

The next acceptance set must include at least one normal dialogue case, this progressive `PUA / 凌辱 / 家暴` case, one non-subtitle label outside the confirmed region, one end-card case and one no-text case. It must label the confirmed region, expected inclusion/exclusion, text and time range from the video itself; imported SRT remains a comparison artifact only.

### Current decision

The POC advances the status from “unproven local temporal architecture” to **“technically viable, repeatable research path; not ready for product integration.”** The next bounded work is a region-calibration fixture plus an annotated visual acceptance set, followed by progressive-text reconstruction and the narrow end-card exclusion. Only after those gates pass should the recognizer be compared against Tencent image OCR on the same detector-produced frames. The product code, UI, database, existing OCR executor, provider settings and source media remain unchanged.
