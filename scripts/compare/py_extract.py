"""
reference/eye_extractor.py 로 얼굴 사진의 눈을 잘라, TS 구현과 비교할 파일을 만든다.

실행: npm run compare:py   (= python -I scripts/compare/py_extract.py)
입력: data/compare/*.png   (/try 화면의 "사진 저장"으로 받은 원본 프레임)
출력: data/compare/out/<이름>.py.json   랜드마크(정규화 478개), tiltDeg, 크기
      data/compare/out/<이름>.rgb       입력 사진 RGB 바이트 (TS 가 PNG 를 해석하지 않아도 되게)
      data/compare/out/<이름>.{left,right,face}.rgb   파이썬 크롭 RGB 바이트
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "reference"))

import cv2  # noqa: E402
import mediapipe as mp  # noqa: E402
import numpy as np  # noqa: E402
from eye_extractor import EyeExtractor  # noqa: E402

IN_DIR = ROOT / "data" / "compare"
OUT_DIR = IN_DIR / "out"


def rgb_bytes(bgr: np.ndarray) -> bytes:
    return np.ascontiguousarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)).tobytes()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    images = sorted(IN_DIR.glob("*.png"))
    if not images:
        print(f"사진이 없어요: {IN_DIR} 에 /try 에서 저장한 PNG 를 넣어 주세요")
        sys.exit(1)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with EyeExtractor(model_asset_path=str(ROOT / "reference" / "face_landmarker.task")) as ex:
        for path in images:
            bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if bgr is None:
                print(f"{path.name}: 읽지 못함")
                continue
            h, w = bgr.shape[:2]
            # process() 안과 똑같은 입력으로 랜드마크를 한 번 더 받아 둔다 (같은 모델, IMAGE 모드)
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            det = ex._landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb))
            sample = ex.process(bgr)

            stem = path.stem
            meta = {"width": w, "height": h, "opencv": cv2.__version__, "numpy": np.__version__}
            if not det.face_landmarks or sample is None:
                meta["face"] = False
                print(f"{path.name}: 얼굴(또는 눈 크롭) 없음")
            else:
                meta["face"] = True
                meta["landmarks"] = [[lm.x, lm.y] for lm in det.face_landmarks[0]]
                meta["tiltDeg"] = sample.tilt_deg
                (OUT_DIR / f"{stem}.left.rgb").write_bytes(rgb_bytes(sample.left_eye))
                (OUT_DIR / f"{stem}.right.rgb").write_bytes(rgb_bytes(sample.right_eye))
                (OUT_DIR / f"{stem}.face.rgb").write_bytes(rgb_bytes(sample.face_normalized))
                print(f"{path.name}: 기울기 {sample.tilt_deg:.2f}°")
            (OUT_DIR / f"{stem}.rgb").write_bytes(rgb.tobytes())
            (OUT_DIR / f"{stem}.py.json").write_text(json.dumps(meta), encoding="utf-8")

    print(f"→ {OUT_DIR}  (이제 npm test)")


if __name__ == "__main__":
    main()
