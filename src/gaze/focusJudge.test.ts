/**
 * 원래 앱 BookRoutine_app/lib/gaze/focusJudge.spec.ts 의 스크롤 모드 부분 (페이지 모드는 reference/ 에 없어 뺌).
 * 화면 값은 dp → CSS px 로 같은 실제 길이가 되게 바꿈 (px = dp × 0.6). 보정 객체는 웹 필드(errorPx, noisePx, fittedMap)
 */
import { describe, expect, it } from 'vitest';
import { eyeBlinkThreshold, FocusJudge, type JudgeInput } from './focusJudge';
import type { GazeCalibration } from './gazeCalibration';

const T0 = 1_000_000;
/** 기본: 얼굴 있음, 책 보며 살짝 아래(pitch -10), 시선 (0, -5)cm */
const s = (t: number, o: Partial<JudgeInput> = {}): JudgeInput => ({
  timestamp: T0 + t * 1000,
  faceDetected: true,
  yaw: 2,
  pitch: -10,
  leftEyeOpen: 0.8,
  rightEyeOpen: 0.8,
  gaze: { x: 0, y: -5 },
  ...o,
});

/** 0.5초 간격으로 5초 보정 */
const calibrated = () => {
  const j = new FocusJudge();
  for (let t = 0; t <= 5; t += 0.5) j.judge(s(t, { gaze: { x: (t % 1) - 0.5, y: -5 } }));
  return j;
};

describe('FocusJudge', () => {
  it('보정 5초 동안은 얼굴이 보이면 focused, 끝나면 tracking 으로 전환', () => {
    const j = new FocusJudge();
    const first = j.judge(s(0));
    expect(first).toMatchObject({ phase: 'calibrating', state: 'focused' });
    for (let t = 0.5; t <= 5; t += 0.5) j.judge(s(t));
    expect(j.judge(s(5.5)).phase).toBe('tracking');
    expect(j.baseline).toMatchObject({ yaw: 2, pitch: -10, gaze: { x: 0, y: -5 } });
  });

  it('보정 중 얼굴이 없으면 away, 샘플이 모자라면 보정이 계속됨', () => {
    const j = new FocusJudge();
    for (let t = 0; t <= 6; t += 0.5) expect(j.judge(s(t, { faceDetected: false })).state).toBe('away');
    expect(j.judge(s(6.5)).phase).toBe('calibrating');
  });

  it('평소 모습이면 focused', () => {
    const j = calibrated();
    expect(j.judge(s(6))).toMatchObject({ raw: 'focused', state: 'focused' });
  });

  it('얼굴 없음 → away / 고개 돌림·눈 감음·시선 이탈 → unfocused', () => {
    expect(calibrated().judge(s(6, { faceDetected: false })).raw).toBe('away');
    expect(calibrated().judge(s(6, { yaw: 40 })).raw).toBe('unfocused');
    expect(calibrated().judge(s(6, { pitch: 15 })).raw).toBe('unfocused');
    expect(calibrated().judge(s(6, { leftEyeOpen: 0.05, rightEyeOpen: 0.1 })).raw).toBe('unfocused');
    expect(calibrated().judge(s(6, { gaze: { x: 15, y: -5 } })).raw).toBe('unfocused');
  });

  it('한쪽 눈만 감기거나(윙크) 시선이 조금 움직이는 건 focused', () => {
    expect(calibrated().judge(s(6, { leftEyeOpen: 0.05 })).raw).toBe('focused');
    expect(calibrated().judge(s(6, { gaze: { x: 4, y: -2 } })).raw).toBe('focused');
  });

  it('모델 결과가 없어도(gaze=null) 고개 기준으로 판정', () => {
    const j = new FocusJudge();
    for (let t = 0; t <= 5; t += 0.5) j.judge(s(t, { gaze: null }));
    expect(j.baseline?.gaze).toBeNull();
    expect(j.judge(s(6, { gaze: null })).reason).toBe('집중 (고개 기준)');
    expect(j.judge(s(6.5, { gaze: null, yaw: 40 })).raw).toBe('unfocused');
  });

  it('한 번 튀는 값은 흔들림 보정으로 무시, 계속되면 반영', () => {
    const j = calibrated();
    j.judge(s(6));
    expect(j.judge(s(6.5, { yaw: 40 }))).toMatchObject({ raw: 'unfocused', state: 'focused' });
    expect(j.judge(s(7, { yaw: 40 })).state).toBe('unfocused');
  });

  it('recalibrate 하면 다시 보정 단계', () => {
    const j = calibrated();
    j.recalibrate();
    expect(j.judge(s(10)).phase).toBe('calibrating');
    expect(j.baseline).toBeNull();
  });
});

