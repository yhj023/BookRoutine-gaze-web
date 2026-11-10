import { useEffect, useRef, useState } from 'react';
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

/** 모두 public/ 에서 받아 온다 (scripts/copy-assets.mjs) — 외부 서버 요청 없음 */
const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/face_landmarker.task';
/** 화면 글자(fps, 블렌드셰이프 등)를 바꾸는 간격 — 그리기는 매 프레임 */
const STATS_INTERVAL_MS = 250;

export type LandmarkerStatus = 'loading' | 'running' | 'error';

/** 확인 칸에 보여 줄 값 (STATS_INTERVAL_MS 마다 갱신) */
export interface LandmarkerStats {
  fps: number;
  faceDetected: boolean;
  /** 블렌드셰이프 eyeBlinkLeft / eyeBlinkRight (0~1, 클수록 감음) */
  blinkLeft: number | null;
  blinkRight: number | null;
  /** 얼굴 변환 행렬 4×4 (펼친 16개 값) */
  matrix: number[] | null;
}

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
  const make = (delegate: 'GPU' | 'CPU') =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  try {
    return await make('GPU');
  } catch (e) {
    console.warn('[FaceLandmarker] GPU로 만들지 못해 CPU로 다시 시도해요', e);
    return make('CPU');
  }
}

function blendshape(result: FaceLandmarkerResult, name: string): number | null {
  const c = result.faceBlendshapes[0]?.categories.find((x) => x.categoryName === name);
  return c ? c.score : null;
}

/**
 * <video>(원본 프레임, 반전 없음)를 FaceLandmarker VIDEO 모드로 계속 처리한다.
 * 결과는 매 프레임 onResult 로 넘기고, latestResult 에도 넣어 둔다.
 *
 * @param enabled 카메라가 켜져서 영상이 나오기 시작했을 때 true
 */
export function useFaceLandmarker(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean,
  onResult?: (result: FaceLandmarkerResult) => void,
) {
  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [status, setStatus] = useState<LandmarkerStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<LandmarkerStats | null>(null);
  const latestResult = useRef<FaceLandmarkerResult | null>(null);

  // 콜백이 바뀌어도 반복을 다시 시작하지 않게 ref 로 들고 있는다
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // 1) FaceLandmarker 만들기 (화면을 떠나면 닫기)
  useEffect(() => {
    let cancelled = false;
    let created: FaceLandmarker | null = null;
    createLandmarker()
      .then((lm) => {
        if (cancelled) {
          lm.close();
          return;
        }
        created = lm;
        setLandmarker(lm);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        setError(`얼굴 인식 모델을 불러오지 못했어요 (${e instanceof Error ? e.message : String(e)})`);
      });
    return () => {
      cancelled = true;
      created?.close();
      setLandmarker(null);
    };
  }, []);

  // 2) 영상 프레임마다 처리하기
  useEffect(() => {
    if (!landmarker || !enabled) return;
    let rafId = 0;
    let lastVideoTime = -1;
    let lastTs = 0;
    let frames = 0;
    let statsFrom = performance.now();
    setStatus('running');

    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (video.currentTime === lastVideoTime) return; // 같은 프레임은 다시 처리하지 않음
      lastVideoTime = video.currentTime;

      // VIDEO 모드는 시간 값이 계속 커져야 한다
      const ts = Math.max(performance.now(), lastTs + 1);
      lastTs = ts;

      let result: FaceLandmarkerResult;
      try {
        result = landmarker.detectForVideo(video, ts);
      } catch (e) {
        cancelAnimationFrame(rafId);
        setStatus('error');
        setError(`얼굴 인식 중 오류가 났어요 (${e instanceof Error ? e.message : String(e)})`);
        return;
      }
      latestResult.current = result;
      onResultRef.current?.(result);

      frames += 1;
      const now = performance.now();
      if (now - statsFrom >= STATS_INTERVAL_MS) {
        setStats({
          fps: (frames * 1000) / (now - statsFrom),
          faceDetected: result.faceLandmarks.length > 0,
          blinkLeft: blendshape(result, 'eyeBlinkLeft'),
          blinkRight: blendshape(result, 'eyeBlinkRight'),
          matrix: result.facialTransformationMatrixes[0]?.data ?? null,
        });
        frames = 0;
        statsFrom = now;
      }
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [landmarker, enabled, videoRef]);

  return { status, error, stats, latestResult };
}
