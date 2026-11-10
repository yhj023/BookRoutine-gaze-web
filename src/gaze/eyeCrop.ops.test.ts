/**
 * OpenCV 연산 비교 — scripts/compare/py_ops_fixture.py 가 만든 정답과 픽셀 단위로 비교.
 * 정답 파일이 없으면 건너뜀:  npm run compare:ops  먼저 실행.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRotationMatrix2D, resizeLinear, warpAffine, type Affine, type Img } from './eyeCrop';
import { pixelDiff } from './testUtils';

const DIR = join(process.cwd(), 'data', 'compare', 'ops');
const has = existsSync(join(DIR, 'manifest.json'));

interface FileRef {
  file: string;
  width: number;
  height: number;
}
const load = (r: FileRef): Img => ({
  width: r.width,
  height: r.height,
  channels: 3,
  data: new Uint8Array(readFileSync(join(DIR, r.file))),
});

describe.skipIf(!has)('OpenCV 연산과 같은지', () => {
  const m = has ? JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf-8')) : null;

  it('getRotationMatrix2D', () => {
    for (const c of m.rotation) {
      const got = getRotationMatrix2D({ x: c.center[0], y: c.center[1] }, c.angle, c.scale);
      got.flat().forEach((v, i) => expect(v).toBeCloseTo(c.matrix.flat()[i], 10));
    }
  });

  it('warpAffine (224×224)', () => {
    const src = load(m.warpSrc);
    const rows = m.warp.map((c: { matrix: Affine; size: number } & FileRef, i: number) => {
      const d = pixelDiff(warpAffine(src, c.matrix, c.size, c.size), load(c));
      return { case: i, ...d };
    });
    console.table(rows);
    // 값이 정확히 x.5 근처일 때 float32 계산 순서로 1 차이가 날 수 있음 (드물게)
    for (const r of rows) {
      expect(r.max, `warp_${r.case}`).toBeLessThanOrEqual(1);
      expect(r.diffCount / r.total, `warp_${r.case}`).toBeLessThan(0.001);
    }
  });

  it('resize (→ 64×64)', () => {
    const rows = m.resize.map((c: { src: FileRef; out: FileRef }) => {
      const d = pixelDiff(resizeLinear(load(c.src), c.out.width, c.out.height), load(c.out));
      return { from: `${c.src.width}×${c.src.height}`, ...d };
    });
    console.table(rows);
    for (const r of rows) expect(r.max, r.from).toBe(0);
  });
});