describe('FocusJudge v2 (개인 보정 사용)', () => {
  const W = 400;
  const H = 800;
  /** 모델 출력이 곧 화면 좌표(px)인 단순한 보정 */
  const cal: GazeCalibration = {
    screen: { width: W, height: H },
    map: (g) => g,
    fittedMap: (g) => g,
    errorPx: 60,
    errorCm: 0.95,
    noisePx: 15,
    quality: 'good',
    head: { yaw: 2, pitch: -10 },
    eyeBlinkSamples: [],
    summary: '',
  };
  const at = (t: number, gx: number, gy: number, o: Partial<JudgeInput> = {}) => s(t, { gaze: { x: gx, y: gy }, ...o });
  const withCal = () => {
    const j = new FocusJudge();
    j.setCalibration(cal);
    return j;
  };

  it('보정을 넣으면 바로 판정 단계, 화면 안을 보면 집중', () => {
    const j = withCal();
    const r = j.judge(at(0, 200, 400));
    expect(r).toMatchObject({ phase: 'tracking', raw: 'focused' });
    expect(r.screenGaze).toEqual({ x: 200, y: 400 });
  });

  it('화면 밖(여유 포함)을 보면 offscreen', () => {
    expect(withCal().judge(at(0, 200, 400 + H)).detail).toBe('offscreen');
    expect(withCal().judge(at(0, W + 50, 400)).raw).toBe('focused'); // 여유(90px) 안쪽
  });

  it('10초 동안 시선이 잡음 수준으로만 움직이고 스크롤이 없으면 멍때림', () => {
    const j = withCal();
    let last;
    for (let t = 0; t <= 11; t += 0.5) last = j.judge(at(t, 200 + ((t * 2) % 3) * 5, 400));
    expect(last).toMatchObject({ state: 'unfocused', detail: 'staring' });
  });

  it('글을 읽듯 좌우로 움직이면 멍때림 아님', () => {
    const j = withCal();
    let last;
    for (let t = 0; t <= 11; t += 0.5) last = j.judge(at(t, 60 + ((t * 2) % 6) * 50, 300 + t * 3));
    expect(last).toMatchObject({ state: 'focused' });
  });

  it('최근 10초 안에 스크롤했으면 멍때림 아님', () => {
    const j = withCal();
    j.notifyScroll(T0 + 5_000);
    let last;
    for (let t = 0; t <= 11; t += 0.5) last = j.judge(at(t, 200, 400));
    expect(last?.state).toBe('focused');
  });

  it('보정의 고개 기준을 사용', () => {
    expect(withCal().judge(at(0, 200, 400, { yaw: 2 + 30 })).detail).toBe('head');
  });

  it('보정 품질이 poor(map=null)면 고개 기준으로만 판정', () => {
    const j = new FocusJudge();
    j.setCalibration({ ...cal, map: null, quality: 'poor' });
    expect(j.judge(at(0, 9999, 9999)).reason).toBe('집중 (고개 기준)');
  });
});

