/** 테스트 전용: 두 이미지의 픽셀 차이 */
import type { Img } from './eyeCrop';

export interface PixelDiff {
  max: number;
  mean: number;
  /** 값이 다른 채널 수 */
  diffCount: number;
  total: number;
}

export function pixelDiff(a: Img, b: Img): PixelDiff {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error(`크기가 달라요: ${a.width}×${a.height}×${a.channels} vs ${b.width}×${b.height}×${b.channels}`);
  }
  let max = 0;
  let sum = 0;
  let diffCount = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > max) max = d;
    if (d) diffCount++;
    sum += d;
  }
  return { max, mean: sum / a.data.length, diffCount, total: a.data.length };
}
