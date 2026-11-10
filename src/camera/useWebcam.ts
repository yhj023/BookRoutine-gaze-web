import { useEffect, useRef, useState } from 'react';

export type WebcamStatus = 'starting' | 'ready' | 'error';

export interface WebcamState {
  /** 이 <video>의 프레임은 항상 원본(반전 안 됨) — 처리용 프레임은 여기서 꺼낸다 */
  videoRef: React.RefObject<HTMLVideoElement>;
  status: WebcamStatus;
  error: string | null;
  /** 실제로 받은 영상 크기 (px) */
  size: { width: number; height: number } | null;
}

/**
 * 웹캠을 켜서 <video>에 연결한다. 화면을 떠나면 카메라를 끈다.
 * 영상은 브라우저 안에서만 쓰고, 어디로도 보내지 않는다.
 */
export function useWebcam(): WebcamState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<WebcamStatus>('starting');
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<WebcamState['size']>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setError('이 브라우저는 카메라를 쓸 수 없어요 (https 또는 localhost에서 열어 주세요)');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setSize({ width: video.videoWidth, height: video.videoHeight });
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setError(describeError(e));
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, []);

  return { videoRef, status, error, size };
}

function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
      return '카메라 사용이 막혀 있어요. 주소창 옆 자물쇠를 눌러 카메라를 허용해 주세요.';
    case 'NotFoundError':
      return '카메라를 찾지 못했어요.';
    case 'NotReadableError':
      return '다른 프로그램이 카메라를 쓰고 있어요.';
    default:
      return `카메라를 켜지 못했어요 (${e instanceof Error ? e.message : String(e)})`;
  }
}
