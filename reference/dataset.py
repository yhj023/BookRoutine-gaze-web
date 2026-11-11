"""
prepare_data.py로 미리 전처리해둔 (눈 crop, 정답 좌표) 쌍을 불러오는 Dataset.

주의: __getitem__마다 MediaPipe를 돌리면 학습이 아주 느려진다.
그래서 전처리(눈 crop 추출)는 prepare_data.py에서 "미리 한 번" 끝내고,
여기서는 이미 잘라둔 이미지 파일만 빠르게 읽어오는 역할만 한다.
"""

import csv
from pathlib import Path

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


class GazeEyeDataset(Dataset):
    """processed_dir/labels.csv 를 읽어서 (왼쪽눈, 오른쪽눈, 정답좌표) 텐서를 돌려준다.

    labels.csv 형식 (prepare_data.py가 만들어냄):
        sample_id,left_eye_path,right_eye_path,gaze_x_cm,gaze_y_cm
    """

    def __init__(self, processed_dir: str, normalize_label_by: float = 30.0):
        self.processed_dir = Path(processed_dir)
        self.normalize_label_by = normalize_label_by  # 좌표(cm)를 대략 -1~1 범위로 스케일링
        with open(self.processed_dir / "labels.csv", newline="") as f:
            self.rows = list(csv.DictReader(f))

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        row = self.rows[idx]
        left = self._load(row["left_eye_path"])
        right = self._load(row["right_eye_path"])
        label = np.array(
            [float(row["gaze_x_cm"]) / self.normalize_label_by,
             float(row["gaze_y_cm"]) / self.normalize_label_by],
            dtype=np.float32,
        )
        return left, right, torch.from_numpy(label)

    def _load(self, rel_path: str) -> torch.Tensor:
        img = cv2.imread(str(self.processed_dir / rel_path))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img = (img - 0.5) / 0.5  # -1~1로 정규화 (ImageNet 사전학습 가중치와 스케일 맞추는 용도)
        return torch.from_numpy(img).permute(2, 0, 1)  # HWC -> CHW
