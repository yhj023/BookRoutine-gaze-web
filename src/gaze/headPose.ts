/**
 * 고개 각도 (MediaPipe 얼굴 변환 행렬 4×4 → yaw / pitch, 도)
 *
 * 원래 앱은 ML Kit 의 yawAngle / pitchAngle 을 썼다. 웹에는 그게 없어서 행렬에서 계산한다.
 * 집중 판정은 "평소 내 자세(기준)"와의 차이만 보므로, 0° 의 위치보다 변화량이 정확한 게 중요하다.
 *
 * 분해: R = Ry(yaw) · Rx(pitch) · Rz(roll)  (y 위, x 오른쪽)
 *   pitch = asin(−R[1][2]),  yaw = atan2(R[0][2], R[2][2])
 * 행렬 data 는 펼친 16개. 이동값(마지막 열)이 12~14 번에 있으면 열 순서(column-major), 3·7·11 번에 있으면 행 순서.
 * 순수 로직 (React/DOM 없음)
 */

export interface HeadPose {
  yaw: number;
  pitch: number;
}

const DEG = 180 / Math.PI;

/** 펼친 data 에서 회전 R[r][c] 읽는 함수 고르기 */
function reader(m: ArrayLike<number>): (r: number, c: number) => number {
  const rowMajorTranslation = Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]);
  const colMajorTranslation = Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14]);
  return colMajorTranslation >= rowMajorTranslation ? (r, c) => m[c * 4 + r] : (r, c) => m[r * 4 + c];
}

export function headPoseFromMatrix(m: ArrayLike<number> | null | undefined): HeadPose | null {
  if (!m || m.length < 16) return null;
  const R = reader(m);
  const s = Math.max(-1, Math.min(1, -R(1, 2)));
  const pitch = Math.asin(s) * DEG;
  const yaw = Math.atan2(R(0, 2), R(2, 2)) * DEG;
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
  return { yaw, pitch };
}
