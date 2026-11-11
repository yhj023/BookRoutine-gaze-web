/**
 * /try — 처음 화면 + 전체 화면 전환
 *  [시작] → 전체 화면 → 체험(TryExperience: 카메라·보정·시선 점·집중 판정)
 *  전체 화면을 나가면 (Esc 등) 체험을 떼어 내고 처음 화면으로. 카메라도 꺼짐
 * 카메라는 [시작] 전에는 켜지 않는다.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsFullscreen } from '../components/useFullscreen';
import TryExperience from './TryExperience';

export default function TryPage() {
  const isFullscreen = useIsFullscreen();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 전체 화면이 켜져 있다가 꺼지면 처음으로 (켜지는 신호와 [시작] 처리 순서가 달라도 되게, 꺼지는 순간만 봄)
  const wasFullscreen = useRef(isFullscreen);
  useEffect(() => {
    if (wasFullscreen.current && !isFullscreen) setStarted(false);
    wasFullscreen.current = isFullscreen;
  }, [isFullscreen]);

  const start = async () => {
    setError(null);
    try {
      await document.documentElement.requestFullscreen();
      setStarted(true);
    } catch {
      setError('전체 화면으로 바꾸지 못했어요. 다시 눌러 주세요.');
    }
  };

  if (started) return <TryExperience />;

  return (
    <main className="try try-start">
      <p className="eyebrow">체험하기</p>
      <h1>내 시선과 집중 상태를 확인해 봐요</h1>
      <ol className="start-steps">
        <li>[시작]을 누르면 전체 화면으로 바뀌고 카메라가 켜져요.</li>
        <li>점 5개를 눈으로 따라가는 보정을 하면 화면 위에 내 시선이 보여요.</li>
        <li>아래 글을 읽으면서 집중 상태가 어떻게 바뀌는지 봐요.</li>
      </ol>
      <p className="hint">카메라 영상은 이 컴퓨터 안에서만 처리하고, 저장하거나 보내지 않아요. Esc 를 누르면 언제든 이 화면으로 돌아와요.</p>
      <button type="button" className="primary start-btn" onClick={start}>
        시작
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
