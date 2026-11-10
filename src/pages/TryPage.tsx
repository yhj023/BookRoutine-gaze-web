import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { useWebcam } from '../camera/useWebcam';
import { downloadBlob, grabFrame } from '../camera/grabFrame';
import { useFaceLandmarker } from '../gaze/useFaceLandmarker';
import { drawEyes } from '../gaze/drawEyes';
import { extractEyes, type Img } from '../gaze/eyeCrop';
import { eyeToTensorData } from '../gaze/gazeInput';
import { useGazeModel, type GazeResult } from '../gaze/useGazeModel';
import { createSampleHub } from '../gaze/gazeSample';
import { createGazeSmoother } from '../gaze/gazeSmoother';
import type { GazeCalibration, Pt } from '../gaze/gazeCalibration';
import GazeComparePanel from './GazeComparePanel';
import CalibrationOverlay from './CalibrationOverlay';

const fmt = (v: number | null) => (v == null ? '–' : v.toFixed(2));
/**
 * 눈 크롭 + 시선 추론 간격 (최대 1초에 10번).
 * 이전 추론이 안 끝났으면 그 차례는 건너뛰므로, 느린 컴퓨터에서는 저절로 덜 자주 잰다.
 * (원래 앱은 250ms. 보정 때 점마다 값을 더 많이 모으려고 웹에서 줄임)
 */
const CROP_INTERVAL_MS = 100;

