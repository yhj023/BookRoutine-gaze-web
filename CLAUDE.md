# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev`: dev server, then open `/try`. `predev`/`prebuild` run `scripts/copy-assets.mjs`, which copies the MediaPipe WASM and `reference/face_landmarker.task` into `public/` (gitignored), so nothing is fetched from a CDN.
- `npm run build`. `npm run typecheck` runs `tsc --noEmit` (app code, no Node types) plus `tsc --noEmit -p tsconfig.test.json` (tests and `testUtils.ts`, with `@types/node`). A bare `npx tsc --noEmit` skips the test files.
- `npm test` (vitest). Single file: `npx vitest run src/gaze/eyeCrop.test.ts`. Filter by name: `-t "<name>"`.
- Python comparison (system Python with mediapipe/opencv/numpy, always run with `python -I`):
  - `npm run compare:ops`: OpenCV reference outputs for warpAffine/resize/getRotationMatrix2D → `data/compare/ops/`, checked by `src/gaze/eyeCrop.ops.test.ts`.
  - `npm run compare:py`: runs `reference/eye_extractor.py` on `data/compare/*.png` (saved with the "사진 저장" button on `/try`) → `data/compare/out/`, checked by `src/gaze/eyeCrop.compare.test.ts`.
  - `npm run compare:gaze`: runs `gaze.tflite` (Python `ai-edge-litert`) on those Python crops → `<stem>.py.gaze.json`. Then press "비교 실행" on `/try` (dev only; reads `data/compare/out` through the `/__compare` middleware in `vite.config.ts`, runs WebGPU and wasm), move the downloaded `gaze-compare.json` into `data/compare/`, and `src/gaze/gaze.compare.test.ts` checks it (|Δ| < 0.01 cm).
- `npm run analyze:calib` (vite-node): reads `data/calib/*.json` (the "보정 데이터 저장" button on the calibration result screen, numbers only) and prints, per point, how much error comes from sample shake versus systematic offset. It reuses `src/gaze/gazeCalibration.ts`. The model's own training error is about 4.5 cm (user, 2026-11-10), so calibration errors near 5 cm are close to the model's limit.
  - Comparison tests skip themselves when their data folder is missing. `data/` is gitignored.

## Gaze model (`src/gaze/gazeModel.ts`, LiteRT.js)

`reference/gaze.tflite` (PyTorch MobileNetV3 export) takes `serving_default_args_0` = image-left eye (`extractEyes().leftEye`, 33/133) and `serving_default_args_1` = image-right eye, each `[1,64,64,3]` float32 **RGB 0–255** (the /255 and normalization are inside the model). The output is `[1,2]` gaze (x, y) in cm, camera-relative and uncalibrated. Inputs are matched by name, not position. WASM and model are served from `public/litert/wasm` and `public/models/`. The app runs it on **wasm (CPU)**, which matches Python exactly (0 diff). WebGPU defaults to fp16 and was off by 0.14–0.74 cm on the same crops, so it only appears in the dev comparison panel. `gpuOptions: {precision: 'fp32'}` exists but is untested.

## Eye crop (`src/gaze/eyeCrop.ts`)

A line-by-line port of `EyeExtractor.process`. It reimplements OpenCV's own arithmetic (not canvas drawImage) so the crops match what the model was trained on. These details were verified against OpenCV 5.0.0:
- `getRotationMatrix2D` takes the center as float32.
- `warpAffine` uses OpenCV 5's float32 path (inverse matrix → float32, FMA-style lerp, round half to even). Expect ≤1 diff on fewer than 0.1% of values (true .5 ties).
- `resize` INTER_LINEAR uses 11-bit fixed-point weights and the SIMD vertical formula. x positions are clamped at the edges, y positions are not (only the row index is clipped). An exact 2× downscale switches to INTER_AREA. This matches exactly.
- numpy float32 steps in the Python code are mirrored with `Math.fround`.
If OpenCV is upgraded, rerun `compare:ops` before trusting the crops.

## Reference material (`reference/`)

Source files and model assets copied from the earlier (mobile) version of the BookRoutine gaze/focus feature. Port from them; they are not wired into the build.

### What the reference code does

It is a webcam-based "is the reader focused?" pipeline for an e-book reader. Comments and UI strings are in Korean; keep new user-facing strings in Korean too.

