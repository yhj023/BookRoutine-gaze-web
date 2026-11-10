/**
 * 얼굴 사진으로 파이썬(reference/eye_extractor.py)과 TS 눈 크롭 비교.
 * 순서: /try 에서 "사진 저장" → 파일을 data/compare/ 로 → npm run compare:py → npm test
 * data/compare/out 이 없으면 건너뜀.
 *
 * (A) 계산 비교: 파이썬 랜드마크를 그대로 넣어 TS 크롭 vs 파이썬 크롭 → 최대 차이 ≤ 1 이어야 통과
 * (B) 전체 흐름: 웹 MediaPipe 랜드마크(.landmarks.json)로 만든 TS 크롭 vs 파이썬 크롭 → 숫자만 출력
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractEyes, type EyeCropResult, type Img } from './eyeCrop';
import { EYE_CORNERS, LEFT_EYE_RING, RIGHT_EYE_RING } from './landmarkIndices';
import { pixelDiff } from './testUtils';

const IN_DIR = join(process.cwd(), 'data', 'compare');
const OUT_DIR = join(IN_DIR, 'out');
const stems = existsSync(OUT_DIR)
  ? readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.py.json'))
      .map((f) => f.slice(0, -'.py.json'.length))
  : [];

interface PyMeta {
  width: number;
  height: number;
  face: boolean;
  landmarks?: [number, number][];
  tiltDeg?: number;
}

const rgb = (file: string, width: number, height: number): Img => ({
  width,
  height,
  channels: 3,
  data: new Uint8Array(readFileSync(join(OUT_DIR, file))),
});

function cropDiffs(stem: string, ts: EyeCropResult) {
  const out: Record<string, ReturnType<typeof pixelDiff>> = {};
  out.left = pixelDiff(ts.leftEye, rgb(`${stem}.left.rgb`, 64, 64));
  out.right = pixelDiff(ts.rightEye, rgb(`${stem}.right.rgb`, 64, 64));
  out.face = pixelDiff(ts.faceNormalized, rgb(`${stem}.face.rgb`, 224, 224));
  return out;
}

describe.skipIf(stems.length === 0)('얼굴 사진: 파이썬 vs TS 눈 크롭', () => {
  for (const stem of stems) {
    const meta: PyMeta = JSON.parse(readFileSync(join(OUT_DIR, `${stem}.py.json`), 'utf-8'));
    const image = rgb(`${stem}.rgb`, meta.width, meta.height);

    it.skipIf(!meta.face)(`(A) ${stem} — 같은 랜드마크`, () => {
      const lm = meta.landmarks!.map(([x, y]) => ({ x, y }));
      const ts = extractEyes(image, lm);
      expect(ts, 'TS 크롭이 null').not.toBeNull();
      const d = cropDiffs(stem, ts!);
      console.log(`(A) ${stem}  tilt py=${meta.tiltDeg!.toFixed(6)} ts=${ts!.tiltDeg.toFixed(6)}`);
      console.table(d);
      expect(Math.abs(ts!.tiltDeg - meta.tiltDeg!)).toBeLessThan(1e-4);
      for (const [k, v] of Object.entries(d)) expect(v.max, k).toBeLessThanOrEqual(1);
    });

    const webFile = join(IN_DIR, `${stem}.landmarks.json`);
    it.skipIf(!meta.face || !existsSync(webFile))(`(B) ${stem} — 웹 랜드마크 (참고용)`, () => {
      const web: { x: number; y: number }[] = JSON.parse(readFileSync(webFile, 'utf-8')).landmarks;
      const py = meta.landmarks!;
      const px = (i: number) =>
        Math.hypot((web[i].x - py[i][0]) * meta.width, (web[i].y - py[i][1]) * meta.height);
      const stat = (idx: readonly number[]) => {
        const ds = idx.map(px);
        return { meanPx: ds.reduce((a, b) => a + b, 0) / ds.length, maxPx: Math.max(...ds) };
      };
      const all = Array.from({ length: Math.min(web.length, py.length) }, (_, i) => i);
      console.log(`(B) ${stem}  랜드마크 차이 (원본 사진 px)`);
      console.table({
        '눈 구석 4개': stat(EYE_CORNERS),
        '눈 윤곽 32개': stat([...LEFT_EYE_RING, ...RIGHT_EYE_RING]),
        '전체 478개': stat(all),
      });
      const ts = extractEyes(image, web);
      if (!ts) {
        console.log('웹 랜드마크로는 크롭 실패');
        return;
      }
      console.log(`(B) ${stem}  크롭 차이  tilt py=${meta.tiltDeg!.toFixed(3)} web=${ts.tiltDeg.toFixed(3)}`);
      console.table(cropDiffs(stem, ts));
    });
  }
});
