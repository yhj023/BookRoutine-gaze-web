/**
 * 눈 크롭 (순수 로직, React·DOM 없음 → Node 테스트 가능)
 *
 * reference/eye_extractor.py 의 EyeExtractor.process() 를 한 줄씩 옮긴 것.
 * gaze.tflite 는 이 방식으로 자른 눈으로 학습됐으므로 숫자 하나까지 같아야 한다.
 *   1) 두 눈 구석 중점을 잇는 선이 수평이 되게 회전
 *   2) 눈 사이 거리 = 224 × 0.35 가 되게 크기 맞춤 (눈 중점 → (112, 224/2.5))
 *   3) 눈꺼풀 윤곽 범위 × 1.8 정사각형을 잘라 64×64 로 줄임
 *
 * OpenCV 와 픽셀까지 같게 하려고 warpAffine / resize 를 OpenCV 의 정수(고정소수점) 계산으로 따라 했다.
 * 파이썬 쪽의 float32 계산은 Math.fround 로 맞춘다.
 * 검증: src/gaze/eyeCrop.ops.test.ts (OpenCV 연산), eyeCrop.compare.test.ts (얼굴 사진)
 */
import {
  LEFT_EYE_INNER,
  LEFT_EYE_OUTER,
  LEFT_EYE_RING,
  RIGHT_EYE_INNER,
  RIGHT_EYE_OUTER,
  RIGHT_EYE_RING,
} from './landmarkIndices';

export const EYE_CROP_POLICY = {
  FACE_SIZE: 224,
  EYE_SIZE: 64,
  EYE_BOX_SCALE: 1.8,
  /** 정규화된 얼굴에서 눈 사이 거리 = FACE_SIZE × 이 값 */
  TARGET_EYE_DIST_RATIO: 0.35,
  /** 눈 중점의 세로 위치 = FACE_SIZE / 이 값 */
  CENTER_Y_DIV: 2.5,
} as const;

