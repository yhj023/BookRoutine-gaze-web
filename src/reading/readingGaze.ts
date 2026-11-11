/**
 * 전자책 읽기 체험의 시선 처리 (순수 로직, React/DOM 없음)
 *
 *  보정된 시선(px) → 부드럽게(createReadingSmoother: 가로 1.5초·세로 2.5초 중앙값 + 1.5cm 떨림 무시)
 *  → 글 영역 안/밖 (밖은 OUTSIDE_MS 동안 계속 밖이어야 인정) → 가장 가까운 줄(또는 단어) → 머무름(DWELL_MS) 뒤에 강조 이동
 * 좌표는 모두 전체 화면 viewport 기준 CSS px (보정 화면과 같은 기준)
 */
import { CALIBRATION_POLICY, type Pt } from '../gaze/gazeCalibration';
import { GAZE_DOT_POLICY } from '../gaze/gazeSmoother';

export const READING_POLICY = {
  /** 가로 시선 중앙값 시간(ms). 준비 화면 시선 점과 같음 — 줄 끝 돌아오기를 늦지 않게 잡으려고 짧게 */
  SMOOTH_X_WINDOW_MS: 1_500,
  /**
   * 세로 시선 중앙값 시간(ms). 세로가 더 흔들려서(2~3cm) 더 길게.
   * 다음 줄로 넘기는 건 주로 가로의 줄 끝 돌아오기가 맡아서, 세로가 늦어도 괜찮음
   */
  SMOOTH_Y_WINDOW_MS: 2_500,
  /** 작은 떨림 무시(px), 시선 점과 같은 약 1.5cm */
  SMOOTH_DEADZONE_PX: GAZE_DOT_POLICY.DEADZONE_PX,
  /** 이보다 오래(ms) 시선 값이 안 오면 부드럽게 하기를 처음부터 */
  SMOOTH_STALE_MS: GAZE_DOT_POLICY.STALE_MS,
  /** 새 단어(칸)에 이 시간(ms) 이상 머물러야 강조 박스를 옮김 (줄은 아래 LINE_* 사용) */
  DWELL_MS: 250,
  /**
   * 줄 붙어 있기(px): 줄과 줄 사이 경계(가운데)를 이만큼 더 넘어가야 다른 줄을 후보로 봄. 약 1.6cm
   * (줄 간격 3.2cm 의 절반 → 옆 줄 한가운데까지 가야 함).
   * 시선이 위아래로 2~3cm 흔들려도 경계 근처에서 박스가 왔다 갔다 하지 않게. 1.2cm 는 아직 흔들렸음 (2026-11-12)
   */
  LINE_STICK_PX: Math.round(1.6 / CALIBRATION_POLICY.CM_PER_PX),
  /** 바로 다음 줄(읽는 흐름)로 옮기기 전에 머물러야 하는 시간(ms) */
  LINE_NEXT_DWELL_MS: 500,
  /** 바로 위 줄이나 한 줄 건너뛸 때 머물러야 하는 시간(ms). 흔들림일 가능성이 커서 더 길게 (1.5초는 아직 흔들렸음) */
  LINE_OTHER_DWELL_MS: 2_500,
  /**
   * 두 줄 넘게 떨어진 줄(예: 3번째 줄 → 1번째 줄)로 옮길 때 머물러야 하는 시간(ms).
   * 읽다가 그렇게 뛰는 일은 드물고, 줄 끝에서 시선이 위로 튀어 첫 줄로 돌아가 버렸음 (2026-11-12)
   */
  LINE_FAR_DWELL_MS: 4_000,
  /**
   * 쪽을 열거나 위치 맞추기·책갈피로 줄을 정한 뒤, 이 시간(ms) 동안은 세로 값으로 줄을 옮기지 않음 (줄 끝 돌아오기는 됨).
   * 세로 평활화(2.5초)가 아직 옛 위치(앞 쪽 마지막 줄 등)를 가리키는 동안 첫 줄에서 밀려나지 않게
   */
  LINE_START_HOLD_MS: 2_500,
  /**
   * 줄 끝 → 줄 앞 돌아오기(되돌이 눈 움직임): 시선 x 가 지금 줄 폭의 이 비율보다 오른쪽까지 갔다가 …
   * 가로 움직임은 세로보다 커서 잘 잡힘 (세로로 헷갈리는 줄에도 도움)
   */
  SWEEP_RIGHT_FRAC: 0.65,
  /** … 이 비율보다 왼쪽으로 돌아오면 바로 다음 줄로 넘김 */
  SWEEP_LEFT_FRAC: 0.35,
  /**
   * 줄을 이 시간(ms) 넘게 보여 준 뒤에만 줄 끝 돌아오기를 셈. 한 줄 읽는 데 4~5초 걸리므로,
   * 줄이 바뀌자마자 다시 넘어가 한 줄을 건너뛰거나 쪽이 넘어가는 것을 막음
   */
  SWEEP_MIN_LINE_MS: 1_500,
  /**
   * 다음 줄로 넘긴 뒤(돌아오기든 세로 값이든) 이 시간(ms) 동안은 위 줄로 돌아가지 않음.
   * 세로 값이 늦게 따라오는 동안 위아래로 왔다 갔다 하지 않게. 2초는 짧았음 (한 줄 읽는 데 약 4~5초)
   */
  SWEEP_NO_BACK_MS: 4_000,
  /**
   * 글 영역을 넓혀서 "안"으로 보는 여유(px)의 최솟값.
   * 실제 여유는 max(이 값, 보정 오차 errorPx) — 오차(약 4.7cm)보다 좁으면 글을 보는 중에도 밖으로 튐
   */
  TEXT_AREA_MARGIN_PX: 40,
  /** 이 시간(ms) 동안 계속 글 밖이어야 "글 밖"으로 봄. 그 전에는 강조 박스를 그대로 둠 */
  OUTSIDE_MS: 1_000,
  /** 위치 맞추기: 스페이스를 누르기 직전 이 시간(ms) 동안의 시선을 모아 중앙값을 씀 */
  ALIGN_WINDOW_MS: 1_000,
  /** 위치 맞추기에 필요한 최소 시선 값 개수 (모자라면 다시 누르게 함) */
  ALIGN_MIN_SAMPLES: 4,
  /**
   * 두 점 맞추기의 세로 배율 범위. 화면 아래를 볼 때 눈꺼풀 때문에 시선 값이 위로 눌리는 것을 펴 줌.
   * 다른 곳을 보고 눌러도 화면이 이상해지지 않게 이 범위로 제한
   */
  ALIGN_SCALE_MIN: 0.5,
  ALIGN_SCALE_MAX: 2.5,
} as const;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 점과 사각형 사이 거리 (안이면 0) */
export function distToRect(p: Pt, r: Rect): number {
  const dx = Math.max(r.left - p.x, 0, p.x - r.right);
  const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
  return Math.hypot(dx, dy);
}

