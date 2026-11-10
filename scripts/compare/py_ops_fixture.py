"""
OpenCV 연산(getRotationMatrix2D, warpAffine, resize)의 정답 파일을 만든다.
얼굴 사진 없이 TS 구현(src/gaze/eyeCrop.ts)이 OpenCV와 픽셀 단위로 같은지 확인하는 용도.

실행: npm run compare:ops   (= python -I scripts/compare/py_ops_fixture.py)
결과: data/compare/ops/manifest.json + *.rgb (RGB 바이트, 행 순서)
"""
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "compare" / "ops"


def synthetic_image(h: int, w: int, seed: int) -> np.ndarray:
    """경계·그라데이션·잡음이 섞인 이미지 (보간 차이가 잘 드러나게)"""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    base = np.stack([
        127 + 120 * np.sin(xx / 7.3) * np.cos(yy / 11.1),
        (xx * 255 / max(w - 1, 1)),
        ((xx // 9 + yy // 9) % 2) * 255,
    ], axis=-1)
    noise = rng.integers(-40, 41, size=(h, w, 3))
    return np.clip(base + noise, 0, 255).astype(np.uint8)


def save(name: str, img: np.ndarray) -> dict:
    (OUT / f"{name}.rgb").write_bytes(np.ascontiguousarray(img).tobytes())
    return {"file": f"{name}.rgb", "width": int(img.shape[1]), "height": int(img.shape[0])}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"opencv": cv2.__version__, "rotation": [], "warp": [], "resize": []}

    # 1) getRotationMatrix2D
    for i, (cx, cy, ang, sc) in enumerate([
        (320.0, 240.0, 0.0, 1.0),
        (311.37, 201.5, 7.25, 0.61),
        (100.2, 400.9, -13.9, 1.73),
        (512.0, 64.0, 179.5, 0.33),
    ]):
        m = cv2.getRotationMatrix2D((cx, cy), ang, sc)
        manifest["rotation"].append({"center": [cx, cy], "angle": ang, "scale": sc, "matrix": m.tolist()})

    # 2) warpAffine → 224×224 (eye_extractor 와 같은 방식으로 만든 행렬, 일부는 가장자리 밖으로)
    src = synthetic_image(480, 640, seed=1)
    manifest["warpSrc"] = save("warp_src", src)
    for i, (cx, cy, ang, sc) in enumerate([
        (320.0, 240.0, 0.0, 1.0),
        (311.37, 201.5, 7.25, 0.61),
        (300.8, 250.3, -4.4, 0.92),
        (40.0, 30.0, 21.0, 1.4),      # 왼쪽 위 바깥이 많이 들어감
        (630.0, 470.0, -33.0, 2.2),   # 오른쪽 아래 바깥
        (333.3, 222.2, 2.0, 0.27),    # 크게 축소
    ]):
        m = cv2.getRotationMatrix2D((cx, cy), ang, sc)
        m[0, 2] += 224 / 2 - cx
        m[1, 2] += 224 / 2.5 - cy
        out = cv2.warpAffine(src, m, (224, 224))
        manifest["warp"].append({"matrix": m.tolist(), "size": 224, **save(f"warp_{i}", out)})

    # 3) resize → 64×64 (eye_extractor 의 _crop_square 와 같은 호출)
    for i, (h, w) in enumerate([(37, 37), (50, 50), (64, 64), (90, 90), (128, 128), (41, 43), (200, 200), (33, 60)]):
        s = synthetic_image(h, w, seed=10 + i)
        out = cv2.resize(s, (64, 64))
        manifest["resize"].append({"src": save(f"resize_src_{i}", s), "out": save(f"resize_out_{i}", out)})

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"OpenCV {cv2.__version__} 정답 파일 → {OUT}")


if __name__ == "__main__":
    main()
