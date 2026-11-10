import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { EYE_CORNERS, LEFT_EYE_RING, RIGHT_EYE_RING } from './landmarkIndices';

const RING_COLOR = '#4ade80';
const CORNER_COLOR = '#f43f5e';

/**
 * 원본 영상 좌표(반전 없음)로 눈 윤곽과 눈 구석을 그린다.
 * 거울처럼 보이게 하는 건 CSS가 캔버스째 뒤집어서 처리한다.
 * landmarks 가 null 이면(얼굴 없음) 지우기만 한다.
 */
export function drawEyes(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[] | null,
  width: number,
  height: number,
) {
  ctx.clearRect(0, 0, width, height);
  if (!landmarks) return;

  const px = (i: number) => ({ x: landmarks[i].x * width, y: landmarks[i].y * height });
  const unit = Math.max(1, width / 640); // 영상 크기가 달라도 점 크기가 비슷하게

  for (const ring of [LEFT_EYE_RING, RIGHT_EYE_RING]) {
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 1.5 * unit;
    ctx.beginPath();
    ring.forEach((i, k) => {
      const p = px(i);
      if (k === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = RING_COLOR;
    for (const i of ring) dot(ctx, px(i), 2 * unit);
  }

  ctx.fillStyle = CORNER_COLOR;
  for (const i of EYE_CORNERS) dot(ctx, px(i), 4.5 * unit);
}

function dot(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, r: number) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}
