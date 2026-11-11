import { describe, expect, it } from 'vitest';
import {
  alignTwoPoint,
  applyCorrection,
  createDwell,
  createLineTracker,
  createOutsideHold,
  createReadingSmoother,
  createRecent,
  distToRect,
  groupLines,
  medianPt,
  nearestRect,
  quadrantOf,
  recentMedian,
  textAreaMargin,
} from './readingGaze';

const R = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe('가장 가까운 단어', () => {
  it('안이면 거리 0, 밖이면 가장자리까지 거리', () => {
    expect(distToRect({ x: 5, y: 5 }, R(0, 0, 10, 10))).toBe(0);
    expect(distToRect({ x: 13, y: 14 }, R(0, 0, 10, 10))).toBe(5);
  });

  it('가장 가까운 사각형 번호', () => {
    const rs = [R(0, 0, 50, 40), R(60, 0, 120, 40), R(0, 80, 50, 120)];
    expect(nearestRect({ x: 100, y: 20 }, rs)).toBe(1);
    expect(nearestRect({ x: 10, y: 70 }, rs)).toBe(2);
    expect(nearestRect({ x: 0, y: 0 }, [])).toBe(-1);
  });
});

describe('groupLines', () => {
  it('같은 높이 단어는 한 줄, 아래로 내려가면 새 줄', () => {
    const words = [R(0, 0, 50, 40), R(60, 2, 100, 42), R(0, 80, 40, 120), R(50, 80, 90, 120)];
    const { lineOf, lines } = groupLines(words);
    expect(lineOf).toEqual([0, 0, 1, 1]);
    expect(lines[0]).toEqual(R(0, 0, 100, 42));
    expect(lines[1]).toEqual(R(0, 80, 90, 120));
  });
});

describe('createDwell (0.25초 머물러야 옮김)', () => {
  it('새 단어는 250ms 지나야 바뀌고, 그 전에 돌아오면 그대로', () => {
    const d = createDwell(250);
    expect(d.push(0, 3)).toBeNull();
    expect(d.push(100, 3)).toBeNull();
    expect(d.push(250, 3)).toBe(3);
    expect(d.push(300, 4)).toBe(3); // 잠깐 옆 단어
    expect(d.push(400, 3)).toBe(3); // 돌아옴
    expect(d.push(500, 4)).toBe(3);
    expect(d.push(749, 4)).toBe(3);
    expect(d.push(750, 4)).toBe(4);
  });

  it('글 밖(null)이면 바로 숨기고, 다시 들어오면 처음부터 셈', () => {
    const d = createDwell(250);
    d.push(0, 1);
    d.push(300, 1);
    expect(d.push(400, null)).toBeNull();
    expect(d.push(500, 1)).toBeNull();
    expect(d.push(750, 1)).toBe(1);
  });
});

describe('quadrantOf', () => {
  it('2×2 칸 번호', () => {
    expect(quadrantOf({ x: 10, y: 10 }, 100, 100)).toBe(0);
    expect(quadrantOf({ x: 90, y: 10 }, 100, 100)).toBe(1);
    expect(quadrantOf({ x: 10, y: 90 }, 100, 100)).toBe(2);
    expect(quadrantOf({ x: 90, y: 90 }, 100, 100)).toBe(3);
  });
});