/** 가장 가까운 사각형 번호 (없으면 -1) */
export function nearestRect(p: Pt, rects: Rect[]): number {
  let best = -1;
  let bestD = Infinity;
  rects.forEach((r, i) => {
    const d = distToRect(p, r);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function inflate(r: Rect, m: number): Rect {
  return { left: r.left - m, top: r.top - m, right: r.right + m, bottom: r.bottom + m };
}

export function contains(r: Rect, p: Pt): boolean {
  return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

export function unionRect(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null;
  return {
    left: Math.min(...rs.map((r) => r.left)),
    top: Math.min(...rs.map((r) => r.top)),
    right: Math.max(...rs.map((r) => r.right)),
    bottom: Math.max(...rs.map((r) => r.bottom)),
  };
}

/**
 * 단어 사각형들을 줄로 묶기 (위치 순서대로 들어온다고 가정).
 * 세로 가운데가 앞 단어 줄 높이의 절반 안이면 같은 줄.
 * 반환: 단어마다 줄 번호, 줄마다 사각형(단어들을 합친 것)
 */
export function groupLines(words: Rect[]): { lineOf: number[]; lines: Rect[] } {
  const lineOf: number[] = [];
  const members: Rect[][] = [];
  for (const w of words) {
    const cy = (w.top + w.bottom) / 2;
    const cur = members[members.length - 1];
    const ref = cur?.[cur.length - 1];
    if (ref && Math.abs(cy - (ref.top + ref.bottom) / 2) <= (ref.bottom - ref.top) / 2) cur.push(w);
    else members.push([w]);
    lineOf.push(members.length - 1);
  }
  return { lineOf, lines: members.map((m) => unionRect(m)!) };
}

/**
 * 머무름: 후보가 DWELL_MS 동안 같아야 보여 주는 값을 바꿈.
 * push(t, null) = 후보 없음(글 밖) → 보여 주는 값도 null, 다음 후보는 처음부터 셈
 */
export function createDwell(dwellMs: number = READING_POLICY.DWELL_MS) {
  let shown: number | null = null;
  let cand: { id: number; since: number } | null = null;
  return {
    push(t: number, id: number | null): number | null {
      if (id == null) {
        shown = null;
        cand = null;
        return null;
      }
      if (id === shown) {
        cand = null;
        return shown;
      }
      if (!cand || cand.id !== id) cand = { id, since: t };
      if (t - cand.since >= dwellMs) {
        shown = id;
        cand = null;
      }
      return shown;
    },
    reset() {
      shown = null;
      cand = null;
    },
  };
}

/** 2×2 칸 번호: 0 왼쪽 위, 1 오른쪽 위, 2 왼쪽 아래, 3 오른쪽 아래 */
export function quadrantOf(p: Pt, width: number, height: number): number {
  return (p.y >= height / 2 ? 2 : 0) + (p.x >= width / 2 ? 1 : 0);
}

/** 점들의 x, y 각각 중앙값 (없으면 null) */
export function medianPt(ps: Pt[]): Pt | null {
  if (ps.length === 0) return null;
  const med = (v: number[]) => {
    const a = [...v].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  return { x: med(ps.map((p) => p.x)), y: med(ps.map((p) => p.y)) };
}

/** 최근 windowMs 동안의 점만 기억 */
export function createRecent(windowMs: number = READING_POLICY.ALIGN_WINDOW_MS) {
  let buf: { t: number; p: Pt }[] = [];
  return {
    push(t: number, p: Pt) {
      buf.push({ t, p });
      buf = buf.filter((e) => e.t >= t - windowMs);
    },
    /** now 기준 최근 windowMs 안의 점 */
    points(now: number): Pt[] {
      return buf.filter((e) => e.t >= now - windowMs && e.t <= now).map((e) => e.p);
    },
    reset() {
      buf = [];
    },
  };
}

/** 위치 맞추기 결과: 고친 점 = (x + ox, y × sy + oy) */
export interface GazeCorrection {
  ox: number;
  oy: number;
  sy: number;
}

export const NO_CORRECTION: GazeCorrection = { ox: 0, oy: 0, sy: 1 };

export function applyCorrection(c: GazeCorrection, p: Pt): Pt {
  return { x: p.x + c.ox, y: p.y * c.sy + c.oy };
}

/** 최근 시선의 중앙값 (값이 minSamples 보다 적으면 null) */
export function recentMedian(recent: Pt[], minSamples: number = READING_POLICY.ALIGN_MIN_SAMPLES): Pt | null {
  return recent.length < minSamples ? null : medianPt(recent);
}

/**
 * 두 점 위치 맞추기: 사람이 top(첫 단어)과 bottom(마지막 단어)을 차례로 봤을 때의 시선 중앙값 mTop, mBottom 으로
 *  - 세로: 두 점이 목표에 오도록 배율 sy 와 이동 oy (sy 는 [ALIGN_SCALE_MIN, MAX] 로 제한, 제한되면 두 점의 가운데를 맞춤)
 *  - 가로: 두 점 차이의 평균만큼 이동
 * 아래 점이 위 점보다 위(또는 같은 높이)로 나오면 잘못 본 것으로 보고 null
 */
export function alignTwoPoint(
  top: Pt,
  mTop: Pt,
  bottom: Pt,
  mBottom: Pt,
  scaleMin: number = READING_POLICY.ALIGN_SCALE_MIN,
  scaleMax: number = READING_POLICY.ALIGN_SCALE_MAX,
): GazeCorrection | null {
  const span = mBottom.y - mTop.y;
  if (span <= 0) return null;
  const sy = Math.min(scaleMax, Math.max(scaleMin, (bottom.y - top.y) / span));
  const oy = (top.y + bottom.y) / 2 - sy * ((mTop.y + mBottom.y) / 2);
  const ox = (top.x - mTop.x + (bottom.x - mBottom.x)) / 2;
  return { ox, oy, sy };
}

/** 글 영역 여유(px): 보정 오차만큼, 최소 TEXT_AREA_MARGIN_PX */
export function textAreaMargin(errorPx: number, minPx: number = READING_POLICY.TEXT_AREA_MARGIN_PX): number {
  return Number.isFinite(errorPx) ? Math.max(minPx, errorPx) : minPx;
}

/**
 * "글 밖" 판정: holdMs 동안 계속 밖이어야 true. 한 번이라도 안으로 들어오면 처음부터
 */
export function createOutsideHold(holdMs: number = READING_POLICY.OUTSIDE_MS) {
  let since: number | null = null;
  return {
    push(t: number, inside: boolean): boolean {
      if (inside) {
        since = null;
        return false;
      }
      if (since == null) since = t;
      return t - since >= holdMs;
    },
    reset() {
      since = null;
    },
  };
}

export interface LineTrackerOptions {
  /** 줄 경계를 이만큼(px) 더 넘어가야 다른 줄을 후보로 봄 */
  stickPx: number;
  /** 바로 다음 줄로 옮기기 전 머무는 시간(ms) */
  nextDwellMs: number;
  /** 바로 위 줄, 한 줄 건너뛰기 전 머무는 시간(ms) */
  otherDwellMs: number;
  /** 두 줄 넘게 떨어진 줄로 옮기기 전 머무는 시간(ms) */
  farDwellMs: number;
  /** 다음 줄로 넘긴 뒤 이 시간(ms) 동안 위 줄로 안 감 */
  noBackMs: number;
  /** start/jump 뒤 이 시간(ms) 동안 세로 값으로 안 옮김 */
  startHoldMs: number;
  /** 줄 끝 돌아오기: 오른쪽 기준 (줄 폭 비율) */
  rightFrac: number;
  /** 줄 끝 돌아오기: 왼쪽 기준 (줄 폭 비율) */
  leftFrac: number;
  /** 줄을 이 시간(ms) 넘게 보여 준 뒤에만 줄 끝 돌아오기를 셈 (가장 긴 줄 기준, 짧은 줄은 길이에 비례해 줄임) */
  minLineMs: number;
}

export const LINE_TRACKER_DEFAULTS: LineTrackerOptions = {
  stickPx: READING_POLICY.LINE_STICK_PX,
  nextDwellMs: READING_POLICY.LINE_NEXT_DWELL_MS,
  otherDwellMs: READING_POLICY.LINE_OTHER_DWELL_MS,
  farDwellMs: READING_POLICY.LINE_FAR_DWELL_MS,
  noBackMs: READING_POLICY.SWEEP_NO_BACK_MS,
  startHoldMs: READING_POLICY.LINE_START_HOLD_MS,
  rightFrac: READING_POLICY.SWEEP_RIGHT_FRAC,
  leftFrac: READING_POLICY.SWEEP_LEFT_FRAC,
  minLineMs: READING_POLICY.SWEEP_MIN_LINE_MS,
};

/**
 * 줄 강조 따라가기 (읽는 순서 + 붙어 있기 + 줄 끝 돌아오기).
 *  - 줄 끝 돌아오기: 지금 줄에서 시선 x 가 왼쪽(leftFrac 안) → 오른쪽(rightFrac 넘게) → 다시 왼쪽 순서로 움직이면 다음 줄.
 *    줄이 바뀐 직후 시선이 아직 앞 줄 오른쪽 끝에 있어도 세지 않게, 먼저 그 줄 왼쪽을 봐야 함
 *    (줄 끝 돌아오기로 넘어온 경우는 이미 왼쪽이라 바로 셈). 그 줄을 minLineMs 넘게 보여 준 뒤에만 셈
 *  - 지금 줄의 범위 = 위·아래 줄과의 가운데 경계를 stickPx 만큼 넓힌 것. 시선(y)이 그 안이면 그대로
 *  - 벗어나면 가운데가 가장 가까운 줄이 후보. 바로 다음 줄 nextDwellMs, 바로 위 줄·한 줄 건너뛰기 otherDwellMs,
 *    그보다 먼 줄 farDwellMs 동안 같은 후보가 이어져야 옮김
 *  - 다음 줄로 넘기면(어떤 방법이든) noBackMs 동안 위 줄로 돌아가지 않음
 *  - 처음(보이는 줄 없음)에는 nextDwellMs 뒤에 보여 줌. start(줄)/jump(줄)는 그 줄을 바로 보여 주고,
 *    그 뒤 startHoldMs 동안은 세로 값으로 옮기지 않음 (줄 끝 돌아오기는 됨)
 *  - 마지막 줄에서 줄 끝 돌아오기가 나오면 "쪽 끝" 신호(takePageEnd 가 한 번 true) → 다음 쪽으로 넘길 때.
 *    마지막 줄을 오른쪽까지 읽은 뒤 위 줄(다음 쪽 첫 줄 자리)로 시선이 nextDwellMs 동안 올라가도 쪽 끝 (위로 옮기지 않음).
 *    다 읽으면 사람은 보통 왼쪽 위를 보는데, 전에는 이게 "첫 줄로 돌아감"이 됐음 (2026-11-12)
 *  - minLineMs 는 짧은 줄(문단 마지막 줄 등)이면 줄 길이 비율만큼 줄임
 * lines 는 위에서 아래 순서 (groupLines 결과)
 */
export function createLineTracker(options: Partial<LineTrackerOptions> = {}) {
  const o = { ...LINE_TRACKER_DEFAULTS, ...options };
  let shown: number | null = null;
  let cand: { id: number; since: number } | null = null;
  /** 지금 줄에서 왼쪽을 봤는지 (줄 끝 돌아오기 준비) */
  let leftSeen = false;
  /** 왼쪽을 본 뒤 오른쪽 부분까지 갔는지 */
  let reachedRight = false;
  /** 지금 줄을 보여 주기 시작한 시각 (null = 다음 push 시각) */
  let shownSince: number | null = null;
  /** 이 시각 전에는 위 줄로 돌아가지 않음 */
  let noBackUntil = -Infinity;
  /** 마지막 줄에서 줄 끝 돌아오기가 나왔는지 (takePageEnd 로 한 번 꺼냄) */
  let pageEnd = false;
  /** 이 시각 전에는 세로 값으로 줄을 옮기지 않음. start 직후에는 다음 push 시각부터 셈 (null = 아직 모름) */
  let holdUntil: number | null = -Infinity;
  /** 지금 줄의 minLineMs (줄 길이로 줄인 값) */
  let lineMinMs = o.minLineMs;
  const center = (r: Rect) => (r.top + r.bottom) / 2;
  const show = (id: number, t: number | null, fromLeft: boolean) => {
    shown = id;
    cand = null;
    leftSeen = fromLeft;
    reachedRight = false;
    shownSince = t;
  };
  return {
    push(t: number, p: Pt, lines: Rect[]): number | null {
      const y = p.y;
      if (lines.length === 0) return null;
      if (holdUntil == null) holdUntil = t + o.startHoldMs;
      if (shownSince == null) shownSince = t;
      if (shown != null && shown >= lines.length) shown = null; // 글 배치가 바뀐 경우
      if (shown != null) {
        // 줄 앞 → 줄 끝 → 줄 앞 돌아오기
        const L = lines[shown];
        const w = L.right - L.left;
        const maxW = Math.max(...lines.map((r) => r.right - r.left));
        lineMinMs = o.minLineMs * Math.min(1, w / Math.max(1, maxW));
        if (p.x <= L.left + o.leftFrac * w) {
          if (reachedRight && t - shownSince >= lineMinMs) {
            if (shown === lines.length - 1) {
              pageEnd = true;
              reachedRight = false;
              return shown;
            }
            show(shown + 1, t, true);
            noBackUntil = t + o.noBackMs;
            return shown;
          }
          leftSeen = true;
          reachedRight = false;
        } else if (leftSeen && p.x >= L.left + o.rightFrac * w) reachedRight = true;

        const c = center(lines[shown]);
        const up = shown > 0 ? (center(lines[shown - 1]) + c) / 2 : -Infinity;
        const down = shown < lines.length - 1 ? (c + center(lines[shown + 1])) / 2 : Infinity;
        if ((y >= up - o.stickPx && y <= down + o.stickPx) || t < holdUntil) {
          cand = null;
          return shown;
        }
      }
      let id = 0;
      lines.forEach((r, i) => {
        if (Math.abs(center(r) - y) < Math.abs(center(lines[id]) - y)) id = i;
      });
      if (id === shown) {
        cand = null;
        return shown;
      }
      // 마지막 줄을 끝까지 읽고 위(다음 쪽 첫 줄 자리)를 봄 → 쪽 끝 (첫 줄로 돌아가지 않음)
      const lastDone =
        shown != null && shown === lines.length - 1 && id < shown && reachedRight && t - (shownSince ?? t) >= lineMinMs;
      if (!lastDone && shown != null && id < shown && t < noBackUntil) {
        cand = null;
        return shown;
      }
      if (!cand || cand.id !== id) cand = { id, since: t };
      if (lastDone) {
        if (t - cand.since >= o.nextDwellMs) {
          pageEnd = true;
          reachedRight = false;
          cand = null;
        }
        return shown;
      }
      const need =
        shown == null || id === shown + 1
          ? o.nextDwellMs
          : Math.abs(id - shown) <= 2 && id >= shown - 1
            ? o.otherDwellMs
            : o.farDwellMs;
      if (t - cand.since >= need) {
        if (shown != null && id > shown) noBackUntil = t + o.noBackMs;
        show(id, t, false);
      }
      return shown;
    },
    /** 처음부터 (박스 숨김) */
    clear() {
      shown = null;
      cand = null;
      leftSeen = false;
      reachedRight = false;
      noBackUntil = -Infinity;
      pageEnd = false;
      holdUntil = -Infinity;
    },
    /** 이 줄에서 시작 (쪽을 열 때, 위치 맞추기 뒤: 첫 줄). 잠깐 세로 값으로 옮기지 않음 */
    start(id = 0) {
      show(id, null, false);
      noBackUntil = -Infinity;
      pageEnd = false;
      holdUntil = null;
    },
    /** 이 줄로 바로 옮김 (책갈피로 돌아갈 때). start 와 같음 */
    jump(id: number) {
      this.start(id);
    },
    /** 지금 보여 주는 줄 (없으면 null) */
    get shown(): number | null {
      return shown;
    },
    /** 쪽 끝 신호를 한 번 꺼냄 */
    takePageEnd(): boolean {
      const v = pageEnd;
      pageEnd = false;
      return v;
    },
  };
}

const median1 = (a: number[]) => {
  const v = [...a].sort((x, y) => x - y);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

/**
 * 읽기 화면용 부드럽게: 가로는 최근 xWindowMs, 세로는 최근 yWindowMs 동안의 중앙값.
 * 새 중앙값이 지금 보이는 점에서 deadzonePx 안쪽이면 움직이지 않음 (작은 떨림 무시).
 * staleMs 넘게 값이 안 왔으면 처음부터
 */
export function createReadingSmoother(
  xWindowMs: number = READING_POLICY.SMOOTH_X_WINDOW_MS,
  yWindowMs: number = READING_POLICY.SMOOTH_Y_WINDOW_MS,
  deadzonePx: number = READING_POLICY.SMOOTH_DEADZONE_PX,
  staleMs: number = READING_POLICY.SMOOTH_STALE_MS,
) {
  let buf: { t: number; p: Pt }[] = [];
  let shown: Pt | null = null;
  const keep = Math.max(xWindowMs, yWindowMs);
  return {
    push(t: number, p: Pt): Pt {
      const last = buf[buf.length - 1];
      if (last && (t - last.t > staleMs || t < last.t)) {
        buf = [];
        shown = null;
      }
      buf.push({ t, p });
      buf = buf.filter((e) => t - e.t <= keep);
      const m = {
        x: median1(buf.filter((e) => t - e.t <= xWindowMs).map((e) => e.p.x)),
        y: median1(buf.filter((e) => t - e.t <= yWindowMs).map((e) => e.p.y)),
      };
      if (!shown || Math.hypot(m.x - shown.x, m.y - shown.y) > deadzonePx) shown = m;
      return shown;
    },
    reset() {
      buf = [];
      shown = null;
    },
  };
}
