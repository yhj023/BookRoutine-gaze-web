/**
 * 같은 눈 크롭으로 웹 LiteRT.js(GPU·CPU) 시선 값 vs 파이썬 ai-edge-litert 시선 값 비교.
 * 순서: npm run compare:py → npm run compare:gaze → /try 의 "비교 실행"
 *       → 내려받은 gaze-compare.json 을 data/compare/ 로 → npm test
 * data/compare/gaze-compare.json 이 없으면 건너뜀.
 *
 * 통과 조건 (앱이 쓰는 CPU(wasm)만. WebGPU 는 기본 fp16 이라 0.1~0.7 cm 달라서 숫자만 출력)
 *   - |Δx|, |Δy| < 0.01 cm (같은 입력이라 계산 장치의 소수점 차이만 허용)
 *   - 입력 순서 확인: 웹 값이 파이썬 '바꿔 넣은 값'보다 파이썬 '그대로 값'에 훨씬 가까움
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type XY = [number, number];
interface WebRow {
  stem: string;
  accelerator: 'webgpu' | 'wasm';
  gaze: XY;
  gazeSwapped: XY;
}
interface PyGaze {
  gaze: XY;
  gazeSwapped: XY;
}

const TOL_CM = 0.01;
const IN_DIR = join(process.cwd(), 'data', 'compare');
const WEB_FILE = join(IN_DIR, 'gaze-compare.json');
const rows: WebRow[] = existsSync(WEB_FILE) ? JSON.parse(readFileSync(WEB_FILE, 'utf-8')) : [];

const maxDiff = (a: XY, b: XY) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const pyFor = (stem: string): PyGaze | null => {
  const p = join(IN_DIR, 'out', `${stem}.py.gaze.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : null;
};

describe.skipIf(rows.length === 0)('웹 LiteRT.js vs 파이썬 시선 값 (같은 크롭)', () => {
  it.each(rows.map((r) => [`${r.stem} ${r.accelerator}`, r] as const))('%s', (_name, r) => {
    const py = pyFor(r.stem);
    expect(py, `${r.stem}.py.gaze.json 없음 — npm run compare:gaze`).not.toBeNull();
    const d = maxDiff(r.gaze, py!.gaze);
    const dSwap = maxDiff(r.gazeSwapped, py!.gazeSwapped);
    const dWrongOrder = maxDiff(r.gaze, py!.gazeSwapped);
    console.log(
      `${r.stem} ${r.accelerator.padEnd(6)} 웹 (${r.gaze.map((v) => v.toFixed(4)).join(', ')})` +
        ` 파이썬 (${py!.gaze.map((v) => v.toFixed(4)).join(', ')})  차이 ${d.toExponential(2)} cm` +
        `  · 바꿔 넣기 차이 ${dSwap.toExponential(2)} · 순서 틀리면 ${dWrongOrder.toFixed(3)} cm`,
    );
    if (r.accelerator !== 'wasm') return; // GPU 는 참고용
    expect(d).toBeLessThan(TOL_CM);
    expect(dSwap).toBeLessThan(TOL_CM);
    // 왼·오가 거의 같은 사진이면 순서 확인이 안 되니, 차이가 클 때만 확인
    if (maxDiff(py!.gaze, py!.gazeSwapped) > 10 * TOL_CM) expect(d).toBeLessThan(dWrongOrder);
  });
});