describe('위치 맞추기', () => {
  it('중앙값: 튀는 값 하나에 흔들리지 않음', () => {
    expect(medianPt([])).toBeNull();
    expect(medianPt([{ x: 1, y: 10 }, { x: 3, y: 30 }, { x: 100, y: 20 }])).toEqual({ x: 3, y: 20 });
  });

  it('최근 1초 안의 점만 남김', () => {
    const r = createRecent(1000);
    r.push(0, { x: 0, y: 0 });
    r.push(600, { x: 1, y: 1 });
    r.push(1200, { x: 2, y: 2 });
    expect(r.points(1200)).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(r.points(2500)).toEqual([]); // 오래 값이 없으면 비어 있음
  });

  it('최근 중앙값: 값이 모자라면 null', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ x: 100 + (i % 2) * 4, y: 250 }));
    expect(recentMedian(pts, 4)).toEqual({ x: 100, y: 250 });
    expect(recentMedian(pts.slice(0, 3), 4)).toBeNull();
  });

  it('두 점: 아래쪽이 위로 눌린 시선(목표 400px 차이 → 시선 200px 차이)을 2배로 펴 줌', () => {
    const top = { x: 100, y: 150 };
    const bottom = { x: 900, y: 550 };
    const c = alignTwoPoint(top, { x: 120, y: 200 }, bottom, { x: 880, y: 400 }, 0.5, 2.5)!;
    expect(c.sy).toBeCloseTo(2);
    expect(applyCorrection(c, { x: 120, y: 200 })).toEqual({ x: 120, y: 150 });
    expect(applyCorrection(c, { x: 880, y: 400 })).toEqual({ x: 880, y: 550 });
  });

  it('두 점: 배율은 범위 안으로 제한(가운데를 맞춤), 아래 점이 더 위면 null', () => {
    const c = alignTwoPoint({ x: 0, y: 100 }, { x: 0, y: 300 }, { x: 0, y: 500 }, { x: 0, y: 310 }, 0.5, 2.5)!;
    expect(c.sy).toBe(2.5);
    expect(applyCorrection(c, { x: 0, y: 305 }).y).toBeCloseTo(300);
    expect(alignTwoPoint({ x: 0, y: 100 }, { x: 0, y: 300 }, { x: 0, y: 500 }, { x: 0, y: 290 })).toBeNull();
  });
});

describe('글 밖 판정', () => {
  it('여유 = 보정 오차, 최소 40px', () => {
    expect(textAreaMargin(178)).toBe(178);
    expect(textAreaMargin(10)).toBe(40);
    expect(textAreaMargin(Infinity)).toBe(40);
  });

  it('1초 동안 계속 밖이어야 글 밖, 중간에 안으로 오면 처음부터', () => {
    const h = createOutsideHold(1000);
    expect(h.push(0, false)).toBe(false);
    expect(h.push(900, false)).toBe(false);
    expect(h.push(950, true)).toBe(false); // 잠깐 안으로
    expect(h.push(1000, false)).toBe(false);
    expect(h.push(1999, false)).toBe(false);
    expect(h.push(2000, false)).toBe(true);
  });
});

