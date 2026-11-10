import { describe, expect, it } from 'vitest';
import { eyeToTensorData, GAZE_INPUT_SHAPE } from './gazeInput';

describe('eyeToTensorData', () => {
  it('RGBA → RGB 0~255, 알파는 버리고 픽셀 순서(HWC)는 그대로', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 0, 128, 255, 7]);
    const out = eyeToTensorData({ width: 2, height: 1, channels: 4, data });
    expect(Array.from(out)).toEqual([10, 20, 30, 0, 128, 255]);
  });

  it('RGB 입력은 값이 그대로 (나누기 없음 — 모델 안에서 /255)', () => {
    const data = new Uint8Array([0, 1, 254, 255, 100, 200]);
    const out = eyeToTensorData({ width: 1, height: 2, channels: 3, data });
    expect(out).toBeInstanceOf(Float32Array);
    expect(Array.from(out)).toEqual([0, 1, 254, 255, 100, 200]);
  });

  it('64×64 크롭이면 모델 입력 [1,64,64,3] 크기', () => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    const out = eyeToTensorData({ width: 64, height: 64, channels: 4, data });
    expect(out.length).toBe(GAZE_INPUT_SHAPE.reduce<number>((a, b) => a * b, 1));
  });
});
