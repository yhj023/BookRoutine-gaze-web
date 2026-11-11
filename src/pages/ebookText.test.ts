import { describe, expect, it } from 'vitest';
import { EBOOKS, bookChars, nextBookIndex, splitPage } from './ebookText';

/** 1040px 폭, 36px 글자 → 한 줄 약 28자. 4~5줄이 되게 (띄어쓰기 포함 글자 수로 대략). 3줄은 너무 빨리 끝남 */
const MIN_CHARS = 90;
const MAX_CHARS = 135;

describe('전자책 글', () => {
  it('글마다 2~3쪽, 쪽마다 4~5줄 길이', () => {
    for (const b of EBOOKS) {
      expect(b.pages.length).toBeGreaterThanOrEqual(2);
      expect(b.pages.length).toBeLessThanOrEqual(3);
      for (const p of b.pages) {
        expect(p.text).not.toContain('\n'); // 시처럼 짧은 줄은 넣지 않음
        expect(p.text.length).toBeGreaterThanOrEqual(MIN_CHARS);
        expect(p.text.length).toBeLessThanOrEqual(MAX_CHARS);
      }
    }
  });

  it('바로 이어지는 두 글은 종류가 다름 (번갈아 나오게)', () => {
    EBOOKS.forEach((b, i) => {
      if (i > 0) expect(b.kind).not.toBe(EBOOKS[i - 1].kind);
    });
    expect(new Set(EBOOKS.map((b) => b.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('강제 줄 바꿈(\\n)은 그 줄 마지막 단어에 br', () => {
    expect(splitPage('가 나\n다')).toEqual([
      { w: '가', br: false },
      { w: '나', br: true },
      { w: '다', br: false },
    ]);
    expect(splitPage('  가  나 ')).toEqual([
      { w: '가', br: false },
      { w: '나', br: false },
    ]);
  });

  it('글자 수는 띄어쓰기·줄 바꿈 뺌, 다음 글은 차례대로 돌아감', () => {
    expect(bookChars({ title: '', author: '', kind: '', pages: [{ text: '가 나\n다' }] })).toBe(3);
    const a = nextBookIndex(3);
    expect(nextBookIndex(3)).toBe((a + 1) % 3);
    expect(nextBookIndex(3)).toBe((a + 2) % 3);
  });
});