describe('FocusJudge 훑어보기 (빠른 스크롤)', () => {
  const calibrated2 = () => {
    const j = new FocusJudge();
    for (let t = 0; t <= 5; t += 0.5) j.judge(s(t, { gaze: null }));
    return j;
  };

  it('30초 동안 1초에 30px(앱 50dp)씩 계속 스크롤하면 훑어보기', () => {
    const j = calibrated2();
    for (let t = 6; t <= 36; t++) j.notifyScroll(T0 + t * 1000, (t - 6) * 30);
    j.judge(s(36, { gaze: null }));
    expect(j.judge(s(36.5, { gaze: null }))).toMatchObject({ state: 'unfocused', detail: 'skimming' });
  });

  it('20초마다 한 화면(360px, 앱 600dp)씩 넘기는 빠른 읽기도 집중', () => {
    const j = calibrated2();
    j.notifyScroll(T0 + 10_000, 0);
    j.notifyScroll(T0 + 11_000, 360);
    j.notifyScroll(T0 + 31_000, 360);
    j.notifyScroll(T0 + 32_000, 720);
    expect(j.judge(s(33, { gaze: null })).raw).toBe('focused');
  });
});

describe('눈 감음 기준 (웹: 사람마다 = max(0.5, 눈 뜬 상태 eyeBlink 중앙값 + 0.3))', () => {
  const open = (blink: number) => ({ leftEyeOpen: 1 - blink, rightEyeOpen: 1 - blink });
  /** 눈 뜬 상태 eyeBlink 가 b 인 사람의 5초 자동 기준 */
  const autoWith = (b: number) => {
    const j = new FocusJudge();
    for (let t = 0; t <= 5; t += 0.5) j.judge(s(t, open(b)));
    return j;
  };

  it('계산: 바닥값 0.5, 깜빡임(0.5 초과)은 빼고 중앙값 + 0.3', () => {
    expect(eyeBlinkThreshold([])).toBe(0.5);
    expect(eyeBlinkThreshold([0.1, 0.1, 0.15])).toBe(0.5); // 0.4 → 바닥 0.5
    expect(eyeBlinkThreshold([0.3, 0.3, 0.35, 0.9])).toBeCloseTo(0.6); // 0.9 는 깜빡임
  });

  it('자동 기준: 평소 eyeBlink 0.1 → 기준 0.5, 측정한 감은 눈(0.51~0.63)은 눈 감음', () => {
    const j = autoWith(0.1);
    expect(j.eyeBlinkThreshold).toBe(0.5);
    expect(j.judge(s(6, { leftEyeOpen: 1 - 0.54, rightEyeOpen: 1 - 0.51 }))).toMatchObject({ raw: 'unfocused', reason: '눈 감음' });
    expect(autoWith(0.1).judge(s(6, { leftEyeOpen: 1 - 0.56, rightEyeOpen: 1 - 0.63 })).raw).toBe('unfocused');
  });

  it('평소 눈이 가늘어 eyeBlink 0.35 인 사람 → 기준 0.65, 0.6 은 뜬 것으로 봄', () => {
    const j = autoWith(0.35);
    expect(j.eyeBlinkThreshold).toBeCloseTo(0.65);
    expect(j.judge(s(6, open(0.6))).raw).toBe('focused');
    expect(autoWith(0.35).judge(s(6, open(0.7))).raw).toBe('unfocused');
  });

  it('개인 보정의 eyeBlinkSamples 로 기준을 정하고, recalibrate 하면 바닥값으로', () => {
    const j = new FocusJudge();
    j.setCalibration({
      screen: { width: 400, height: 800 },
      map: null,
      fittedMap: null,
      errorPx: Infinity,
      errorCm: Infinity,
      noisePx: 0,
      quality: 'poor',
      head: { yaw: 2, pitch: -10 },
      eyeBlinkSamples: [0.25, 0.3, 0.3, 0.35, 0.95],
      summary: '',
    });
    expect(j.eyeBlinkThreshold).toBeCloseTo(0.6);
    j.recalibrate();
    expect(j.eyeBlinkThreshold).toBe(0.5);
  });
});
