/**
 * 전자책 읽기 한 번(여러 쪽)의 기록 (순수 로직, React/DOM 없음)
 *
 *  - 읽은 시간: 자리 비움·눈 감음일 때는 멈춤
 *  - 집중한 비율: 판정이 "집중"이었던 시간 ÷ 읽은 시간
 *  - 딴짓 횟수: 딴짓·자리 비움이 DISTRACT_MS 넘게 이어진 횟수 (그때 책갈피를 꽂음)
 *  - 줄마다 머문 시간: 강조 박스가 그 줄에 있던 시간 (멈춘 시간은 빼고)
 * 집중 판정 결과(1초에 4번)를 push 로 넣음. 시각은 ms
 */
import type { FocusDetail, FocusState } from '../gaze/focusJudge';

export const SESSION_POLICY = {
  /** 딴짓·자리 비움이 이 시간(ms) 넘게 이어지면 딴짓 1번 + 책갈피 */
  DISTRACT_MS: 1_000,
  /** 한 쪽을 연 뒤 이 시간(ms)이 지나야 자동으로 넘김 (실수로 넘어가지 않게) */
  PAGE_MIN_MS: 3_000,
  /** 다시 집중했을 때 "여기부터 이어 읽어요"를 보여 주는 시간(ms) */
  RESUME_TOAST_MS: 2_000,
  /** 판정 사이 간격이 이보다 길면(탭이 멈췄던 경우 등) 이만큼만 셈 */
  MAX_STEP_MS: 1_000,
} as const;

export interface FocusInput {
  state: FocusState;
  detail?: FocusDetail;
}

/** 강조 박스가 있는 줄 (쪽 번호, 그 쪽의 줄 번호) */
export interface LineRef {
  page: number;
  line: number;
}

export interface SessionStep {
  /** 지금 읽은 시간이 멈춰 있는지 (자리 비움·눈 감음) */
  paused: boolean;
  /** 딴짓 중으로 본 상태인지 (DISTRACT_MS 넘게) — 책갈피 표시 */
  distracted: boolean;
  /** 이번에 딴짓에서 돌아왔는지 (한 번만 true) */
  resumed: boolean;
}

export interface SessionSummary {
  activeMs: number;
  focusRatio: number;
  distractions: number;
  /** 분당 읽은 글자 수 (띄어쓰기 뺀 글자) */
  charsPerMin: number;
  /** lineMs[쪽][줄] = 머문 시간(ms) */
  lineMs: number[][];
}

export const isPaused = (f: FocusInput) => f.state === 'away' || f.detail === 'eyes-closed';

export function createReadingSession(policy: typeof SESSION_POLICY = SESSION_POLICY) {
  let lastT: number | null = null;
  let activeMs = 0;
  let focusedMs = 0;
  let distractions = 0;
  let offSince: number | null = null;
  let distracted = false;
  const lineMs: number[][] = [];

  return {
    push(t: number, f: FocusInput, at: LineRef | null): SessionStep {
      const dt = lastT == null ? 0 : Math.min(Math.max(t - lastT, 0), policy.MAX_STEP_MS);
      lastT = t;
      const paused = isPaused(f);
      if (!paused) {
        activeMs += dt;
        if (f.state === 'focused') focusedMs += dt;
        if (at) {
          const page = (lineMs[at.page] ??= []);
          page[at.line] = (page[at.line] ?? 0) + dt;
        }
      }
      let resumed = false;
      if (f.state === 'focused') {
        offSince = null;
        if (distracted) {
          distracted = false;
          resumed = true;
        }
      } else {
        offSince ??= t;
        if (!distracted && t - offSince >= policy.DISTRACT_MS) {
          distracted = true;
          distractions++;
        }
      }
      return { paused, distracted, resumed };
    },
    /** 쪽을 넘기거나 멈췄다 다시 시작할 때: 다음 push 의 간격을 세지 않음 */
    skipGap() {
      lastT = null;
    },
    get activeMs() {
      return activeMs;
    },
    summary(chars: number): SessionSummary {
      const lines = Array.from({ length: lineMs.length }, (_, p) => Array.from(lineMs[p] ?? [], (v) => v ?? 0));
      return {
        activeMs,
        focusRatio: activeMs > 0 ? focusedMs / activeMs : 0,
        distractions,
        charsPerMin: activeMs > 0 ? chars / (activeMs / 60_000) : 0,
        lineMs: lines,
      };
    },
  };
}

/** 줄마다 머문 시간 중 가장 긴 곳 (없으면 null) */
export function longestLine(lineMs: number[][]): LineRef | null {
  let best: LineRef | null = null;
  let bestMs = 0;
  lineMs.forEach((page, p) =>
    page.forEach((ms, l) => {
      if (ms > bestMs) {
        bestMs = ms;
        best = { page: p, line: l };
      }
    }),
  );
  return best;
}

/** 0:42 처럼 */
export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
