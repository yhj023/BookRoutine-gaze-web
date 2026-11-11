import { describe, expect, it } from 'vitest';
import { createReadingSession, formatMs, longestLine } from './readingSession';

const P = { DISTRACT_MS: 1000, PAGE_MIN_MS: 3000, RESUME_TOAST_MS: 2000, MAX_STEP_MS: 1000 } as const;
const F = { state: 'focused' } as const;
const U = { state: 'unfocused', detail: 'head' } as const;
const at = (page: number, line: number) => ({ page, line });

describe('읽기 기록', () => {
  it('읽은 시간·집중 비율·줄마다 머문 시간 (250ms 간격)', () => {
    const s = createReadingSession(P);
    for (let t = 0; t <= 4000; t += 250) s.push(t, t < 3000 ? F : U, at(0, t < 2000 ? 0 : 1));
    const sum = s.summary(100);
    expect(sum.activeMs).toBe(4000);
    expect(sum.focusRatio).toBeCloseTo(2750 / 4000); // 첫 push 는 간격 0 → 집중 250~2750
    expect(sum.lineMs[0][0]).toBe(1750); // 첫 push 는 간격 0
    expect(sum.lineMs[0][1]).toBe(2250);
    expect(sum.charsPerMin).toBeCloseTo(100 / (4000 / 60000));
  });

  it('자리 비움·눈 감음이면 읽은 시간이 멈춤', () => {
    const s = createReadingSession(P);
    expect(s.push(0, F, null).paused).toBe(false);
    expect(s.push(500, { state: 'away' }, null).paused).toBe(true);
    s.push(1000, { state: 'unfocused', detail: 'eyes-closed' }, null);
    s.push(1500, F, null);
    expect(s.activeMs).toBe(500); // 0→500 (그때 판정이 멈춤이라 안 셈)… 1000→1500 만
  });

  it('딴짓이 1초 넘게 이어지면 1번 + 책갈피, 돌아오면 resumed 한 번', () => {
    const s = createReadingSession(P);
    s.push(0, F, null);
    expect(s.push(250, U, null).distracted).toBe(false);
    expect(s.push(1000, U, null).distracted).toBe(false);
    expect(s.push(1250, U, null).distracted).toBe(true);
    expect(s.push(1500, U, null).distracted).toBe(true);
    expect(s.push(1750, F, null)).toMatchObject({ distracted: false, resumed: true });
    expect(s.push(2000, F, null).resumed).toBe(false);
    // 0.5초 짧은 딴짓은 세지 않음
    s.push(2250, U, null);
    s.push(2750, F, null);
    expect(s.summary(0).distractions).toBe(1);
  });

  it('간격이 너무 길면 MAX_STEP 만큼만, skipGap 뒤 첫 간격은 셈하지 않음', () => {
    const s = createReadingSession(P);
    s.push(0, F, null);
    s.push(10_000, F, null);
    expect(s.activeMs).toBe(1000);
    s.skipGap();
    s.push(10_500, F, null);
    expect(s.activeMs).toBe(1000);
  });
});

describe('도움 함수', () => {
  it('가장 오래 머문 줄, 시간 글자', () => {
    expect(longestLine([[100, 300], [], [50, 400, 20]])).toEqual({ page: 2, line: 1 });
    expect(longestLine([])).toBeNull();
    expect(formatMs(42_900)).toBe('0:42');
    expect(formatMs(125_000)).toBe('2:05');
  });
});
