/**
 * 개발용: 파이썬이 자른 눈 크롭을 웹 LiteRT.js(GPU·CPU)로 돌려 파이썬 결과와 비교한다.
 * 파일은 개발 서버(/__compare, vite.config.ts)에서 받는다 — 이 컴퓨터 밖으로 나가지 않음.
 */
import { useState } from 'react';
import { downloadBlob } from '../camera/grabFrame';
import { EYE_CROP_POLICY } from '../gaze/eyeCrop';
import { eyeToTensorData } from '../gaze/gazeInput';
import { loadGazeModel, type GazeAccelerator } from '../gaze/gazeModel';

type XY = [number, number];
interface Row {
  stem: string;
  accelerator: GazeAccelerator;
  gaze: XY;
  gazeSwapped: XY;
  py: XY | null;
}

const S = EYE_CROP_POLICY.EYE_SIZE;

async function fetchEye(name: string): Promise<Float32Array> {
  const r = await fetch(`/__compare/file/${name}`);
  if (!r.ok) throw new Error(`${name} 없음`);
  const data = new Uint8Array(await r.arrayBuffer());
  if (data.length !== S * S * 3) throw new Error(`${name} 크기가 이상해요 (${data.length})`);
  return eyeToTensorData({ width: S, height: S, channels: 3, data });
}

async function fetchPy(stem: string): Promise<XY | null> {
  const r = await fetch(`/__compare/file/${stem}.py.gaze.json`);
  if (!r.ok) return null;
  const j = (await r.json()) as { gaze: XY };
  return j.gaze;
}

const f3 = (v: number) => v.toFixed(3);
const diff = (a: XY, b: XY) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

export default function GazeComparePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setMsg('비교하는 중…');
    setRows([]);
    const out: Row[] = [];
    const notes: string[] = [];
    try {
      const stems = (await (await fetch('/__compare/list')).json()) as string[];
      if (stems.length === 0) throw new Error('크롭이 없어요. 먼저 npm run compare:py 와 compare:gaze');
      for (const accelerator of ['webgpu', 'wasm'] as const) {
        let model;
        try {
          model = await loadGazeModel(accelerator);
        } catch (e) {
          notes.push(`${accelerator} 못 씀: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }
        try {
          for (const stem of stems) {
            const L = await fetchEye(`${stem}.left.rgb`);
            const R = await fetchEye(`${stem}.right.rgb`);
            const g = await model.predict(L, R);
            const gs = await model.predict(R, L);
            out.push({ stem, accelerator, gaze: [g.x, g.y], gazeSwapped: [gs.x, gs.y], py: await fetchPy(stem) });
          }
        } finally {
          model.close();
        }
      }
      setRows(out);
      if (out.length > 0) {
        downloadBlob(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }), 'gaze-compare.json');
        notes.push('gaze-compare.json 을 내려받았어요 → data/compare/ 로 옮긴 뒤 npm test');
      }
      setMsg(notes.join(' · ') || null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="debug compare">
      <p>
        <strong>개발용 · 시선 모델 비교</strong> (파이썬 크롭 → 웹 GPU/CPU, 단위 cm){' '}
        <button type="button" onClick={run} disabled={running}>
          비교 실행
        </button>
      </p>
      {msg && <p className="hint">{msg}</p>}
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>사진</th>
              <th>장치</th>
              <th>웹 x, y</th>
              <th>파이썬 x, y</th>
              <th>최대 차이</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.stem}-${r.accelerator}`}>
                <td>{r.stem.slice(-13)}</td>
                <td>{r.accelerator === 'webgpu' ? 'GPU' : 'CPU'}</td>
                <td>
                  {f3(r.gaze[0])}, {f3(r.gaze[1])}
                </td>
                <td>{r.py ? `${f3(r.py[0])}, ${f3(r.py[1])}` : '–'}</td>
                <td>{r.py ? f3(diff(r.gaze, r.py)) : '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
