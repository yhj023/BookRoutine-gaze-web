/** 사진 없이 도는 작은 테스트 */
import { describe, expect, it } from 'vitest';
import { cvRound, extractEyes, getRotationMatrix2D, resizeLinear, warpAffine, type Img } from './eyeCrop';
import { LEFT_EYE_INNER, LEFT_EYE_OUTER, RIGHT_EYE_INNER, RIGHT_EYE_OUTER } from './landmarkIndices';

function noise(w: number, h: number, cn = 3, seed = 1): Img {
  const data = new Uint8Array(w * h * cn);
  let s = seed;
  for (let i = 0; i < data.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    data[i] = s & 255;
  }
  return { width: w, height: h, channels: cn, data };
}

describe('cvRound', () => {
  it('딱 절반이면 짝수 쪽', () => {
    expect([0.5, 1.5, 2.5, -0.5, -1.5, 2.4, 2.6].map(cvRound)).toEqual([0, 2, 2, -0, -2, 2, 3]);
  });
});

describe('getRotationMatrix2D', () => {
  it('각도 0, 배율 1이면 그대로', () => {
    expect(getRotationMatrix2D({ x: 10, y: 20 }, 0, 1)).toEqual([
      [1, 0, 0],
      [-0, 1, 0],
    ]);
  });
});

describe('warpAffine', () => {
  it('정수만큼 옮기면 픽셀이 그대로 옮겨지고 바깥은 0', () => {
    const src = noise(8, 6);
    const out = warpAffine(src, [[1, 0, 1], [0, 1, 0]], 8, 6);
    for (let y = 0; y < 6; y++) {
      expect(out.data.slice(y * 24, y * 24 + 3)).toEqual(new Uint8Array([0, 0, 0]));
      for (let x = 1; x < 8; x++)
        for (let c = 0; c < 3; c++) expect(out.data[(y * 8 + x) * 3 + c]).toBe(src.data[(y * 8 + x - 1) * 3 + c]);
    }
  });
});

describe('resizeLinear', () => {
  it('크기가 같으면 그대로', () => {
    const src = noise(17, 13);
    expect(resizeLinear(src, 17, 13).data).toEqual(src.data);
  });
  it('RGBA도 채널마다 RGB와 같은 결과', () => {
    const rgb = noise(37, 29, 3, 7);
    const rgba: Img = { width: 37, height: 29, channels: 4, data: new Uint8Array(37 * 29 * 4) };
    for (let i = 0; i < 37 * 29; i++) for (let c = 0; c < 3; c++) rgba.data[i * 4 + c] = rgb.data[i * 3 + c];
    const a = resizeLinear(rgb, 64, 64);
    const b = resizeLinear(rgba, 64, 64);
    for (let i = 0; i < 64 * 64; i++) for (let c = 0; c < 3; c++) expect(b.data[i * 4 + c]).toBe(a.data[i * 3 + c]);
  });
});

describe('extractEyes', () => {
  it('눈 구석이 한 점에 겹치면 null', () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    expect(extractEyes(noise(64, 48), lm)).toBeNull();
  });
  it('수평한 두 눈 → 기울기 0, 64×64 크롭 두 장, 224 얼굴', () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    // 눈 윤곽 점은 눈 중심 주변에 흩어 둔다
    const ring = (cx: number, cy: number) => (i: number) => ({ x: cx + 0.03 * Math.cos(i), y: cy + 0.015 * Math.sin(i) });
    const L = ring(0.4, 0.45);
    const R = ring(0.6, 0.45);
    for (let i = 0; i < 478; i++) lm[i] = i % 2 ? L(i) : R(i);
    lm[LEFT_EYE_OUTER] = { x: 0.37, y: 0.45 };
    lm[LEFT_EYE_INNER] = { x: 0.43, y: 0.45 };
    lm[RIGHT_EYE_OUTER] = { x: 0.63, y: 0.45 };
    lm[RIGHT_EYE_INNER] = { x: 0.57, y: 0.45 };
    const r = extractEyes(noise(640, 480), lm)!;
    expect(r).not.toBeNull();
    expect(r.tiltDeg).toBe(0);
    expect([r.leftEye.width, r.leftEye.height, r.rightEye.width, r.faceNormalized.width]).toEqual([64, 64, 64, 224]);
  });
});
