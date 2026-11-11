/**
 * /collect (미세조정용 데이터 수집) 의 순수 로직. React/DOM 없음.
 *
 * - 화면을 ROWS×COLS 칸으로 나눈 칸 가운데에 점, LAPS 바퀴 (바퀴마다 따로 섞음)
 * - 점마다 DOT_MS 동안 보여 주고, FIRST_SAVE_MS 뒤부터 SAVE_EVERY_MS 마다 저장 차례
 * - 정답 = 점의 CSS px × (입력한 화면 cm ÷ 화면 px). 화면 왼쪽 위 0, x 오른쪽 +, y 아래 +
 * - labels.csv 형식 = reference/prepare_data.py 가 만드는 것과 같은 열
 */
import type { Pt } from '../gaze/gazeCalibration';

export const COLLECT_POLICY = {
  ROWS: 4,
  COLS: 6,
  LAPS: 2,
  DOT_MS: 2_000,
  /** 점이 나타나고 이만큼 지난 뒤부터 저장 (눈이 점에 도착할 시간) */
  FIRST_SAVE_MS: 600,
  SAVE_EVERY_MS: 250,
  /** eyeBlinkLeft / eyeBlinkRight 중 하나라도 이보다 크면 눈 감음 → 저장 안 함 */
  BLINK_MAX: 0.5,
  /** 파일 번호 자리수 (000001.png) */
  ID_DIGITS: 6,
  /** 파일 쓰기 시도 횟수 (처음 1번 + 다시 2번). 다 실패하면 그 번호의 두 파일을 지움 */
  WRITE_ATTEMPTS: 3,
  /** 다시 시도 전 대기 (ms) × 시도 번호 */
  WRITE_RETRY_MS: 100,
} as const;

export interface GridDot {
  row: number;
  col: number;
}

/** 0 이상 1 미만 난수 (테스트에서 바꿔 넣을 수 있게) */
export type Rng = () => number;

/** 칸 가운데 위치 (CSS px) */
export function dotPosition(d: GridDot, width: number, height: number, P = COLLECT_POLICY): Pt {
  return { x: ((d.col + 0.5) * width) / P.COLS, y: ((d.row + 0.5) * height) / P.ROWS };
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

/**
 * 점 순서: 바퀴마다 모든 칸이 한 번씩, 바퀴 안에서 섞음.
 * 바퀴가 바뀔 때 같은 점이 연달아 나오면 새 바퀴의 첫 점을 다른 점과 바꿈.
 */
export function makeDotOrder(rng: Rng = Math.random, P = COLLECT_POLICY): GridDot[] {
  const cells: GridDot[] = [];
  for (let row = 0; row < P.ROWS; row++) for (let col = 0; col < P.COLS; col++) cells.push({ row, col });
  const out: GridDot[] = [];
  for (let lap = 0; lap < P.LAPS; lap++) {
    const lapOrder = shuffle(cells, rng);
    const prev = out[out.length - 1];
    if (prev && lapOrder.length > 1 && lapOrder[0].row === prev.row && lapOrder[0].col === prev.col) {
      [lapOrder[0], lapOrder[1]] = [lapOrder[1], lapOrder[0]];
    }
    out.push(...lapOrder);
  }
  return out;
}

/**
 * 점이 나타나고 elapsedMs 지났을 때의 저장 차례 번호 (0부터). 아직이거나 끝났으면 null.
 * 차례: FIRST_SAVE_MS, +SAVE_EVERY_MS, … , DOT_MS 전까지
 */
export function saveSlot(elapsedMs: number, P = COLLECT_POLICY): number | null {
  if (elapsedMs < P.FIRST_SAVE_MS || elapsedMs >= P.DOT_MS) return null;
  return Math.floor((elapsedMs - P.FIRST_SAVE_MS) / P.SAVE_EVERY_MS);
}

/** 점 하나당 저장 차례 수 (기본 6: 0.6, 0.85, 1.1, 1.35, 1.6, 1.85초) */
export function slotsPerDot(P = COLLECT_POLICY): number {
  return Math.ceil((P.DOT_MS - P.FIRST_SAVE_MS) / P.SAVE_EVERY_MS);
}

/** CSS px → 화면 cm (왼쪽 위 0) */
export function pxToCm(p: Pt, screenPx: { width: number; height: number }, screenCm: { width: number; height: number }): Pt {
  return { x: p.x * (screenCm.width / screenPx.width), y: p.y * (screenCm.height / screenPx.height) };
}

/**
 * 대각선 인치(노트북 사양의 14, 15.6 같은 값) → 가로·세로 cm. 자 없이 화면 크기 구하기.
 * 화면 비율은 화면 px 크기에서 (픽셀은 정사각형이라 px 비율 = 실제 비율)
 */
export function screenCmFromDiagonal(inches: number, px: { width: number; height: number }): { width: number; height: number } {
  const diagCm = inches * 2.54;
  const diagPx = Math.hypot(px.width, px.height);
  return { width: (diagCm * px.width) / diagPx, height: (diagCm * px.height) / diagPx };
}

/** 참여자 ID:폴더 이름과 group_id 로 쓰므로 영문·숫자·-·_ 만 */
export function isValidParticipantId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(id);
}

/** 폴더 이름용 지역 시각 2026-11-11T10-30-00 */
export function formatStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function sampleFileName(id: number, P = COLLECT_POLICY): string {
  return `${String(id).padStart(P.ID_DIGITS, '0')}.png`;
}

export interface LabelRow {
  sampleId: number;
  gazeCm: Pt;
  groupId: string;
}

/** cm 값 글자: 소수 넷째 자리까지, 끝의 0 은 뺌 */
const cmText = (v: number) => String(Number(v.toFixed(4)));

/**
 * labels.csv 내용 (prepare_data.py 와 같은 열, 경로는 labels.csv 가 있는 폴더 기준).
 * 줄바꿈은 파이썬 csv.writer 기본값과 같은 CRLF
 */
export function labelsCsv(rows: LabelRow[]): string {
  const lines = ['sample_id,left_eye_path,right_eye_path,gaze_x_cm,gaze_y_cm,group_id'];
  for (const r of rows) {
    const f = sampleFileName(r.sampleId);
    lines.push([r.sampleId, `left/${f}`, `right/${f}`, cmText(r.gazeCm.x), cmText(r.gazeCm.y), r.groupId].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