describe('줄 따라가기 (붙어 있기 + 읽는 순서)', () => {
  // 줄 가운데 y = 100, 232, 364, 496 (줄 간격 132px) → 경계 166, 298, 430
  const lines = [100, 232, 364, 496].map((c) => R(0, c - 30, 1000, c + 30));
  const opts = { stickPx: 45, nextDwellMs: 500, otherDwellMs: 1500, farDwellMs: 3000, noBackMs: 2000, startHoldMs: 2000 };
  const start = () => {
    const tr = createLineTracker(opts);
    tr.push(0, { x: 500, y: 100 }, lines);
    expect(tr.push(500, { x: 500, y: 100 }, lines)).toBe(0);
    return tr;
  };

  it('처음에는 0.5초 머물면 보여 줌', () => {
    const tr = createLineTracker(opts);
    expect(tr.push(0, { x: 500, y: 240 }, lines)).toBeNull();
    expect(tr.push(499, { x: 500, y: 240 }, lines)).toBeNull();
    expect(tr.push(500, { x: 500, y: 240 }, lines)).toBe(1);
  });

  it('경계(166)를 조금 넘어도(+45px 안) 지금 줄 그대로', () => {
    const tr = start();
    expect(tr.push(600, { x: 500, y: 205 }, lines)).toBe(0);
    expect(tr.push(5000, { x: 500, y: 210 }, lines)).toBe(0);
  });

  it('다음 줄은 0.5초 뒤에 옮김', () => {
    const tr = start();
    expect(tr.push(600, { x: 500, y: 232 }, lines)).toBe(0);
    expect(tr.push(1099, { x: 500, y: 232 }, lines)).toBe(0);
    expect(tr.push(1100, { x: 500, y: 232 }, lines)).toBe(1);
  });

  it('다음 줄로 옮긴 뒤 2초는 위 줄로 안 돌아가고, 그 뒤 1.5초 머물면 돌아감. 한 줄 건너뛰기도 1.5초', () => {
    const tr = start();
    tr.push(600, { x: 500, y: 232 }, lines);
    tr.push(1100, { x: 500, y: 232 }, lines); // 1번 줄, 3100 까지 위로 안 감
    expect(tr.push(1200, { x: 500, y: 100 }, lines)).toBe(1);
    expect(tr.push(3000, { x: 500, y: 100 }, lines)).toBe(1);
    expect(tr.push(3200, { x: 500, y: 100 }, lines)).toBe(1); // 후보 시작
    expect(tr.push(4699, { x: 500, y: 100 }, lines)).toBe(1);
    expect(tr.push(4700, { x: 500, y: 100 }, lines)).toBe(0);

    const tr2 = start();
    expect(tr2.push(600, { x: 500, y: 364 }, lines)).toBe(0); // 한 줄 건너뛰기
    expect(tr2.push(1100, { x: 500, y: 364 }, lines)).toBe(0);
    expect(tr2.push(2100, { x: 500, y: 364 }, lines)).toBe(2);
  });

  it('두 줄 넘게 떨어진 줄(마지막 줄 → 첫 줄)은 3초 머물러야 옮김', () => {
    const tr = createLineTracker(opts);
    tr.push(0, { x: 500, y: 496 }, lines);
    expect(tr.push(500, { x: 500, y: 496 }, lines)).toBe(3);
    expect(tr.push(600, { x: 500, y: 100 }, lines)).toBe(3);
    expect(tr.push(2100, { x: 500, y: 100 }, lines)).toBe(3);
    expect(tr.push(3599, { x: 500, y: 100 }, lines)).toBe(3);
    expect(tr.push(3600, { x: 500, y: 100 }, lines)).toBe(0);
  });

  it('후보가 중간에 바뀌면 처음부터 셈, clear 하면 숨김', () => {
    const tr = start();
    tr.push(600, { x: 500, y: 232 }, lines);
    tr.push(900, { x: 500, y: 364 }, lines); // 후보 바뀜
    expect(tr.push(1100, { x: 500, y: 232 }, lines)).toBe(0);
    expect(tr.push(1600, { x: 500, y: 232 }, lines)).toBe(1);
    tr.clear();
    expect(tr.push(1700, { x: 500, y: 232 }, lines)).toBeNull();
  });
});

