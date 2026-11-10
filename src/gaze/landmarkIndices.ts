/**
 * Face Landmarker 랜드마크 번호 (478개 점, 홍채 포함)
 *
 * 출처: reference/eye_extractor.py — 모델 학습 때 눈을 자른 기준과 같아야 하므로
 *       숫자와 순서를 절대 바꾸지 말 것.
 *
 * 눈 "구석" 점은 어디를 보든 위치가 거의 그대로라 회전·크기 맞추기의 기준점으로 쓴다.
 * (홍채 중심은 시선 따라 움직이므로 기준점으로 쓰면 안 됨)
 */
export const LEFT_EYE_OUTER = 33;
export const LEFT_EYE_INNER = 133;
export const RIGHT_EYE_OUTER = 263;
export const RIGHT_EYE_INNER = 362;

export const EYE_CORNERS = [LEFT_EYE_OUTER, LEFT_EYE_INNER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER] as const;

/** 눈꺼풀 윤곽 — 눈 영역을 넉넉히 자를 때 쓰는 점들 */
export const LEFT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] as const;
export const RIGHT_EYE_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] as const;
