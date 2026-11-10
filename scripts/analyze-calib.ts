/**
 * 보정 데이터 분석: 오차가 "떨림" 때문인지 "위치가 틀려서(모델 한계)"인지 나눠 본다.
 * 실행: npm run analyze:calib   (data/calib/*.json — /try 보정 결과 화면의 "보정 데이터 저장")
 *
 * 보는 것
 *  - 점마다: 안정된 샘플 수, 대표값(중앙값), 떨림(대표값에서 얼마나 흩어졌나, cm)
 *  - 떨림이 대표값에 남기는 오차 ≈ 떨림 × 1.25 / √n  (중앙값의 표준오차 대략값)
 *  - 5점 변환식으로 각 점을 다시 맞혀 봤을 때 남는 차이(잔차) — 떨림으로 설명 안 되면 모델 한계
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CALIBRATION_POLICY,
  computeCalibration,
  fitAffine,
  settled,
  type CalibPointData,
  type Pt,
} from '../src/gaze/gazeCalibration';

const dir = join(process.cwd(), 'data', 'calib');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.log(`파일이 없어요: ${dir}`);
  process.exit(1);
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
};
const medPt = (ps: Pt[]): Pt => ({ x: median(ps.map((p) => p.x)), y: median(ps.map((p) => p.y)) });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const CM = CALIBRATION_POLICY.CM_PER_PX;
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

for (const file of files) {
  const d = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as {
    screen: { width: number; height: number };
    points: CalibPointData[];
    fixation: CalibPointData | null;
  };
  console.log(`\n=== ${file}  화면 ${d.screen.width}×${d.screen.height}px`);
  const rows = d.points.map((p) => {
    const all = p.obs.length;
    const s = settled(p);
    const g = medPt(s.map((o) => o.gaze));
    const spread = median(s.map((o) => dist(o.gaze, g)));
    const dt = s.length > 1 ? (s[s.length - 1].t - s[0].t) / (s.length - 1) : NaN;
    return { target: p.target, all, n: s.length, s, g, spread, dt };
  });
  const pairs = rows.filter((r) => r.n >= CALIBRATION_POLICY.MIN_SAMPLES_PER_POINT).map((r) => ({ screen: r.target, gaze: r.g }));
  const full = fitAffine(pairs);

  console.log('(떨림·잔차는 화면 위 cm. 떨림→오차 = 떨림이 이 점의 대표값을 얼마나 흔드는지)');
  console.log('점(px)            샘플(전체/안정)  모델 값 (cm)      떨림(cm)  떨림→오차(cm)  잔차(cm)  간격(ms)');
  for (const r of rows) {
    const resid = full ? dist(full(r.g), r.target) * CM : NaN;
    // 화면 위에서 본 떨림 (변환식으로 옮긴 뒤 거리)
    const spreadScreen = full ? median(r.s.map((o) => dist(full(o.gaze), full(r.g)))) * CM : NaN;
    const noiseErr = (spreadScreen * 1.25) / Math.sqrt(Math.max(r.n, 1));
    console.log(
      `(${f(r.target.x, 0).padStart(5)},${f(r.target.y, 0).padStart(5)})   ${String(r.all).padStart(4)}/${String(r.n).padEnd(4)}       ` +
        `(${f(r.g.x).padStart(6)}, ${f(r.g.y).padStart(6)})  ${f(spreadScreen).padStart(6)}    ${f(noiseErr).padStart(6)}        ${f(resid).padStart(6)}   ${f(r.dt, 0)}`,
    );
  }

  if (d.fixation) {
    const s = settled(d.fixation);
    const g = medPt(s.map((o) => o.gaze));
    console.log(`가운데 응시: 안정 샘플 ${s.length}개, 모델 떨림 ${f(median(s.map((o) => dist(o.gaze, g))))}cm (모델 출력 단위)`);
    const cal = computeCalibration(d.points, d.fixation, d.screen);
    console.log(`보정 결과(앱과 같은 계산): ${cal.quality} · 처음 보는 점 오차 ${f(cal.errorCm, 1)}cm · 화면 흔들림 ${f(cal.noisePx * CM, 1)}cm`);
  }
  const center = medPt(pairs.map((p) => p.gaze));
  console.log(`점들 사이 모델 값 차이(가운데에서 평균 거리): ${f(median(pairs.map((p) => dist(p.gaze, center))))}cm`);
}