/** 픽셀 배열 (행 순서, 채널 묶음). channels 3 = RGB/BGR, 4 = RGBA */
export interface Img {
  width: number;
  height: number;
  channels: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** 2×3 아핀 행렬 [[a, b, c], [d, e, f]] */
export type Affine = [[number, number, number], [number, number, number]];

export interface EyeCropResult {
  leftEye: Img;
  rightEye: Img;
  faceNormalized: Img;
  tiltDeg: number;
}

const f32 = Math.fround;

/** OpenCV cvRound: 가장 가까운 정수, 딱 절반이면 짝수 쪽 (x86 SSE2 와 같음) */
export function cvRound(x: number): number {
  const r = Math.round(x);
  return r - x === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/* ───────────── OpenCV 연산 ───────────── */

/** cv2.getRotationMatrix2D (angle: 도, 반시계 방향 +) */
export function getRotationMatrix2D(center: { x: number; y: number }, angleDeg: number, scale: number): Affine {
  // OpenCV 는 중심을 Point2f(float32)로 받는다
  const cx = f32(center.x);
  const cy = f32(center.y);
  const a = (angleDeg * Math.PI) / 180;
  const alpha = Math.cos(a) * scale;
  const beta = Math.sin(a) * scale;
  return [
    [alpha, beta, (1 - alpha) * cx - beta * cy],
    [-beta, alpha, beta * cx + (1 - alpha) * cy],
  ];
}

/** float32 곱셈-덧셈 (OpenCV SIMD 의 v_fma 와 같은 한 번 반올림) */
const fma32 = (a: number, b: number, c: number) => f32(a * b + c);

/**
 * cv2.warpAffine(src, M, (w, h)) — INTER_LINEAR, BORDER_CONSTANT(0)
 * OpenCV 5.0 방식 (float32): 역행렬(double → float32)로 원본 위치를 구하고 float32 로 보간, 반올림.
 * OpenCV 와 비교하면 15만 값 중 수십 개가 1 차이 — 모두 값이 정확히 x.5 근처라
 * float32 계산 순서로 갈리는 경우 (eyeCrop.ops.test.ts 참고).
 */
export function warpAffine(src: Img, M: Affine, w: number, h: number): Img {
  // invertAffineTransform
  let D = M[0][0] * M[1][1] - M[0][1] * M[1][0];
  D = D !== 0 ? 1 / D : 0;
  const A11 = M[1][1] * D;
  const A22 = M[0][0] * D;
  const A12 = -M[0][1] * D;
  const A21 = -M[1][0] * D;
  const b1 = -A11 * M[0][2] - A12 * M[1][2];
  const b2 = -A21 * M[0][2] - A22 * M[1][2];

  const m0 = f32(A11);
  const m1 = f32(A12);
  const m2 = f32(b1);
  const m3 = f32(A21);
  const m4 = f32(A22);
  const m5 = f32(b2);

  const cn = src.channels;
  const sw = src.width;
  const sh = src.height;
  const S = src.data;
  const out = new Uint8Array(w * h * cn);

  for (let y = 0; y < h; y++) {
    const rowX = fma32(m1, y, m2);
    const rowY = fma32(m4, y, m5);
    for (let x = 0; x < w; x++) {
      const fx = fma32(m0, x, rowX);
      const fy = fma32(m3, x, rowY);
      const sx = Math.floor(fx);
      const sy = Math.floor(fy);
      const ax = f32(fx - sx);
      const ay = f32(fy - sy);

      // 원본 밖 픽셀은 0 (BORDER_CONSTANT)
      const in0x = sx >= 0 && sx < sw;
      const in1x = sx + 1 >= 0 && sx + 1 < sw;
      const in0y = sy >= 0 && sy < sh;
      const in1y = sy + 1 >= 0 && sy + 1 < sh;
      const o = (y * w + x) * cn;
      for (let c = 0; c < cn; c++) {
        const p00 = in0y && in0x ? S[(sy * sw + sx) * cn + c] : 0;
        const p01 = in0y && in1x ? S[(sy * sw + sx + 1) * cn + c] : 0;
        const p10 = in1y && in0x ? S[((sy + 1) * sw + sx) * cn + c] : 0;
        const p11 = in1y && in1x ? S[((sy + 1) * sw + sx + 1) * cn + c] : 0;
        const top = fma32(ax, p01 - p00, p00);
        const bottom = fma32(ax, p11 - p10, p10);
        const v = cvRound(fma32(ay, f32(bottom - top), top));
        out[o + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
  return { width: w, height: h, channels: cn, data: out };
}

/**
 * 한 축의 INTER_LINEAR 좌표·가중치 (OpenCV resizeGeneric 과 같은 float32 계산)
 * clamp: 가로는 가장자리에서 위치를 붙잡고(OpenCV xofs), 세로는 붙잡지 않고 읽을 줄 번호만 자른다.
 */
function linearAxis(srcLen: number, dstLen: number, clamp: boolean) {
  const ONE = 2048; // INTER_RESIZE_COEF_SCALE
  const scale = 1 / (dstLen / srcLen);
  const ofs = new Int32Array(dstLen);
  const a0 = new Int32Array(dstLen);
  const a1 = new Int32Array(dstLen);
  for (let d = 0; d < dstLen; d++) {
    let f = f32((d + 0.5) * scale - 0.5);
    let s = Math.floor(f);
    f = f32(f - s);
    if (clamp && s < 0) {
      f = 0;
      s = 0;
    }
    if (clamp && s >= srcLen - 1) {
      f = 0;
      s = srcLen - 1;
    }
    ofs[d] = s;
    a0[d] = cvRound(f32(f32(1 - f) * ONE));
    a1[d] = cvRound(f32(f * ONE));
  }
  return { ofs, a0, a1 };
}

/** cv2.resize(src, (w, h)) — 기본 INTER_LINEAR (정확히 2배 축소면 OpenCV 처럼 INTER_AREA) */
export function resizeLinear(src: Img, w: number, h: number): Img {
  const cn = src.channels;
  const sw = src.width;
  const sh = src.height;
  const S = src.data;
  const out = new Uint8Array(w * h * cn);

  if (sw === w * 2 && sh === h * 2) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < cn; c++) {
          const i = (2 * y * sw + 2 * x) * cn + c;
          const v = S[i] + S[i + cn] + S[i + sw * cn] + S[i + sw * cn + cn];
          out[(y * w + x) * cn + c] = (v + 2) >> 2;
        }
    return { width: w, height: h, channels: cn, data: out };
  }

  const X = linearAxis(sw, w, true);
  const Y = linearAxis(sh, h, false);
  const clipRow = (r: number) => (r < 0 ? 0 : r > sh - 1 ? sh - 1 : r);
  // 가로 먼저 (정수 × 2048)
  const rows = new Map<number, Int32Array>();
  const hrow = (sy: number) => {
    let r = rows.get(sy);
    if (r) return r;
    r = new Int32Array(w * cn);
    for (let x = 0; x < w; x++) {
      const s0 = (sy * sw + X.ofs[x]) * cn;
      const s1 = (sy * sw + Math.min(X.ofs[x] + 1, sw - 1)) * cn;
      for (let c = 0; c < cn; c++) r[x * cn + c] = S[s0 + c] * X.a0[x] + S[s1 + c] * X.a1[x];
    }
    rows.set(sy, r);
    return r;
  };
  // 세로 (OpenCV SIMD 경로: 16비트 곱의 위쪽 절반을 쓰는 방식)
  for (let y = 0; y < h; y++) {
    const r0 = hrow(clipRow(Y.ofs[y]));
    const r1 = hrow(clipRow(Y.ofs[y] + 1));
    const b0 = Y.a0[y];
    const b1 = Y.a1[y];
    for (let i = 0; i < w * cn; i++) {
      const v = (((b0 * (r0[i] >> 4)) >> 16) + ((b1 * (r1[i] >> 4)) >> 16) + 2) >> 2;
      out[y * w * cn + i] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { width: w, height: h, channels: cn, data: out };
}

/** img[y1:y2, x1:x2] */
function crop(src: Img, x1: number, y1: number, x2: number, y2: number): Img {
  const cn = src.channels;
  const w = x2 - x1;
  const h = y2 - y1;
  const out = new Uint8Array(w * h * cn);
  for (let y = 0; y < h; y++) {
    const from = ((y1 + y) * src.width + x1) * cn;
    out.set(src.data.subarray(from, from + w * cn), y * w * cn);
  }
  return { width: w, height: h, channels: cn, data: out };
}

/* ───────────── eye_extractor.py 옮김 ───────────── */

type P = { x: number; y: number };

/** EyeExtractor._crop_square */
function cropSquare(image: Img, ring: P[]): Img | null {
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p.x;
    sy += p.y;
  }
  const cx = sx / ring.length;
  const cy = sy / ring.length;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  const ptpX = Math.max(...xs) - Math.min(...xs);
  const ptpY = Math.max(...ys) - Math.min(...ys);
  const half = (Math.max(ptpX, ptpY) / 2) * EYE_CROP_POLICY.EYE_BOX_SCALE;
  // 파이썬 int() = 0 쪽으로 버림
  let x1 = Math.trunc(cx - half);
  let y1 = Math.trunc(cy - half);
  let x2 = Math.trunc(cx + half);
  let y2 = Math.trunc(cy + half);
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(image.width, x2);
  y2 = Math.min(image.height, y2);
  if (x2 - x1 < 4 || y2 - y1 < 4) return null;
  const s = EYE_CROP_POLICY.EYE_SIZE;
  return resizeLinear(crop(image, x1, y1, x2, y2), s, s);
}

/**
 * EyeExtractor.process — 얼굴 랜드마크(정규화 0~1, 478개)로 눈 두 장을 자른다.
 * image 는 반전하지 않은 원본 프레임이어야 한다.
 * 실패(눈 사이 거리 0, 크롭이 너무 작음)하면 null.
 */
export function extractEyes(image: Img, landmarks: ReadonlyArray<{ x: number; y: number }>): EyeCropResult | null {
  const P = EYE_CROP_POLICY;
  const { width: w, height: h } = image;
  // pts = np.array([...], dtype=np.float32)
  const pt = (i: number): P => ({ x: f32(landmarks[i].x * w), y: f32(landmarks[i].y * h) });
  const mid32 = (a: P, b: P): P => ({ x: f32(f32(a.x + b.x) / 2), y: f32(f32(a.y + b.y) / 2) });

  const leftCenter = mid32(pt(LEFT_EYE_OUTER), pt(LEFT_EYE_INNER));
  const rightCenter = mid32(pt(RIGHT_EYE_OUTER), pt(RIGHT_EYE_INNER));

  // 1) 기울기 (float32 → float())
  const dx = f32(rightCenter.x - leftCenter.x);
  const dy = f32(rightCenter.y - leftCenter.y);
  const tiltDeg = f32(f32(Math.atan2(dy, dx)) * f32(180 / Math.PI));
  const eyeDist = f32(Math.hypot(dx, dy));
  if (eyeDist < 1e-3) return null;

  // 2) 회전 + 크기 행렬
  const eyeMid = mid32(leftCenter, rightCenter);
  const targetEyeDist = P.FACE_SIZE * P.TARGET_EYE_DIST_RATIO;
  const scale = targetEyeDist / eyeDist; // 둘 다 파이썬 float(double)
  const M = getRotationMatrix2D(eyeMid, tiltDeg, scale);
  // rot_mat[0, 2] += 224/2 - eye_mid[0]  (오른쪽 값은 numpy float32 계산)
  M[0][2] += f32(P.FACE_SIZE / 2 - eyeMid.x);
  M[1][2] += f32(f32(P.FACE_SIZE / P.CENTER_Y_DIV) - eyeMid.y);

  const faceNormalized = warpAffine(image, M, P.FACE_SIZE, P.FACE_SIZE);

  // 3) 같은 행렬로 눈 윤곽 점을 옮기기 (float64)
  const transform = (idx: readonly number[]) =>
    idx.map((i) => {
      const p = pt(i);
      return { x: M[0][0] * p.x + M[0][1] * p.y + M[0][2], y: M[1][0] * p.x + M[1][1] * p.y + M[1][2] };
    });

  const leftEye = cropSquare(faceNormalized, transform(LEFT_EYE_RING));
  const rightEye = cropSquare(faceNormalized, transform(RIGHT_EYE_RING));
  if (!leftEye || !rightEye) return null;
  return { leftEye, rightEye, faceNormalized, tiltDeg };
}
