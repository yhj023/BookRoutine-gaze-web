import { useEffect, useState } from 'react';

/** 지금 전체 화면인지 (Fullscreen API 의 fullscreenchange 를 따라감) */
export function useIsFullscreen(): boolean {
  const [on, setOn] = useState(() => document.fullscreenElement != null);
  useEffect(() => {
    const update = () => setOn(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  return on;
}
