/**
 * 눈 크롭 → gaze.tflite 입력 값
 *
 * 모델 입력 (모델 파일에서 직접 확인):
 *   serving_default_args_0 = 사진 왼쪽 눈 (extractEyes().leftEye, 33·133)
 *   serving_default_args_1 = 사진 오른쪽 눈 (extractEyes().rightEye, 263·362)
 *   둘 다 [1, 64, 64, 3] float32, RGB, 0~255 그대로 (/255 와 정규화는 모델 안에서 함)
 * 출력: serving_default_output_0 [1, 2] = 시선 (x, y) cm
 *
 * 순수 로직 (React/DOM 없음)
 */
import { EYE_CROP_POLICY, type Img } from './eyeCrop';

export const GAZE_INPUT_SHAPE = [1, EYE_CROP_POLICY.EYE_SIZE, EYE_CROP_POLICY.EYE_SIZE, 3] as const;

/** RGBA 또는 RGB 눈 이미지 → RGB 0~255 Float32 [H*W*3] (HWC 순서, 알파는 버림) */
export function eyeToTensorData(img: Img): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  const c = img.channels;
  for (let i = 0; i < n; i++) {
    out[i * 3] = img.data[i * c];
    out[i * 3 + 1] = img.data[i * c + 1];
    out[i * 3 + 2] = img.data[i * c + 2];
  }
  return out;
}