1. **Face landmarks**: `face_landmarker.task` is the MediaPipe Face Landmarker model (478 landmarks, iris included, Tasks API, not the legacy `face_mesh`).
2. **Eye preprocessing**: `eye_extractor.py` (Python/OpenCV, used on the training side) rotates the face so the eye-corner line is horizontal, scales it to a fixed inter-eye distance (35% of a 224px face), then crops square left/right eye patches (64px, box = eyelid-ring extent × 1.8). The normalization uses eye *corners* (33/133, 263/362), never the iris, because the iris moves with gaze. Any in-browser preprocessing that feeds `gaze.tflite` has to reproduce this exactly, or the model's inputs won't match what it was trained on.
3. **Gaze model**: `gaze.tflite` is a CNN that outputs a gaze point in **cm** (it was trained on laptop-screen data).
4. **Posture check** (`postureCheck.ts`): runs before calibration and checks that conditions resemble the training data: face width 28–70% of frame, yaw ±15°, pitch ±20°, both eyes open ≥ 0.4, eye brightness 50–220.
5. **Calibration** (`gazeCalibration.ts`): 5 targets (center plus 4 corners at a 15% inset) and a 3 s center fixation. It fits a least-squares affine map from model cm to screen coordinates, scores accuracy with leave-one-out error, and measures noise from the fixation. If quality is `poor`, `map` is `null` and judging falls back to head pose only.
6. **Focus judging** (`focusJudge.ts`, class `FocusJudge`): a stateful per-sample classifier that returns `focused | unfocused | away`, plus a `detail` (`staring | skimming | offscreen | head | eyes-closed`). The order of checks matters and is documented in the file header. It has two baseline modes:
   - calibrated (`setCalibration`): gaze is mapped to the screen and judged on-screen vs off-screen, plus a "staring" check (gaze barely moving for 10 s with no scroll);
   - auto: a 5 s self-baseline of head pose and raw gaze, used when calibration is skipped.
   The result goes through majority-vote smoothing (window 3), and the baseline slowly adapts while the reader is focused. Scroll events come in through `notifyScroll(t, y)` and feed the skimming detector (faster than 45 dp/s over 30 s).

All thresholds live in the `*_POLICY` constant objects at the top of each TS file. Tune them there; don't add magic numbers inline. The TS modules are written as pure logic (no React/DOM) so they can be unit-tested. Keep that separation when porting.

### Porting notes

- The TS files import modules that aren't in this repo: `FocusState` from `../types/ebook`, and `GazeSample` from `./useGazeSampler` (a hook producing `timestamp, faceDetected, faceWidthRatio, yaw, pitch, leftEyeOpen, rightEyeOpen, eyeBrightness, gaze, error`). These have to be recreated for the web.
- Screen units in the reference are Android **dp** (`CM_PER_DP = 2.54/160`), and policy values such as `SKIM_MAX_DP_PER_SEC` and `STARE_MIN_SPREAD_DP` assume dp. On the web, decide explicitly how CSS px map to these values instead of swapping the units silently.
- **Decided (2026-11-10):** the web uses CSS px as the screen unit, with `CM_PER_PX = 2.54/96` (the nominal CSS inch) replacing `CM_PER_DP`. Fields are renamed `errorPx`/`noisePx` in `src/gaze/gazeCalibration.ts`; the math is unchanged. Port the dp-based `FOCUS_JUDGE_POLICY` values the same way.
- Samples flow through `createSampleHub()` (`src/gaze/gazeSample.ts`, up to 10/s from `/try`; the app used 4/s, and a sample is skipped while the previous inference is still running). `CalibrationOverlay` (same timings as the app's overlay except `DOT_TARGET_SAMPLES` 4 → 12, changed 2026-11-11 because 4 samples left too much shake; posture check omitted) and the gaze dot subscribe to it. The gaze dot is display-only smoothing (`GAZE_DOT_POLICY`: 1.5 s median plus a ~1.5 cm deadzone). Calibration coordinates are fullscreen-viewport CSS px.
- `eye_extractor.py` expects its model at `models/assets/face_landmarker.task`. Here the model sits at `reference/face_landmarker.task`.


# gaze-web: 시선 추적 웹 시연

## 목적
노트북 웹캠으로 시선 모델을 체험하는 전시용 웹. 설계서: "시선 추적 웹 시연 설계서".

## 스택
- Vite + React + TypeScript
- @mediapipe/tasks-vision FaceLandmarker (VIDEO 모드, 얼굴 1개)
- @litertjs/core로 reference/gaze.tflite 실행
- 보정·판정은 reference/의 앱 TypeScript를 옮겨 사용

## 절대 규칙
- 카메라 영상과 눈 크롭을 서버나 외부로 보내지 않는다. 모든 처리는 브라우저 안에서.
- 눈 크롭은 reference/eye_extractor.py와 숫자 하나까지 같게 만든다 (랜드마크 번호, 224, 0.35, 2.5, 1.8, 64).
- 모델에 넣는 프레임은 거울 반전하지 않는다.
- 패키지 추가는 먼저 물어본다. `git add .` 금지.
- 수집 데이터(눈 크롭, 라벨)는 Git에 올리지 않는다.

## 작업 방식
- 고치기 전에 계획을 먼저 설명하고, 필요한 정보가 없으면 추측하지 말고 물어본다.
- 수정 후 `npx tsc --noEmit`과 테스트를 실행한다.
- 설명은 한국어로, 초등학생도 이해할 수 있게.