/** RGBA 크롭을 캔버스에 그리기 (원본 밖은 OpenCV 처럼 검정으로 보이게 알파 255) */
function paint(canvas: HTMLCanvasElement | null, img: Img) {
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;
  const id = new ImageData(img.width, img.height);
  for (let i = 0; i < img.width * img.height; i++) {
    id.data[i * 4] = img.data[i * 4];
    id.data[i * 4 + 1] = img.data[i * 4 + 1];
    id.data[i * 4 + 2] = img.data[i * 4 + 2];
    id.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
}

export default function TryPage() {
  const { videoRef, status, error, size } = useWebcam();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leftRef = useRef<HTMLCanvasElement>(null);
  const rightRef = useRef<HTMLCanvasElement>(null);
  const lastCropAt = useRef(0);
  const saveRequested = useRef(false);
  const [cropInfo, setCropInfo] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const gazeModel = useGazeModel();
  const { predict, isBusy } = gazeModel;
  const [gaze, setGaze] = useState<GazeResult | null>(null);
  /** 사진 저장 때 함께 적을 가장 최근 시선 값 */
  const lastGaze = useRef<GazeResult | null>(null);
  /** 시선 샘플을 보정 화면·시선 점에 나눠 주는 곳 */
  const hub = useRef(createSampleHub()).current;
  const [calibrating, setCalibrating] = useState(false);
  const [cal, setCal] = useState<GazeCalibration | null>(null);
  const [screenGaze, setScreenGaze] = useState<Pt | null>(null);

  // 보정이 끝나 변환식(map)이 있으면, 샘플마다 화면 위 시선 점 위치 계산
  useEffect(() => {
    const map = cal?.fittedMap; // 체험용: 정확도가 낮아도 경고와 함께 보여 줌
    if (!map || calibrating) {
      setScreenGaze(null);
      return;
    }
    // 표시용으로만 부드럽게: 최근 1.5초 중앙값 + 작은 떨림 무시 (GAZE_DOT_POLICY)
    const smoother = createGazeSmoother();
    return hub.subscribe((s) => setScreenGaze(smoother.push(s.timestamp, s.gaze ? map(s.gaze) : null)));
  }, [cal, calibrating, hub]);

  const onResult = useCallback(
    (result: FaceLandmarkerResult) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      const landmarks = result.faceLandmarks[0] ?? null;
      if (canvas && ctx) drawEyes(ctx, landmarks, canvas.width, canvas.height);

      // 랜드마크를 찾은 바로 그 프레임을 꺼낸다 (같은 콜백 안이라 영상 프레임이 그대로)
      const now = performance.now();
      const wantSave = saveRequested.current;
      if (!wantSave && (now - lastCropAt.current < CROP_INTERVAL_MS || isBusy())) return;
      lastCropAt.current = now;
      const video = videoRef.current;
      const frame = video && grabFrame(video);
      if (!frame) return;

      if (wantSave) {
        saveRequested.current = false;
        if (!landmarks) {
          setSaveMsg('얼굴이 보일 때 다시 눌러 주세요');
        } else {
          const name = `face-${new Date().toISOString().replace(/[:.]/g, '-')}`;
          const json = JSON.stringify({
            width: frame.img.width,
            height: frame.img.height,
            landmarks,
            gaze: lastGaze.current && { x: lastGaze.current.x, y: lastGaze.current.y },
          });
          frame.canvas.toBlob((png) => png && downloadBlob(png, `${name}.png`), 'image/png');
          downloadBlob(new Blob([json], { type: 'application/json' }), `${name}.landmarks.json`);
          setSaveMsg(`${name}.png 와 .landmarks.json 을 내려받았어요 → data/compare/ 로 옮겨 주세요`);
        }
      }

      // yaw/pitch 는 4단계(변환 행렬)에서 채움
      const base = { timestamp: now, faceDetected: landmarks != null, yaw: null, pitch: null };
      if (!landmarks) {
        setCropInfo('얼굴 없음');
        hub.emit({ ...base, gaze: null });
        return;
      }
      const eyes = extractEyes(frame.img, landmarks);
      if (!eyes) {
        setCropInfo('눈을 자르지 못했어요');
        hub.emit({ ...base, gaze: null });
        return;
      }
      paint(leftRef.current, eyes.leftEye);
      paint(rightRef.current, eyes.rightEye);
      setCropInfo(`기울기 ${eyes.tiltDeg.toFixed(1)}°`);

      // 시선 모델 (args_0 = 사진 왼쪽 눈, args_1 = 사진 오른쪽 눈). 이전 추론 중이면 건너뜀
      predict(eyeToTensorData(eyes.leftEye), eyeToTensorData(eyes.rightEye))
        .then((g) => {
          if (!g) return; // 이전 추론 중이라 건너뜀
          lastGaze.current = g;
          setGaze(g);
          hub.emit({ ...base, gaze: { x: g.x, y: g.y } });
        })
        .catch((e) => {
          console.warn('[gaze] 추론 실패', e);
          hub.emit({ ...base, gaze: null });
        });
    },
    [videoRef, predict, isBusy, hub],
  );

  const face = useFaceLandmarker(videoRef, status === 'ready', onResult);
  const s = face.stats;

  const faceFound = face.status === 'running' && !!s?.faceDetected;
  const qualityLabel = cal ? { good: '좋음', fair: '보통', poor: '정확도 낮음' }[cal.quality] : null;
  const step = !cal ? (faceFound ? 2 : 1) : 3;

  return (
    <main className="try">
      <header className="page-head">
        <p className="eyebrow">BookRoutine · 전시 체험</p>
        <h1>화면 주시 기반 집중 지표</h1>
        <p className="lede">
          웹캠으로 눈을 보고, 내가 화면의 어디를 보고 있는지 알아봐요. 영상은 이 컴퓨터 밖으로 나가지 않아요.
        </p>
        <ol className="steps">
          {['카메라 앞에 앉기', '5점 보정', '내 시선 확인'].map((label, i) => (
            <li key={label} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : undefined}>
              <span>{i + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </header>

      <div className="layout">
        <section className="card camera-card">
          {/*
            .stage 를 통째로 CSS로 거울처럼 뒤집는다 (.mirrored) → 영상과 점이 함께 뒤집혀 딱 맞음.
            모델에는 videoRef 의 원본 프레임이 들어가고, 점도 원본 좌표로 그린다.
            .stage 비율 = 실제 영상 비율 → 잘리는 부분이 없어 점이 어긋나지 않음.
          */}
          <div className="stage-wrap">
            <div
              className="stage mirrored"
              style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}
            >
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} width={size?.width ?? 640} height={size?.height ?? 480} />
            </div>
            <span className={`pill ${faceFound ? 'ok' : 'warn'}`}>
              {status === 'starting' && '카메라 켜는 중…'}
              {status === 'error' && '카메라 오류'}
              {status === 'ready' &&
                (face.status === 'loading' ? '얼굴 인식 준비 중…' : faceFound ? '얼굴 찾음' : '얼굴이 안 보여요')}
            </span>
          </div>
          {status === 'error' && <p className="error">{error}</p>}
          {face.status === 'error' && <p className="error">{face.error}</p>}
          <p className="hint">얼굴이 화면에 크게 보일 만큼 가까이 앉으면 더 정확해요.</p>
        </section>

        <aside className="side">
          <section className="card">
            <h2>내 시선</h2>
            {gazeModel.status === 'loading' && <p className="muted">시선 모델 불러오는 중…</p>}
            {gazeModel.status === 'error' && <p className="error">{gazeModel.error}</p>}
            {gazeModel.status === 'ready' && (
              <>
                <p className="gaze-value">
                  {gaze ? (
                    <>
                      x <b>{gaze.x.toFixed(1)}</b> · y <b>{gaze.y.toFixed(1)}</b> <small>cm</small>
                    </>
                  ) : (
                    <span className="muted">얼굴이 보이면 나와요</span>
                  )}
                </p>
                <p className="hint">
                  카메라 기준 위치(보정 전)
                  {gaze && ` · ${gaze.ms.toFixed(0)} ms`}
                </p>
              </>
            )}
          </section>

          <section className="card">
            <h2>보정</h2>
            {cal ? (
              <>
                <p className={`quality q-${cal.quality}`}>
                  <span className="badge">{qualityLabel}</span>
                  {Number.isFinite(cal.errorCm) ? `오차 약 ${cal.errorCm.toFixed(1)}cm` : '측정값 부족'}
                </p>
                {cal.fittedMap ? (
                  <p className="hint">
                    {cal.quality === 'poor'
                      ? '정확도가 낮아서 파란 점이 실제 시선과 꽤 떨어질 수 있어요. 더 가까이 앉아 다시 보정해 보세요.'
                      : '화면 위 파란 점이 내 시선이에요.'}
                  </p>
                ) : (
                  <p className="hint">{cal.summary}. 얼굴과 두 눈이 잘 보이게 하고 다시 보정해 주세요.</p>
                )}
              </>
            ) : (
              <p className="hint">화면의 점 5개를 눈으로 따라가면, 내 눈에 맞춰 시선 위치를 맞춰요. 약 20초 걸려요.</p>
            )}
            <button
              type="button"
              className="primary wide"
              disabled={face.status !== 'running' || gazeModel.status !== 'ready'}
              onClick={() => setCalibrating(true)}
            >
              {cal ? '다시 보정하기' : '5점 보정 시작'}
            </button>
          </section>
        </aside>
      </div>

      {calibrating && (
        <CalibrationOverlay
          hub={hub}
          onDone={(c) => {
            setCalibrating(false);
            if (c) setCal(c);
          }}
        />
      )}
      {/* 보정한 화면(전체 화면) 기준 좌표라, 전체 화면을 나가면 위치가 조금 어긋날 수 있음 */}
      {screenGaze && (
        <div
          className={`gaze-dot${cal?.quality === 'poor' ? ' low' : ''}`}
          style={{ transform: `translate(${screenGaze.x}px, ${screenGaze.y}px)` }}
        >
          {cal?.quality === 'poor' && <span>정확도 낮음</span>}
        </div>
      )}

      <details className="card dev">
        <summary>개발자 정보</summary>
        <section className="eyes">
          {/* 모델에 들어갈 그대로의 눈 (반전 없음: 화면 왼쪽 = 사진 속 왼쪽, 즉 내 오른쪽 눈) */}
          <figure>
            <canvas ref={leftRef} width={64} height={64} />
            <figcaption>LEFT_EYE (33·133)</figcaption>
          </figure>
          <figure>
            <canvas ref={rightRef} width={64} height={64} />
            <figcaption>RIGHT_EYE (263·362)</figcaption>
          </figure>
          <div>
            <p>눈 크롭 64×64 {cropInfo && `· ${cropInfo}`}</p>
            <button
              type="button"
              className="ghost"
              disabled={face.status !== 'running'}
              onClick={() => (saveRequested.current = true)}
            >
              사진 저장 (비교용)
            </button>
            {saveMsg && <p className="hint">{saveMsg}</p>}
          </div>
        </section>

        <section className="debug">
          <p>
            {status === 'ready' && size && `카메라 ${size.width}×${size.height} · `}
            {face.status === 'running' && s && `얼굴 인식 ${s.fps.toFixed(0)} fps · `}
            시선 모델 {gazeModel.model?.accelerator === 'webgpu' ? 'GPU(WebGPU)' : 'CPU(wasm)'}
          </p>
          {s && (
            <>
              <p>
                눈 감음 정도 (블렌드셰이프) — eyeBlinkLeft {fmt(s.blinkLeft)} · eyeBlinkRight {fmt(s.blinkRight)}
              </p>
              {/* data 를 순서대로 4개씩 보여 줌. 행/열 순서 해석은 고개 각도 계산 단계에서 확인 */}
              <p>변환 행렬 (data 16개, 4개씩) {s.matrix ? '' : '— 없음'}</p>
              {s.matrix && (
                <pre className="matrix">
                  {[0, 1, 2, 3]
                    .map((r) => [0, 1, 2, 3].map((c) => s.matrix![r * 4 + c].toFixed(2).padStart(8)).join(''))
                    .join('\n')}
                </pre>
              )}
            </>
          )}
          {gazeModel.model && <p className="hint">시선 모델 입력: {gazeModel.model.inputInfo}</p>}
          {cal && (
            <p className="hint">
              보정: 오차 {cal.errorPx.toFixed(0)}px · 흔들림 {cal.noisePx.toFixed(0)}px · 화면 {cal.screen.width}×
              {cal.screen.height}
            </p>
          )}
        </section>

        {import.meta.env.DEV && <GazeComparePanel />}
      </details>
    </main>
  );
}