describe('줄 끝 → 줄 앞 돌아오기', () => {
  const lines = [100, 232, 364, 496].map((c) => R(0, c - 30, 1000, c + 30));
  const P = (x: number, y: number) => ({ x, y });
  const opts = {
    stickPx: 45,
    nextDwellMs: 500,
    otherDwellMs: 1500,
    farDwellMs: 3000,
    noBackMs: 2000,
    startHoldMs: 2000,
    rightFrac: 0.65,
    leftFrac: 0.35,
    minLineMs: 1000,
  };
  /** 0번 줄을 보여 주고(500), 그 줄 왼쪽을 봄 */
  const onLine0 = () => {
    const tr = createLineTracker(opts);
    tr.push(0, P(100, 100), lines);
    expect(tr.push(500, P(200, 100), lines)).toBe(0);
    tr.push(600, P(100, 100), lines);
    return tr;
  };

  it('왼쪽 → 오른쪽 끝(65% 넘게) → 왼쪽(35% 안)이면 세로 값이 그대로여도 다음 줄', () => {
    const tr = onLine0();
    expect(tr.push(1000, P(500, 100), lines)).toBe(0);
    expect(tr.push(1500, P(800, 100), lines)).toBe(0);
    expect(tr.push(1600, P(200, 100), lines)).toBe(1);
  });

  it('오른쪽까지 안 갔으면 왼쪽으로 와도 그대로', () => {
    const tr = onLine0();
    tr.push(1000, P(600, 100), lines);
    expect(tr.push(1600, P(100, 100), lines)).toBe(0);
  });

  it('줄을 보여 준 지 1초가 안 됐으면 돌아오기를 세지 않음', () => {
    const tr = onLine0();
    tr.push(800, P(900, 100), lines);
    expect(tr.push(900, P(100, 100), lines)).toBe(0); // 500 에 보여 줌 → 아직 0.4초
    tr.push(1200, P(900, 100), lines);
    expect(tr.push(1600, P(100, 100), lines)).toBe(1);
  });

  it('세로 값으로 다음 줄에 내려왔을 때 시선이 아직 오른쪽 끝이면, 그 뒤 왼쪽으로 와도 한 번 더 넘기지 않음', () => {
    const tr = onLine0();
    tr.push(1000, P(900, 232), lines);
    expect(tr.push(1500, P(900, 232), lines)).toBe(1); // 세로 값으로 1번 줄 (오른쪽 끝)
    expect(tr.push(3000, P(100, 232), lines)).toBe(1); // 줄 앞으로 → 건너뛰지 않음
    tr.push(4000, P(900, 232), lines);
    expect(tr.push(4100, P(100, 232), lines)).toBe(2); // 이 줄을 다 읽고 돌아오면 다음 줄
  });

  it('넘긴 뒤 2초 동안은 세로 값이 위 줄이어도 돌아가지 않고, 그 뒤엔 1.5초 머물면 돌아감', () => {
    const tr = onLine0();
    tr.push(1500, P(800, 100), lines);
    expect(tr.push(1600, P(200, 100), lines)).toBe(1); // noBack ~3600
    expect(tr.push(2500, P(300, 100), lines)).toBe(1);
    expect(tr.push(3500, P(300, 100), lines)).toBe(1);
    expect(tr.push(3700, P(300, 100), lines)).toBe(1); // 이제 후보 시작
    expect(tr.push(5199, P(300, 100), lines)).toBe(1);
    expect(tr.push(5200, P(300, 100), lines)).toBe(0);
  });

  it('마지막 줄에서는 줄을 넘기지 않고 쪽 끝 신호를 한 번 줌', () => {
    const tr = createLineTracker(opts);
    tr.push(0, P(100, 496), lines);
    expect(tr.push(500, P(100, 496), lines)).toBe(3);
    tr.push(600, P(100, 496), lines);
    tr.push(1400, P(900, 496), lines);
    expect(tr.push(1600, P(100, 496), lines)).toBe(3);
    expect(tr.takePageEnd()).toBe(true);
    expect(tr.takePageEnd()).toBe(false);
  });

  it('마지막 줄을 오른쪽까지 읽고 위(첫 줄 자리)를 보면 첫 줄로 가지 않고 쪽 끝', () => {
    const tr = createLineTracker(opts);
    tr.push(0, P(100, 496), lines);
    tr.push(500, P(100, 496), lines); // 3번 줄
    tr.push(600, P(100, 496), lines);
    tr.push(1600, P(900, 496), lines); // 오른쪽 끝
    expect(tr.push(1700, P(500, 100), lines)).toBe(3); // 위로 (후보)
    expect(tr.takePageEnd()).toBe(false);
    expect(tr.push(2200, P(500, 100), lines)).toBe(3); // 0.5초 → 쪽 끝
    expect(tr.takePageEnd()).toBe(true);
  });

  it('마지막 줄을 끝까지 안 읽고 위를 보면 쪽 끝이 아님 (평소처럼 위 줄로)', () => {
    const tr = createLineTracker(opts);
    tr.push(0, P(100, 496), lines);
    tr.push(500, P(100, 496), lines);
    tr.push(600, P(300, 100), lines);
    expect(tr.push(3600, P(300, 100), lines)).toBe(0);
    expect(tr.takePageEnd()).toBe(false);
  });

  it('짧은 줄은 머무는 시간 조건도 짧음 (줄 길이 비율)', () => {
    // 마지막 줄 폭 300 (가장 긴 줄 1000) → 1초 × 0.3 = 0.3초
    const ls = [R(0, 70, 1000, 130), R(0, 202, 300, 262)];
    const tr = createLineTracker(opts);
    tr.push(0, P(50, 232), ls);
    tr.push(500, P(50, 232), ls); // 1번 줄 (짧은 줄)
    tr.push(600, P(50, 232), ls);
    tr.push(700, P(280, 232), ls);
    tr.push(850, P(50, 232), ls);
    expect(tr.takePageEnd()).toBe(true);
  });

  it('마지막 줄로 막 내려온 순간 왼쪽으로 와도 쪽 끝이 아님', () => {
    const tr = onLine0();
    tr.jump(3);
    tr.push(1000, P(900, 496), lines);
    expect(tr.push(1200, P(100, 496), lines)).toBe(3);
    expect(tr.takePageEnd()).toBe(false);
  });

  it('jump: 책갈피 줄로 바로 옮김', () => {
    const tr = onLine0();
    tr.jump(2);
    expect(tr.push(700, P(500, 364), lines)).toBe(2);
  });

  it('start: 첫 줄에서 시작하고, 2초 동안은 세로 값이 마지막 줄이어도 그대로 (돌아오기는 됨)', () => {
    const tr = createLineTracker(opts);
    tr.start(0);
    expect(tr.push(1000, P(200, 496), lines)).toBe(0); // 여기서부터 2초 (3000 까지)
    expect(tr.push(2999, P(200, 496), lines)).toBe(0);
    expect(tr.push(3000, P(200, 496), lines)).toBe(0); // 이제 후보 (먼 줄이라 3초)
    expect(tr.push(6000, P(200, 496), lines)).toBe(3);

    const tr2 = createLineTracker(opts);
    tr2.start(0);
    tr2.push(1000, P(100, 100), lines);
    tr2.push(1900, P(900, 100), lines);
    expect(tr2.push(2100, P(100, 100), lines)).toBe(1);
  });
});

