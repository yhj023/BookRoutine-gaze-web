/**
 * 개인 보정 계산 (순수 로직 → 테스트 가능)
 *
 * 왜 필요한가: 모델은 노트북 화면 데이터로 배워서, 폰에서는 "cm 값"이 실제 화면 위치와 어긋난다.
 *            그래서 사용자가 화면의 점 5개를 볼 때 모델이 낸 값을 모아서
 *            "모델 출력 (cm) → 화면 위치 (dp)" 변환식을 이 사람 전용으로 만든다.
 *
 * 변환식 (아핀 변환, 숫자 6개):
 *   화면X = a·gx + b·gy + c
 *   화면Y = d·gx + e·gy + f
 *   → 좌우 반전, 크기 차이, 위치 어긋남, 약간의 기울어짐을 한 번에 보정
 *
 * 정확도 측정: 점 하나를 빼고 나머지로 변환식을 만든 뒤, 뺀 점을 맞혀 보는 방식 (leave-one-out)
 *            → "처음 보는 위치"에 대한 실제 오차라서 정직한 수치
 * 잡음 측정:  가운데 점 하나를 3초 가만히 볼 때, 변환된 시선이 얼마나 흔들리는지
 */

export type Pt = { x: number; y: number };

export const CALIBRATION_POLICY = {
  /** 점이 나타난 뒤 이 시간 동안의 값은 버림 (눈이 점으로 이동하는 중) */
  SETTLE_MS: 700,
  /** 점 하나당 최소 샘플 수 */
  MIN_SAMPLES_PER_POINT: 2,
  /** dp → cm (안드로이드 기준 1dp = 1/160 inch) */
  CM_PER_DP: 2.54 / 160,
  /** 정확도 등급 기준 (cm) */
  GOOD_ERROR_CM: 2.5,
  FAIR_ERROR_CM: 4,
  /** 점들 사이 거리가 잡음의 몇 배 이상이어야 "모델이 시선 변화를 구분한다"고 보는지 */
  MIN_SEPARATION_RATIO: 2,
} as const;

/** 모델 출력 샘플 1개 */
export interface GazeObs {
  t: number;
  gaze: Pt; // 모델 출력 (cm)
  yaw: number | null;
  pitch: number | null;
}

/** 점 하나를 보는 동안 모은 값 */
export interface CalibPointData {
  target: Pt; // 화면 위 점 위치 (dp, 보정 화면 기준)
  shownAt: number; // 점이 나타난 시각
  obs: GazeObs[];
}

export type CalibrationQuality = 'good' | 'fair' | 'poor';

export interface GazeCalibration {
  /** 보정한 화면 크기 (dp) — 판정 때 "화면 안/밖" 기준 */
  screen: { width: number; height: number };
  /** 모델 출력 → 화면 좌표. 품질이 poor 면 null (시선은 쓰지 않고 고개로만 판정) */
  map: ((g: Pt) => Pt) | null;
  /** 처음 보는 위치 기준 평균 오차 */
  errorDp: number;
  errorCm: number;
  /** 한 점을 가만히 볼 때 흔들림 (화면 좌표, dp) — 멍때림 기준 */
  noiseDp: number;
  quality: CalibrationQuality;
  /** 가운데 점을 볼 때의 고개 각도 — 고개 판정 기준 */
  head: { yaw: number; pitch: number };
  /** 화면에 보여 줄 한 줄 설명 */
  summary: string;
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const medianPt = (ps: Pt[]): Pt => ({ x: median(ps.map((p) => p.x)), y: median(ps.map((p) => p.y)) });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** 점이 나타나고 SETTLE_MS 지난 뒤의 값만 */
export function settled(p: CalibPointData): GazeObs[] {
  return p.obs.filter((o) => o.t - p.shownAt >= CALIBRATION_POLICY.SETTLE_MS);
}

/** 3×3 연립방정식 (가우스 소거). 풀 수 없으면 null */
function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-9) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** 최소제곱 아핀 변환: gaze(cm) → screen(dp). 3쌍 미만이거나 풀 수 없으면 null */
export function fitAffine(pairs: { gaze: Pt; screen: Pt }[]): ((g: Pt) => Pt) | null {
  if (pairs.length < 3) return null;
  // 정규방정식 (XᵀX) w = Xᵀy,  X 행 = [gx, gy, 1]
  const XtX = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const Xty = [0, 0, 0];
  const Xtz = [0, 0, 0];
  for (const { gaze, screen } of pairs) {
    const row = [gaze.x, gaze.y, 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) XtX[i][j] += row[i] * row[j];
      Xty[i] += row[i] * screen.x;
      Xtz[i] += row[i] * screen.y;
    }
  }
  const wx = solve3(XtX, Xty);
  const wy = solve3(XtX, Xtz);
  if (!wx || !wy) return null;
  return (g: Pt) => ({ x: wx[0] * g.x + wx[1] * g.y + wx[2], y: wy[0] * g.x + wy[1] * g.y + wy[2] });
}

