/**
 * 시선 샘플 1개 (원래 앱 BookRoutine_app/lib/gaze/useGazeSampler.ts 의 GazeSample 을 웹에 맞춘 것)
 * /try 에서 1초에 최대 10번 만들어져 보정 화면·시선 점·(4단계) 집중 판정이 같이 받는다.
 */
export interface GazeSample {
  /** performance.now() 기준 ms — 프레임을 꺼낸 시각 */
  timestamp: number;
  faceDetected: boolean;
  /** 고개 좌우 / 상하 (도). 4단계에서 변환 행렬로 채움, 지금은 null */
  yaw: number | null;
  pitch: number | null;
  /** 모델이 예측한 시선 위치 (cm, 카메라 기준, 보정 전). 눈 자르기·추론 실패 시 null */
  gaze: { x: number; y: number } | null;
}

export type SampleListener = (s: GazeSample) => void;

/** 샘플을 여러 곳에 나눠 주는 작은 우체통 (순수 로직) */
export function createSampleHub() {
  const listeners = new Set<SampleListener>();
  return {
    subscribe(fn: SampleListener) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit(s: GazeSample) {
      for (const fn of listeners) fn(s);
    },
  };
}
export type SampleHub = ReturnType<typeof createSampleHub>;
