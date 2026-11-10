/**
 * 5점 보정 화면 (BookRoutine_app/components/gaze/GazeCalibrationOverlay.tsx 의 흐름을 웹으로 옮김)
 *
 *  준비 → 점 5개 (가운데 + 네 모서리) → 가운데 3초 응시 → 결과
 *  - 점마다: [이동] → 도착 신호(톡) → 잠깐 대기 → 값 모으기
 *  - 최소 DOT_MIN_MS 는 보여 주고, 안정된 값이 DOT_TARGET_SAMPLES 개 모이면 다음 점으로
 *  - 값이 잘 안 모여도 DOT_MAX_MS 가 지나면 넘어감 (그 점은 값이 부족하면 계산에서 빠짐)
 * 자세 검사(postureCheck)는 이번 범위가 아니라서 뺐다.
 * 좌표는 이 화면(전체 화면) 기준 CSS px.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../camera/grabFrame';
import {
  CALIBRATION_POLICY,
  calibrationTargets,
  computeCalibration,
  settled,
  type CalibPointData,
  type GazeCalibration,
  type Pt,
} from '../gaze/gazeCalibration';
import type { SampleHub } from '../gaze/gazeSample';

/**
 * 원래 앱과 같은 값. 단 DOT_TARGET_SAMPLES 만 웹에서 4 → 12 로 늘림
 * (2026-11-11: 점마다 값 4개로는 떨림이 남아서. /try 는 1초에 최대 10번 재므로 점당 약 2초)
 */
export const CALIBRATION_FLOW_POLICY = {
  DOT_MIN_MS: 1_500,
  DOT_MAX_MS: 5_000,
  DOT_TARGET_SAMPLES: 12,
  FIXATION_MIN_MS: 3_000,
  FIXATION_MAX_MS: 6_000,
  FIXATION_TARGET_SAMPLES: 5,
  POLL_MS: 200,
  /** 점이 다음 위치로 움직이는 시간 */
  DOT_MOVE_MS: 450,
  /** 도착 신호(점이 톡 커졌다 돌아옴) 시간 */
  ARRIVE_POP_MS: 280,
  /** 도착 신호 뒤 값을 모으기 전 대기 */
  ARRIVE_HOLD_MS: 300,
} as const;

type Phase = 'intro' | 'dots' | 'fixation' | 'result';

interface Props {
  hub: SampleHub;
  onDone: (cal: GazeCalibration | null) => void;
}