/**
 * 보정 결과 계산
 * @param points   점 5개를 볼 때 모은 값
 * @param fixation 가운데 점을 3초 볼 때 모은 값
 */
export function computeCalibration(
  points: CalibPointData[],
  fixation: CalibPointData,
  screen: { width: number; height: number },
): GazeCalibration {
  const P = CALIBRATION_POLICY;
  const fixObs = settled(fixation);

  // 고개 기준: 가운데 점을 볼 때 고개 각도 (없으면 0)
  const yaws = fixObs.map((o) => o.yaw).filter((v): v is number => v != null);
  const pitches = fixObs.map((o) => o.pitch).filter((v): v is number => v != null);
  const head = { yaw: yaws.length ? median(yaws) : 0, pitch: pitches.length ? median(pitches) : 0 };

  const fail = (summary: string): GazeCalibration => ({
    screen, map: null, errorDp: Infinity, errorCm: Infinity, noiseDp: 0, quality: 'poor', head, summary,
  });

  // 점마다 대표값(중앙값) — 튀는 값에 강함
  const pairs = points
    .map((p) => ({ screen: p.target, obs: settled(p) }))
    .filter((p) => p.obs.length >= P.MIN_SAMPLES_PER_POINT)
    .map((p) => ({ screen: p.screen, gaze: medianPt(p.obs.map((o) => o.gaze)) }));
  if (pairs.length < 4) return fail('시선 값이 충분히 모이지 않았어요');

  // 모델이 "다른 곳을 본다"는 걸 구분하는지: 점들 사이 거리 vs 가만히 볼 때 흔들림 (모델 출력 단위)
  const fixGaze = fixObs.map((o) => o.gaze);
  const rawNoise = fixGaze.length >= 2 ? median(fixGaze.map((g) => dist(g, medianPt(fixGaze)))) : 0;
  const center = medianPt(pairs.map((p) => p.gaze));
  const separation = median(pairs.map((p) => dist(p.gaze, center)));
  if (rawNoise > 0 && separation < rawNoise * P.MIN_SEPARATION_RATIO) {
    return fail('시선 변화가 잡음보다 작아요');
  }

  const map = fitAffine(pairs);
  if (!map) return fail('변환식을 만들 수 없어요');

  // 정확도: 점 하나씩 빼고 맞혀 보기
  const errs: number[] = [];
  pairs.forEach((p, i) => {
    const m = fitAffine(pairs.filter((_, j) => j !== i));
    if (m) errs.push(dist(m(p.gaze), p.screen));
  });
  const errorDp = errs.length ? median(errs) : Infinity;
  const errorCm = errorDp * P.CM_PER_DP;

  // 잡음: 가운데 점을 볼 때 변환된 시선의 흔들림
  const fixMapped = fixGaze.map(map);
  const noiseDp = fixMapped.length >= 2 ? median(fixMapped.map((g) => dist(g, medianPt(fixMapped)))) : 0;

  const quality: CalibrationQuality =
    errorCm <= P.GOOD_ERROR_CM ? 'good' : errorCm <= P.FAIR_ERROR_CM ? 'fair' : 'poor';

  return {
    screen,
    map: quality === 'poor' ? null : map,
    errorDp,
    errorCm,
    noiseDp,
    quality,
    head,
    summary:
      quality === 'poor'
        ? `시선 오차 ${errorCm.toFixed(1)}cm — 고개 방향 위주로 측정해요`
        : `시선 오차 약 ${errorCm.toFixed(1)}cm (${quality === 'good' ? '좋음' : '보통'})`,
  };
}

/** 보정 화면에 띄울 점 5개 (가운데 + 네 모서리, 가장자리에서 15% 안쪽) */
export function calibrationTargets(width: number, height: number, inset = 0.15): Pt[] {
  const x0 = width * inset;
  const x1 = width * (1 - inset);
  const y0 = height * inset;
  const y1 = height * (1 - inset);
  return [
    { x: width / 2, y: height / 2 },
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}
