/**
 * 자세 체크 (순수 로직) — 보정 전에 "모델이 잘 아는 환경"과 비슷한지 확인
 *
 *  거리   : 얼굴 폭이 사진 폭의 28~70%
 *  각도   : 고개 좌우 ±15°, 상하 ±20°
 *  눈     : 두 눈 뜸 확률 0.4 이상 + 눈 이미지가 잘림
 *  밝기   : 눈 이미지 평균 밝기 50~220
 */
import type { GazeSample } from './useGazeSampler';

export const POSTURE_POLICY = {
  MIN_FACE_RATIO: 0.28,
  MAX_FACE_RATIO: 0.7,
  MAX_YAW_DEG: 15,
  MAX_PITCH_DEG: 20,
  MIN_EYE_OPEN: 0.4,
  MIN_BRIGHTNESS: 50,
  MAX_BRIGHTNESS: 220,
} as const;

export interface PostureItem {
  key: 'face' | 'distance' | 'angle' | 'eyes' | 'light';
  label: string;
  ok: boolean;
  /** 실패했을 때 안내 문구 */
  hint: string;
}

export function checkPosture(
  s: Pick<
    GazeSample,
    'faceDetected' | 'faceWidthRatio' | 'yaw' | 'pitch' | 'leftEyeOpen' | 'rightEyeOpen' | 'eyeBrightness' | 'error'
  > | null,
): { ok: boolean; items: PostureItem[] } {
  const P = POSTURE_POLICY;
  if (!s || !s.faceDetected) {
    return {
      ok: false,
      items: [{ key: 'face', label: '얼굴', ok: false, hint: '얼굴이 원 안에 보이게 해 주세요' }],
    };
  }

  const r = s.faceWidthRatio ?? 0;
  const distance: PostureItem = {
    key: 'distance',
    label: '거리',
    ok: r >= P.MIN_FACE_RATIO && r <= P.MAX_FACE_RATIO,
    hint: r < P.MIN_FACE_RATIO ? '조금 더 가까이 와 주세요' : '조금 더 멀리 떨어져 주세요',
  };

  const yawOk = s.yaw != null && Math.abs(s.yaw) <= P.MAX_YAW_DEG;
  const pitchOk = s.pitch != null && Math.abs(s.pitch) <= P.MAX_PITCH_DEG;
  const angle: PostureItem = {
    key: 'angle',
    label: '각도',
    ok: yawOk && pitchOk,
    hint: !pitchOk ? '폰을 눈높이에 맞춰 주세요' : '얼굴을 화면 정면으로 향해 주세요',
  };

  const eyesOpen = (s.leftEyeOpen ?? 0) >= P.MIN_EYE_OPEN && (s.rightEyeOpen ?? 0) >= P.MIN_EYE_OPEN;
  const eyes: PostureItem = {
    key: 'eyes',
    label: '눈',
    ok: eyesOpen && s.eyeBrightness != null,
    hint: '두 눈이 잘 보이게 해 주세요 (머리카락·안경 반사 확인)',
  };

  const b = s.eyeBrightness;
  const light: PostureItem = {
    key: 'light',
    label: '밝기',
    ok: b != null && b >= P.MIN_BRIGHTNESS && b <= P.MAX_BRIGHTNESS,
    hint: b != null && b > P.MAX_BRIGHTNESS ? '빛이 너무 강해요' : '더 밝은 곳으로 가 주세요 (역광 피하기)',
  };

  const items = [distance, angle, eyes, light];
  return { ok: items.every((i) => i.ok), items };
}
