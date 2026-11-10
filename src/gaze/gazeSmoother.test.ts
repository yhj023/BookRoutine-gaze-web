import { describe, expect, it } from 'vitest';
import { createGazeSmoother, GAZE_DOT_POLICY } from './gazeSmoother';

const P = { WINDOW_MS: 1000, STALE_MS: 1500, DEADZONE_PX: 0 };

describe('createGazeSmoother', () => {
  it('튀는 값 하나는 중앙값으로 무시됨', () => {
    const s = createGazeSmoother(P);
    s.push(0, { x: 100, y: 100 });
    s.push(250, { x: 102, y: 98 });
    const out = s.push(500, { x: 900, y: -500 }); // 튀는 값
    expect(out).toEqual({ x: 102, y: 98 });
  });

  it('WINDOW_MS 가 지난 값은 빠짐 → 새 위치로 따라감', () => {
    const s = createGazeSmoother(P);
    s.push(0, { x: 0, y: 0 });
    s.push(250, { x: 0, y: 0 });
    expect(s.push(1400, { x: 500, y: 300 })).toEqual({ x: 500, y: 300 });
  });

  it('얼굴을 놓쳐 값이 안 오면 잠시 뒤 null', () => {
    const s = createGazeSmoother(P);
    s.push(0, { x: 10, y: 10 });
    expect(s.push(500, null)).toEqual({ x: 10, y: 10 });
    expect(s.push(1200, null)).toBeNull();
  });

  it('DEADZONE_PX 안쪽 변화는 무시, 바깥이면 따라감', () => {
    const s = createGazeSmoother({ ...P, WINDOW_MS: 0, DEADZONE_PX: 50 });
    expect(s.push(0, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
    expect(s.push(100, { x: 130, y: 120 })).toEqual({ x: 100, y: 100 }); // 36px → 그대로
    expect(s.push(200, { x: 200, y: 100 })).toEqual({ x: 200, y: 100 }); // 100px → 이동
  });

  it('기본 떨림 무시 거리는 약 1.5cm (57px)', () => {
    expect(GAZE_DOT_POLICY.DEADZONE_PX).toBe(57);
  });
});
