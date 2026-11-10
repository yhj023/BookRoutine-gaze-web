import type { Img } from '../gaze/eyeCrop';

let canvas: HTMLCanvasElement | null = null;

/**
 * <video> 의 지금 프레임을 원본 그대로(반전 없음, 영상 원래 크기) 꺼낸다.
 * 미리보기의 거울 반전은 CSS 라서 여기에는 영향이 없다.
 */
export function grabFrame(video: HTMLVideoElement): { img: Img; canvas: HTMLCanvasElement } | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  canvas ??= document.createElement('canvas');
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { img: { width: w, height: h, channels: 4, data }, canvas };
}

/** 파일을 이 컴퓨터로 내려받기 (네트워크로 보내지 않음) */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
