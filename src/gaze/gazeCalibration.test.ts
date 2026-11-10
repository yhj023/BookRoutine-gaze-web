import { describe, expect, it } from 'vitest';
// BookRoutine_app/lib/gaze/gazeCalibration.spec.ts 를 옮김 (단위 dp → CSS px)
import { calibrationTargets, computeCalibration, fitAffine, type CalibPointData, type Pt } from './gazeCalibration';

const SCREEN = { width: 400, height: 800 };
/** 가짜 모델: 화면 위치(CSS px) → 모델 출력(cm). 좌우 반전 + 축소 + 어긋남 + 잡음 */
const fakeModel = (p: Pt, noise = 0, seed = 1): Pt => {
  const r = Math.sin(seed * 12.9898) * 43758.5453;
  const n = (r - Math.floor(r) - 0.5) * 2 * noise;
  return { x: -(p.x - 200) / 40 + 3 + n, y: (p.y - 400) / 50 - 8 - n };
};

/** 점 하나를 보는 동안 0.25초 간격으로 2.5초 수집 */
const look = (target: Pt, t0: number, noise: number, model = fakeModel): CalibPointData => ({
  target,
  shownAt: t0,
  obs: Array.from({ length: 10 }, (_, i) => ({
    t: t0 + i * 250,
    gaze: model(target, noise, t0 + i),
    yaw: 3,
    pitch: -12,
  })),
});

describe('gazeCalibration', () => {
  it('fitAffine 은 좌우 반전·축소·어긋남을 정확히 되돌림', () => {
    const pairs = calibrationTargets(400, 800).map((s) => ({ screen: s, gaze: fakeModel(s) }));
    const map = fitAffine(pairs)!;
    const back = map(fakeModel({ x: 123, y: 456 }));
    expect(back.x).toBeCloseTo(123, 5);
    expect(back.y).toBeCloseTo(456, 5);
  });

  it('잡음이 작으면 good, 오차·잡음·고개 기준이 계산됨', () => {
    const pts = calibrationTargets(400, 800).map((t, i) => look(t, i * 3000, 0.2));
    const cal = computeCalibration(pts, look({ x: 200, y: 400 }, 20000, 0.2), SCREEN);
    expect(cal.quality).toBe('good');
    expect(cal.map).not.toBeNull();
    expect(cal.errorCm).toBeLessThan(2.5);
    expect(cal.noisePx).toBeGreaterThan(0);
    expect(cal.head).toEqual({ yaw: 3, pitch: -12 });
  });

  it('점이 나타난 직후(0.7초)의 값은 버림', () => {
    const pts = calibrationTargets(400, 800).map((t, i) => {
      const p = look(t, i * 3000, 0.1);
      p.obs[0].gaze = { x: 999, y: 999 }; // 이동 중 튀는 값
      p.obs[1].gaze = { x: -999, y: -999 };
      return p;
    });
    expect(computeCalibration(pts, look({ x: 200, y: 400 }, 20000, 0.1), SCREEN).quality).toBe('good');
  });

  it('모델 출력이 어디를 봐도 거의 같으면 poor (시선 사용 안 함)', () => {
    const flat = (_p: Pt, noise = 0, seed = 1) => fakeModel({ x: 200, y: 400 }, noise, seed);
    const pts = calibrationTargets(400, 800).map((t, i) => look(t, i * 3000, 0.5, flat));
    const cal = computeCalibration(pts, look({ x: 200, y: 400 }, 20000, 0.5, flat), SCREEN);
    expect(cal.quality).toBe('poor');
    expect(cal.map).toBeNull();
  });

  it('(웹 추가) 오차가 커서 poor 여도 변환식이 만들어졌으면 fittedMap 은 남음 (판정용 map 은 null)', () => {
    // 가운데 점만 모델 값이 크게 어긋남 → 아핀 변환으로 못 맞춰서 오차가 큼 (poor)
    const bent = (p: Pt) => {
      const g = fakeModel(p);
      return p.x === 200 && p.y === 400 ? { x: g.x + 8, y: g.y + 8 } : g;
    };
    const pts = calibrationTargets(400, 800).map((t, i) => look(t, i * 3000, 0, bent));
    const cal = computeCalibration(pts, look({ x: 200, y: 400 }, 20000, 0.01), SCREEN);
    expect(cal.quality).toBe('poor');
    expect(cal.map).toBeNull();
    expect(cal.fittedMap).not.toBeNull();
    expect(Number.isFinite(cal.errorCm)).toBe(true);
  });

  it('값이 거의 안 모이면 poor', () => {
    const pts = calibrationTargets(400, 800).map((t) => ({ target: t, shownAt: 0, obs: [] }));
    expect(computeCalibration(pts, { target: { x: 200, y: 400 }, shownAt: 0, obs: [] }, SCREEN).quality).toBe('poor');
  });
});
