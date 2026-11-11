/** 집중 판정 화면 글자 (준비 화면 카드, 읽기 화면 칩이 같이 씀) */
export const FOCUS_LABEL = { focused: '집중', unfocused: '딴짓', away: '자리 비움' } as const;
export const DETAIL_LABEL = {
  staring: '멍때림',
  skimming: '훑어보기',
  offscreen: '시선이 화면 밖',
  head: '고개를 돌림',
  'eyes-closed': '눈 감음',
} as const;
