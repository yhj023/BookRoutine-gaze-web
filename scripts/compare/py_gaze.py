"""
파이썬이 자른 눈 크롭(1단계 결과)을 reference/gaze.tflite 에 넣어 시선 값을 만든다.
웹(LiteRT.js)이 같은 크롭으로 낸 값과 비교하려는 것.

실행: npm run compare:gaze   (= python -I scripts/compare/py_gaze.py)
먼저: npm run compare:py  (data/compare/out/<이름>.left.rgb / .right.rgb 가 있어야 함)
출력: data/compare/out/<이름>.py.gaze.json
      { gaze: [x, y], gazeSwapped: [x, y] (왼·오 바꿔 넣은 값), inputs: [...], outputs: [...] }
"""
import json
import sys
from pathlib import Path

import numpy as np
from ai_edge_litert.interpreter import Interpreter

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "compare" / "out"
MODEL = ROOT / "reference" / "gaze.tflite"
EYE = 64


def load_eye(path: Path) -> np.ndarray:
    """RGB 바이트 → [1, 64, 64, 3] float32, 0~255 그대로 (모델이 안에서 /255)"""
    a = np.frombuffer(path.read_bytes(), dtype=np.uint8)
    return a.reshape(1, EYE, EYE, 3).astype(np.float32)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    lefts = sorted(OUT_DIR.glob("*.left.rgb"))
    if not lefts:
        print(f"크롭이 없어요: 먼저 npm run compare:py ({OUT_DIR})")
        sys.exit(1)

    it = Interpreter(model_path=str(MODEL))
    it.allocate_tensors()
    ins = it.get_input_details()
    outs = it.get_output_details()
    info_in = [{"name": d["name"], "shape": d["shape"].tolist(), "dtype": d["dtype"].__name__} for d in ins]
    info_out = [{"name": d["name"], "shape": d["shape"].tolist(), "dtype": d["dtype"].__name__} for d in outs]
    print("입력:", info_in)
    print("출력:", info_out)

    # 이름으로 왼/오 입력 찾기 (args_0 = 사진 왼쪽 눈)
    idx = {}
    for d in ins:
        if d["name"].endswith("args_0"):
            idx["left"] = d["index"]
        elif d["name"].endswith("args_1"):
            idx["right"] = d["index"]
    if set(idx) != {"left", "right"}:
        print("입력 이름이 예상과 달라요:", [d["name"] for d in ins])
        sys.exit(1)

    def run(left: np.ndarray, right: np.ndarray) -> list[float]:
        it.set_tensor(idx["left"], left)
        it.set_tensor(idx["right"], right)
        it.invoke()
        return it.get_tensor(outs[0]["index"]).reshape(-1).astype(float).tolist()

    for lp in lefts:
        stem = lp.name[: -len(".left.rgb")]
        rp = OUT_DIR / f"{stem}.right.rgb"
        if not rp.exists():
            continue
        L, R = load_eye(lp), load_eye(rp)
        g = run(L, R)
        gs = run(R, L)
        (OUT_DIR / f"{stem}.py.gaze.json").write_text(
            json.dumps({"gaze": g, "gazeSwapped": gs, "inputs": info_in, "outputs": info_out}), encoding="utf-8"
        )
        print(f"{stem}: 시선 x {g[0]:.3f} cm, y {g[1]:.3f} cm  (왼·오 바꾸면 {gs[0]:.3f}, {gs[1]:.3f})")

    print(f"→ {OUT_DIR}  (이제 /try 의 '비교 실행' → gaze-compare.json → data/compare/ → npm test)")


if __name__ == "__main__":
    main()
