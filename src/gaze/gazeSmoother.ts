/**
 * 화면 위 시선 점을 부드럽게 (표시용만. 보정 계산·집중 판정에는 쓰지 않음)
 *
 * 1) 최근 WINDOW_MS 동안의 점들 중 x, y 각각의 중앙값을 쓴다.
 *    평균보다 튀는 값에 강하다. 대신 시선을 옮기면 WINDOW_MS 의 절반쯤 늦게 따라온다.
 * 2) 중앙값이 지금 보이는 점에서 DEADZONE_PX 안쪽이면 점을 움직이지 않는다 (작은 떨림 무시).
 * 순수 로직 (React/DOM 없음)
 */
import { CALIBRATION_POLICY, type Pt } from './gazeCalibration';

export interface GazeDotPolicy {
  WINDOW_MS: number;
  STALE_MS: number;
  DEADZONE_PX: number;
}

export const GAZE_DOT_POLICY: GazeDotPolicy = {
  /** 이 시간(ms) 안의 점들로 중앙값 (1초에 10번이면 약 15개) */
  WINDOW_MS: 1500,
  /** 이보다 오래 값이 안 들어오면 점 숨김 (얼굴을 놓친 경우) */
  STALE_MS: 1500,
  /** 이 거리(px) 안쪽 변화는 무시. 화면 위 약 1.5cm */
  DEADZONE_PX: Math.round(1.5 / CALIBRATION_POLICY.CM_PER_PX),
};

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function createGazeSmoother(policy: GazeDotPolicy = GAZE_DOT_POLICY) {
  let buf: { t: number; p: Pt }[] = [];
  let shown: Pt | null = null;
  return {
    /** 새 점을 넣고 화면에 보일 점을 돌려줌. p 가 null 이면 (얼굴 없음) 오래된 값만 정리 */
    push(t: number, p: Pt | null): Pt | null {
      if (p) buf.push({ t, p });
      buf = buf.filter((x) => t - x.t <= policy.WINDOW_MS);
      if (buf.length === 0 || (!p && t - buf[buf.length - 1].t > policy.STALE_MS)) {
        shown = null;
        return null;
      }
      const m = { x: median(buf.map((x) => x.p.x)), y: median(buf.map((x) => x.p.y)) };
      if (!shown || Math.hypot(m.x - shown.x, m.y - shown.y) > policy.DEADZONE_PX) shown = m;
      return shown;
    },
    reset() {
      buf = [];
      shown = null;
    },
  };
}
