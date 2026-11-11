import { describe, expect, it } from 'vitest';
import {
  dotPosition,
  formatStamp,
  isValidParticipantId,
  labelsCsv,
  makeDotOrder,
  pxToCm,
  saveSlot,
  screenCmFromDiagonal,
  slotsPerDot,
} from './collectPlan';

/** 고정 씨앗 난수 (매번 같은 순서) */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('makeDotOrder', () => {
  it('24칸 × 2바퀴 = 48개, 바퀴마다 모든 칸이 한 번씩', () => {
    const order = makeDotOrder(seeded(1));
    expect(order).toHaveLength(48);
    for (const lap of [order.slice(0, 24), order.slice(24)]) {
      const keys = new Set(lap.map((d) => `${d.row},${d.col}`));
      expect(keys.size).toBe(24);
    }
  });

  it('섞여 있고, 바퀴가 바뀔 때 같은 점이 연달아 나오지 않음', () => {
    for (let seed = 0; seed < 200; seed++) {
      const order = makeDotOrder(seeded(seed));
      const a = order[23];
      const b = order[24];
      expect(a.row === b.row && a.col === b.col).toBe(false);
    }
    const plain = makeDotOrder(seeded(7)).slice(0, 24).map((d) => d.row * 6 + d.col);
    expect(plain).not.toEqual([...Array(24).keys()]);
  });
});

describe('dotPosition / pxToCm', () => {
  it('칸 가운데: 1200×600 화면에서 (0,0) 칸 = (100, 75), (3,5) 칸 = (1100, 525)', () => {
    expect(dotPosition({ row: 0, col: 0 }, 1200, 600)).toEqual({ x: 100, y: 75 });
    expect(dotPosition({ row: 3, col: 5 }, 1200, 600)).toEqual({ x: 1100, y: 525 });
  });

  it('cm = px × (화면 cm ÷ 화면 px), 왼쪽 위 0', () => {
    const cm = pxToCm({ x: 600, y: 150 }, { width: 1200, height: 600 }, { width: 30, height: 18 });
    expect(cm.x).toBeCloseTo(15);
    expect(cm.y).toBeCloseTo(4.5);
  });
});

describe('screenCmFromDiagonal', () => {
  it('14인치 16:9 → 약 31.0 × 17.4cm (Alienware x14 화면 정보 30.9 × 17.4 와 같음)', () => {
    const cm = screenCmFromDiagonal(14, { width: 1920, height: 1080 });
    expect(cm.width).toBeCloseTo(30.99, 1);
    expect(cm.height).toBeCloseTo(17.43, 1);
  });

  it('배율이 달라도(CSS px) 비율만 쓰므로 같은 값', () => {
    const a = screenCmFromDiagonal(14, { width: 1280, height: 720 });
    const b = screenCmFromDiagonal(14, { width: 1920, height: 1080 });
    expect(a.width).toBeCloseTo(b.width, 6);
    expect(a.height).toBeCloseTo(b.height, 6);
  });
});

describe('saveSlot', () => {
  it('0.6초부터 0.25초마다 6번 (0.6, 0.85, …, 1.85초)', () => {
    expect(slotsPerDot()).toBe(6);
    expect(saveSlot(599)).toBeNull();
    expect(saveSlot(600)).toBe(0);
    expect(saveSlot(849)).toBe(0);
    expect(saveSlot(850)).toBe(1);
    expect(saveSlot(1850)).toBe(5);
    expect(saveSlot(1999)).toBe(5);
    expect(saveSlot(2000)).toBeNull();
  });
});

describe('labelsCsv', () => {
  it('prepare_data.py 와 같은 열, 6자리 파일 이름, CRLF', () => {
    const csv = labelsCsv([
      { sampleId: 1, gazeCm: { x: 2.5, y: 1.875 }, groupId: 'p01' },
      { sampleId: 12, gazeCm: { x: 1 / 3, y: 10 }, groupId: 'p01' },
    ]);
    expect(csv).toBe(
      'sample_id,left_eye_path,right_eye_path,gaze_x_cm,gaze_y_cm,group_id\r\n' +
        '1,left/000001.png,right/000001.png,2.5,1.875,p01\r\n' +
        '12,left/000012.png,right/000012.png,0.3333,10,p01\r\n',
    );
  });
});

describe('기타', () => {
  it('참여자 ID: 영문·숫자·-·_ 만', () => {
    expect(isValidParticipantId('p01')).toBe(true);
    expect(isValidParticipantId('p_01-a')).toBe(true);
    expect(isValidParticipantId('')).toBe(false);
    expect(isValidParticipantId('p/01')).toBe(false);
    expect(isValidParticipantId('p 01')).toBe(false);
    expect(isValidParticipantId('p,01')).toBe(false);
  });

  it('폴더 이름용 시각', () => {
    expect(formatStamp(new Date(2026, 10, 11, 9, 5, 3))).toBe('2026-11-11T09-05-03');
  });
});
