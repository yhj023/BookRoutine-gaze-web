import { useCallback, useEffect, useRef, useState } from 'react';
import { loadGazeModelAuto, type GazeModel } from './gazeModel';

export type GazeModelStatus = 'loading' | 'ready' | 'error';

export interface GazeResult {
  x: number;
  y: number;
  /** 추론에 걸린 시간 (ms) */
  ms: number;
}

/**
 * 시선 모델을 한 번 불러와 두고 predict 를 준다.
 * 이전 추론이 안 끝났으면 이번 차례는 건너뛴다 (null).
 */
export function useGazeModel() {
  const [status, setStatus] = useState<GazeModelStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<GazeModel | null>(null);
  const modelRef = useRef<GazeModel | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadGazeModelAuto()
      .then((m) => {
        if (cancelled) return m.close();
        modelRef.current = m;
        setModel(m);
        setStatus('ready');
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus('error');
        setError(`시선 모델을 불러오지 못했어요 (${e instanceof Error ? e.message : String(e)})`);
      });
    return () => {
      cancelled = true;
      modelRef.current?.close();
      modelRef.current = null;
    };
  }, []);

  const predict = useCallback(async (left: Float32Array, right: Float32Array): Promise<GazeResult | null> => {
    const m = modelRef.current;
    if (!m || busy.current) return null;
    busy.current = true;
    const t0 = performance.now();
    try {
      const xy = await m.predict(left, right);
      return { ...xy, ms: performance.now() - t0 };
    } finally {
      busy.current = false;
    }
  }, []);

  /** 지금 추론 중인지 (중이면 크롭도 건너뛰어 CPU 아끼기) */
  const isBusy = useCallback(() => busy.current, []);

  return { status, error, model, predict, isBusy };
}
