"""
MediaPipe Face Landmarker(Tasks API)로 얼굴 랜드마크를 찾고,
1) 두 눈을 잇는 선이 수평이 되도록 회전
2) 눈 사이 거리를 기준으로 크기를 통일
3) 좌/우 눈 영역을 고정 크기로 잘라내는(crop) 모듈.

주의: mediapipe 최신 버전은 예전 mp.solutions.face_mesh(레거시 API)를 지원하지
않고, 아래처럼 Tasks API(mp.tasks.vision.FaceLandmarker)를 쓴다. 최초 1회
모델 파일(.task)을 받아둬야 동작한다 — 자세한 건 README.md 참고.

CNN 학습에 들어가기 "전" 단계 — 여기서는 이미지를 준비만 하고,
실제 모델 학습(train.py)은 다음 단계에서 만든다.
"""

from dataclasses import dataclass
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.core.base_options import BaseOptions

# MediaPipe Face Mesh의 랜드마크 인덱스 (refine_landmarks=True 기준, 478개 점)
# 눈 "구석" 점 — 정면을 보든 옆을 보든 위치가 거의 고정이라
# 회전/크기 정규화의 기준점으로 쓰기 좋다. (홍채 중심은 시선에 따라 움직이므로 기준점으로 쓰면 안 됨)
LEFT_EYE_OUTER, LEFT_EYE_INNER = 33, 133
RIGHT_EYE_OUTER, RIGHT_EYE_INNER = 263, 362

# 눈 영역을 넉넉히 잘라내기 위한 눈 주변 랜드마크(눈꺼풀 윤곽)
LEFT_EYE_RING = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
RIGHT_EYE_RING = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]


@dataclass
class GazeSample:
    """전처리 결과 한 건 — CNN에 바로 넣을 수 있는 형태."""
    left_eye: np.ndarray   # (eye_size, eye_size, 3), 0~255 uint8
    right_eye: np.ndarray  # (eye_size, eye_size, 3), 0~255 uint8
    face_normalized: np.ndarray  # 정규화된 얼굴 전체 이미지 (디버깅/시각화용)
    tilt_deg: float        # 계산된 기울기 각도 (참고용 로그)


class EyeExtractor:
    """이미지 한 장을 넣으면 정규화된 눈 crop 두 장을 돌려주는 전처리기.

    MediaPipe는 여기서 학습되지 않는다 — 이미 완성된 얼굴 검출 도구를
    "가져다 쓰는" 것뿐이고, 우리가 나중에 학습시킬 건 이 결과물(눈 crop)을
    입력으로 받는 CNN 쪽이다.
    """

    def __init__(
        self,
        model_asset_path: str = "models/assets/face_landmarker.task",
        face_size: int = 224,
        eye_size: int = 64,
        eye_box_scale: float = 1.8,
    ):
        self.face_size = face_size
        self.eye_size = eye_size
        self.eye_box_scale = eye_box_scale  # 눈 주변을 얼마나 넉넉히 자를지

        if not Path(model_asset_path).exists():
            raise FileNotFoundError(
                f"모델 파일이 없어: {model_asset_path}\n"
                "아래 명령으로 최초 1회 받아두면 돼 (README.md 참고):\n"
                "  mkdir -p models/assets && curl -L -o models/assets/face_landmarker.task \\\n"
                "    https://storage.googleapis.com/mediapipe-models/face_landmarker/"
                "face_landmarker/float16/1/face_landmarker.task"
            )
        options = mp_vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_asset_path),
            running_mode=mp_vision.RunningMode.IMAGE,
            num_faces=1,
            # 이 모델은 (예전 refine_landmarks=True 옵션 없이도) 홍채 포함 478개 랜드마크를 기본 제공
        )
        self._landmarker = mp_vision.FaceLandmarker.create_from_options(options)

    def close(self):
        self._landmarker.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    # ------------------------------------------------------------------
    def process(self, image_bgr: np.ndarray) -> GazeSample | None:
        """얼굴이 검출되지 않으면 None을 반환한다 (호출부에서 그 샘플은 건너뛰면 됨)."""
        h, w = image_bgr.shape[:2]
        rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect(mp_image)
        if not result.face_landmarks:
            return None

        landmarks = result.face_landmarks[0]  # 첫 번째 얼굴의 랜드마크 리스트
        pts = np.array([(lm.x * w, lm.y * h) for lm in landmarks], dtype=np.float32)

        left_center = (pts[LEFT_EYE_OUTER] + pts[LEFT_EYE_INNER]) / 2
        right_center = (pts[RIGHT_EYE_OUTER] + pts[RIGHT_EYE_INNER]) / 2

        # 1) 두 눈을 잇는 선의 기울기 계산
        dx, dy = right_center - left_center
        tilt_deg = float(np.degrees(np.arctan2(dy, dx)))
        eye_dist = float(np.hypot(dx, dy))
        if eye_dist < 1e-3:
            return None

        # 2) 회전 + 크기 정규화 행렬 계산 (눈 중점을 기준점으로 사용)
        eye_mid = (left_center + right_center) / 2
        target_eye_dist = self.face_size * 0.35  # 정규화된 얼굴에서 눈 사이 거리를 이 값으로 고정
        scale = target_eye_dist / eye_dist
        rot_mat = cv2.getRotationMatrix2D(tuple(eye_mid), tilt_deg, scale)
        # 회전 후 눈 중점이 정규화 이미지의 정중앙에 오도록 평행이동 보정
        rot_mat[0, 2] += self.face_size / 2 - eye_mid[0]
        rot_mat[1, 2] += self.face_size / 2.5 - eye_mid[1]

        face_norm = cv2.warpAffine(image_bgr, rot_mat, (self.face_size, self.face_size))

        # 3) 원본 좌표를 같은 행렬로 변환해서, 정규화된 이미지 위에서 눈 위치를 다시 계산
        def transform(points):
            ones = np.ones((points.shape[0], 1))
            homo = np.hstack([points, ones])
            return (rot_mat @ homo.T).T

        left_ring_norm = transform(pts[LEFT_EYE_RING])
        right_ring_norm = transform(pts[RIGHT_EYE_RING])

        left_eye = self._crop_square(face_norm, left_ring_norm)
        right_eye = self._crop_square(face_norm, right_ring_norm)
        if left_eye is None or right_eye is None:
            return None

        return GazeSample(left_eye=left_eye, right_eye=right_eye, face_normalized=face_norm, tilt_deg=tilt_deg)

    # ------------------------------------------------------------------
    def _crop_square(self, image: np.ndarray, ring_points: np.ndarray) -> np.ndarray | None:
        cx, cy = ring_points.mean(axis=0)
        half = max(np.ptp(ring_points[:, 0]), np.ptp(ring_points[:, 1])) / 2 * self.eye_box_scale
        x1, y1 = int(cx - half), int(cy - half)
        x2, y2 = int(cx + half), int(cy + half)
        h, w = image.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 - x1 < 4 or y2 - y1 < 4:
            return None
        crop = image[y1:y2, x1:x2]
        return cv2.resize(crop, (self.eye_size, self.eye_size))