describe('읽기 화면 부드럽게 (가로 1.5초, 세로 2.5초)', () => {
  it('시선이 오른쪽 아래로 옮겨 가면 가로가 먼저, 세로는 더 늦게 따라옴', () => {
    const sm = createReadingSmoother(1500, 2500, 0, 1500);
    let p = { x: 0, y: 0 };
    for (let t = 0; t <= 3000; t += 100) p = sm.push(t, { x: 0, y: 0 });
    // 3.1초부터 (300, 300) 을 봄
    for (let t = 3100; t <= 3900; t += 100) p = sm.push(t, { x: 300, y: 300 });
    expect(p.x).toBe(300); // 가로 1.5초(16개) 중 9개가 새 값 → 따라옴
    expect(p.y).toBe(0); // 세로 2.5초(26개) 중 9개만 새 값 → 아직
    for (let t = 4000; t <= 4500; t += 100) p = sm.push(t, { x: 300, y: 300 }); // 26개 중 15개
    expect(p.y).toBe(300);
  });

  it('작은 떨림은 무시, 오래 끊기면 처음부터', () => {
    const sm = createReadingSmoother(1500, 2500, 50, 1500);
    expect(sm.push(0, { x: 100, y: 100 })).toEqual({ x: 100, y: 100 });
    expect(sm.push(100, { x: 160, y: 100 })).toEqual({ x: 100, y: 100 }); // 중앙값 130 → 30px 이동이라 무시
    expect(sm.push(5000, { x: 400, y: 400 })).toEqual({ x: 400, y: 400 });
  });
});
