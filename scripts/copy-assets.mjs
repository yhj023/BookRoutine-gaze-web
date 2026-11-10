// MediaPipe·LiteRT WASM 파일과 얼굴·시선 모델을 public/ 으로 복사한다.
// 브라우저가 외부 서버 대신 이 컴퓨터(localhost)에서 받아 가게 하려고.
// npm run dev / npm run build 전에 자동으로 실행된다.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const copies = [
  { from: 'node_modules/@mediapipe/tasks-vision/wasm', to: 'public/mediapipe/wasm' },
  { from: 'reference/face_landmarker.task', to: 'public/models/face_landmarker.task' },
  { from: 'node_modules/@litertjs/core/wasm', to: 'public/litert/wasm' },
  { from: 'reference/gaze.tflite', to: 'public/models/gaze.tflite' },
];

for (const { from, to } of copies) {
  const src = join(root, from);
  const dst = join(root, to);
  if (!existsSync(src)) {
    console.error(`[copy-assets] 원본이 없어요: ${from}`);
    process.exit(1);
  }
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log(`[copy-assets] ${from} → ${to}`);
}
