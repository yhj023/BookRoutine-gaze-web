import { describe, expect, it } from 'vitest';
import { headPoseFromMatrix } from './headPose';

type M3 = number[][];
const mul = (a: M3, b: M3): M3 => a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const rad = (d: number) => (d * Math.PI) / 180;
const Ry = (d: number): M3 => [[Math.cos(rad(d)), 0, Math.sin(rad(d))], [0, 1, 0], [-Math.sin(rad(d)), 0, Math.cos(rad(d))]];
const Rx = (d: number): M3 => [[1, 0, 0], [0, Math.cos(rad(d)), -Math.sin(rad(d))], [0, Math.sin(rad(d)), Math.cos(rad(d))]];
const Rz = (d: number): M3 => [[Math.cos(rad(d)), -Math.sin(rad(d)), 0], [Math.sin(rad(d)), Math.cos(rad(d)), 0], [0, 0, 1]];

/** 회전 + 이동(얼굴이 카메라 앞 50cm) 4×4 를 펼침 */
function flat(yaw: number, pitch: number, roll: number, colMajor: boolean): number[] {
  const R = mul(mul(Ry(yaw), Rx(pitch)), Rz(roll));
  const T = [1.5, -2, -50];
  const M = [...R.map((row, i) => [...row, T[i]]), [0, 0, 0, 1]];
  const out: number[] = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out.push(colMajor ? M[j][i] : M[i][j]);
  return out;
}

describe('headPoseFromMatrix', () => {
  it('정면이면 0, 0', () => {
    const p = headPoseFromMatrix(flat(0, 0, 0, true))!;
    expect(p.yaw).toBeCloseTo(0, 6);
    expect(p.pitch).toBeCloseTo(0, 6);
  });

  for (const colMajor of [true, false]) {
    it(`yaw/pitch/roll 을 섞어도 yaw, pitch 를 되찾음 (${colMajor ? '열' : '행'} 순서)`, () => {
      for (const [y, p, r] of [[30, 0, 0], [0, -20, 0], [25, 15, 10], [-40, 10, -15]]) {
        const out = headPoseFromMatrix(flat(y, p, r, colMajor))!;
        expect(out.yaw).toBeCloseTo(y, 6);
        expect(out.pitch).toBeCloseTo(p, 6);
      }
    });
  }

  it('행렬이 없으면 null', () => {
    expect(headPoseFromMatrix(null)).toBeNull();
    expect(headPoseFromMatrix([1, 2, 3])).toBeNull();
  });
});