export default function CalibrationOverlay({ hub, onDone }: Props) {
  const P = CALIBRATION_FLOW_POLICY;
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [dotIndex, setDotIndex] = useState(0);
  const [dot, setDot] = useState<{ pos: Pt; move: boolean; pop: number }>({ pos: { x: 0, y: 0 }, move: false, pop: 0 });
  const [result, setResult] = useState<GazeCalibration | null>(null);
  const [faceOk, setFaceOk] = useState(true);

  const pointsRef = useRef<CalibPointData[]>([]);
  const fixationRef = useRef<CalibPointData | null>(null);
  const currentRef = useRef<CalibPointData | null>(null);

  /** 원인 분석용: 점 위치·모델 값·시각만 (사진 없음). data/calib/ 에 두면 npm run analyze:calib */
  const saveData = () => {
    if (!result || !size) return;
    const { map: _m, fittedMap: _f, ...summary } = result;
    const data = {
      savedAt: new Date().toISOString(),
      screen: size,
      policy: { ...CALIBRATION_FLOW_POLICY, ...CALIBRATION_POLICY },
      result: summary,
      points: pointsRef.current,
      fixation: fixationRef.current,
    };
    const name = `calib-${data.savedAt.replace(/[:.]/g, '-')}.json`;
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
  };

  // 샘플 받기: 값 모으는 중이면 넣기
  useEffect(
    () =>
      hub.subscribe((s) => {
        setFaceOk(s.faceDetected && s.gaze != null);
        const cur = currentRef.current;
        if (cur && s.faceDetected && s.gaze) cur.obs.push({ t: s.timestamp, gaze: s.gaze, yaw: s.yaw, pitch: s.pitch });
      }),
    [hub],
  );

  // Esc 로 그만두기
  const cancel = useCallback(() => {
    currentRef.current = null;
    onDone(null);
  }, [onDone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  /** 시작: 전체 화면으로 바꾼 뒤 화면 크기를 재고 점 단계로 */
  const start = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // 전체 화면이 막혀도 창 크기 그대로 진행
    }
    // 전체 화면 전환이 끝날 때까지 두 프레임 기다린 뒤 크기 재기
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = rootRef.current?.getBoundingClientRect();
    pointsRef.current = [];
    setResult(null);
    setSize({ width: r?.width ?? window.innerWidth, height: r?.height ?? window.innerHeight });
    setDotIndex(0);
    setPhase('dots');
  };

  /**
   * 점 하나 진행: [이동(선택)] → 도착 신호 → 대기 → 값 모으기 → onStepDone(point)
   * 이동·신호·대기 동안 들어온 값은 버림. shownAt = 대기가 끝난 시각 (+ settled 0.7초)
   * 반환값 = 정리 함수
   */
  const runDotStep = (
    target: Pt,
    opts: { move: boolean; minMs: number; maxMs: number; targetSamples: number; onStepDone: (p: CalibPointData) => void },
  ) => {
    currentRef.current = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let poll: ReturnType<typeof setInterval> | null = null;

    const begin = () => {
      const point: CalibPointData = { target, shownAt: performance.now(), obs: [] };
      currentRef.current = point;
      poll = setInterval(() => {
        const elapsed = performance.now() - point.shownAt;
        const enough = settled(point).length >= opts.targetSamples;
        if ((elapsed >= opts.minMs && enough) || elapsed >= opts.maxMs) {
          if (poll) clearInterval(poll);
          poll = null;
          currentRef.current = null;
          opts.onStepDone(point);
        }
      }, P.POLL_MS);
    };
    const arrive = () => {
      setDot((d) => ({ ...d, pop: d.pop + 1 }));
      timers.push(setTimeout(begin, P.ARRIVE_HOLD_MS));
    };

    setDot((d) => ({ ...d, pos: target, move: opts.move }));
    timers.push(setTimeout(arrive, opts.move ? P.DOT_MOVE_MS : 0));

    return () => {
      timers.forEach(clearTimeout);
      if (poll) clearInterval(poll);
      currentRef.current = null;
    };
  };

  // 점 단계
  useEffect(() => {
    if (phase !== 'dots' || !size) return;
    const targets = calibrationTargets(size.width, size.height);
    return runDotStep(targets[dotIndex], {
      move: dotIndex > 0,
      minMs: P.DOT_MIN_MS,
      maxMs: P.DOT_MAX_MS,
      targetSamples: P.DOT_TARGET_SAMPLES,
      onStepDone: (point) => {
        pointsRef.current.push(point);
        if (dotIndex + 1 < targets.length) setDotIndex(dotIndex + 1);
        else setPhase('fixation');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dotIndex, size]);

  // 가운데 응시
  useEffect(() => {
    if (phase !== 'fixation' || !size) return;
    return runDotStep(
      { x: size.width / 2, y: size.height / 2 },
      {
        move: true,
        minMs: P.FIXATION_MIN_MS,
        maxMs: P.FIXATION_MAX_MS,
        targetSamples: P.FIXATION_TARGET_SAMPLES,
        onStepDone: (point) => {
          fixationRef.current = point;
          setResult(computeCalibration(pointsRef.current, point, size));
          setPhase('result');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, size]);

  const showDot = phase === 'dots' || phase === 'fixation';

  return (
    <div ref={rootRef} className="calib">
      {phase === 'intro' && (
        <div className="calib-panel">
          <h2>시선 보정</h2>
          <p>화면에 점이 5개 차례로 나와요. 고개는 움직이지 말고 눈으로만 점을 따라가 주세요.</p>
          <p>마지막에는 가운데 점을 3초 동안 가만히 봐요. 화면이 전체 화면으로 바뀌어요.</p>
          {!faceOk && <p className="error">얼굴이나 눈이 잘 안 보여요. 카메라 앞에 바르게 앉아 주세요.</p>}
          <div className="calib-row">
            <button type="button" className="ghost" onClick={cancel}>
              취소
            </button>
            <button type="button" className="primary" onClick={start}>
              시작
            </button>
          </div>
        </div>
      )}

      {showDot && (
        <>
          <p className="calib-guide">
            {phase === 'dots'
              ? `고개는 움직이지 말고 눈으로만 점을 따라가 주세요 (${dotIndex + 1}/5)`
              : '가운데 점을 가만히 봐 주세요'}
            {!faceOk && ' · 얼굴이 잘 안 보여요'}
          </p>
          <div
            className="calib-dot"
            style={{
              transform: `translate(${dot.pos.x}px, ${dot.pos.y}px)`,
              transition: dot.move ? `transform ${P.DOT_MOVE_MS}ms cubic-bezier(0.65, 0, 0.35, 1)` : 'none',
            }}
          >
            <span key={dot.pop} style={{ animationDuration: `${P.ARRIVE_POP_MS}ms` }} />
          </div>
        </>
      )}

      {phase === 'result' && result && (
        <div className="calib-panel">
          <h2>{result.quality === 'poor' ? '보정 완료 (정확도 낮음)' : '보정 완료'}</h2>
          <p className="calib-big">
            {Number.isFinite(result.errorCm) ? `시선 오차 약 ${result.errorCm.toFixed(1)}cm` : '시선 측정값 부족'}
          </p>
          {result.quality !== 'poor' && <p>{result.summary}</p>}
          {result.quality === 'poor' &&
            (result.fittedMap ? (
              <p>시선 점은 보여 주지만, 실제 시선과 꽤 떨어질 수 있어요. 더 가까이 앉아 [다시 하기]를 하면 나아질 수 있어요.</p>
            ) : (
              <p>{result.summary}. 얼굴과 두 눈이 잘 보이게 하고 [다시 하기]를 눌러 주세요.</p>
            ))}
          <div className="calib-row">
            <button type="button" className="ghost" onClick={start}>
              다시 하기
            </button>
            <button type="button" className="ghost" onClick={saveData} title="숫자만 저장해요 (사진 없음)">
              보정 데이터 저장
            </button>
            <button type="button" className="primary" onClick={() => onDone(result)}>
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
