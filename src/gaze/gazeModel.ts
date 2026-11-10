/**
 * LiteRT.js 로 reference/gaze.tflite 실행 (브라우저 전용)
 * 파일은 모두 public/ 에서 받는다 (scripts/copy-assets.mjs) — 외부 서버 요청 없음
 */
import { isWebGPUSupported, loadAndCompile, loadLiteRt, Tensor, type CompiledModel } from '@litertjs/core';
import { GAZE_INPUT_SHAPE } from './gazeInput';

const WASM_PATH = '/litert/wasm/';
const MODEL_PATH = '/models/gaze.tflite';

export type GazeAccelerator = 'webgpu' | 'wasm';

export interface GazeModel {
  accelerator: GazeAccelerator;
  /** 모델이 알려 준 입력 정보 (이름·모양·자료형) — 화면 확인용 */
  inputInfo: string;
  /** 왼눈·오른눈 RGB 0~255 [64*64*3] → 시선 (cm) */
  predict(left: Float32Array, right: Float32Array): Promise<{ x: number; y: number }>;
  close(): void;
}

let liteRtLoading: Promise<unknown> | null = null;
function ensureLiteRt() {
  liteRtLoading ??= loadLiteRt(WASM_PATH);
  return liteRtLoading;
}

/**
 * 입력 순서를 이름으로 맞춘다: args_0 = 왼눈, args_1 = 오른눈.
 * 위치(index)를 믿지 않고 이름을 봐서, 변환기가 순서를 바꿔도 안전하게.
 */
function inputOrder(model: CompiledModel): ('left' | 'right')[] {
  const order = model.getInputDetails().map((d) => {
    if (/args_0$/.test(d.name)) return 'left' as const;
    if (/args_1$/.test(d.name)) return 'right' as const;
    throw new Error(`모르는 입력 이름: ${d.name}`);
  });
  if (order.length !== 2 || order[0] === order[1]) throw new Error(`입력이 이상해요: ${order.join(',')}`);
  return order;
}

export async function loadGazeModel(accelerator: GazeAccelerator): Promise<GazeModel> {
  if (accelerator === 'webgpu' && !isWebGPUSupported()) throw new Error('이 브라우저는 WebGPU를 지원하지 않아요');
  await ensureLiteRt();
  const model = await loadAndCompile(MODEL_PATH, { accelerator });
  const order = inputOrder(model);
  const inputInfo = model
    .getInputDetails()
    .map((d) => `${d.name} [${Array.from(d.shape).join(',')}] ${d.dtype}`)
    .join(' · ');

  return {
    accelerator,
    inputInfo,
    async predict(left, right) {
      const created: Tensor[] = [];
      try {
        const inputs: Tensor[] = [];
        for (const which of order) {
          const t = new Tensor(which === 'left' ? left : right, [...GAZE_INPUT_SHAPE]);
          created.push(t);
          if (accelerator === 'webgpu') {
            const g = await t.moveTo('webgpu');
            created.push(g);
            inputs.push(g);
          } else {
            inputs.push(t);
          }
        }
        const outs = await model.run(inputs);
        created.push(...outs);
        const out = outs[0].accelerator === 'wasm' ? outs[0] : await outs[0].moveTo('wasm');
        if (out !== outs[0]) created.push(out);
        const xy = out.toTypedArray();
        return { x: Number(xy[0]), y: Number(xy[1]) };
      } finally {
        for (const t of created) {
          try {
            t.delete();
          } catch {
            // moveTo 로 옮겨진 원본은 이미 지워졌을 수 있음
          }
        }
      }
    },
    close() {
      model.delete();
    },
  };
}

/**
 * 앱에서 쓰는 장치: CPU(wasm).
 * 같은 크롭으로 파이썬과 비교했을 때 CPU는 차이 0, WebGPU(기본 fp16)는 0.14~0.74 cm 차이가 났다.
 * 노트북 전시용이라 정확히 같은 CPU로 정함 (2026-11-10). GPU는 비교 패널에서만 참고용으로 돌린다.
 */
export function loadGazeModelAuto(): Promise<GazeModel> {
  return loadGazeModel('wasm');
}
