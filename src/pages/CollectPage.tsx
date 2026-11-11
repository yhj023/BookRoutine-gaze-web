/**
 * /collect — 시선 모델 미세조정용 데이터 수집 (개발용)
 *
 * 준비(참여자 ID, 화면 cm, 저장 폴더) → 전체 화면 → 4×6 격자 점 48개 → 저장 마무리 → 결과
 * 저장: <참여자>_<시각>/left/000001.png, right/000001.png, labels.csv, meta.json
 *  - 눈 크롭은 /try 와 같은 extractEyes (eye_extractor.py 와 같은 결과)
 *  - 얼굴 전체 사진은 메모리에서만 쓰고 저장하지 않음
 *  - File System Access API 로 고른 이 컴퓨터의 폴더에만 씀 (네트워크 전송 없음)
 * 시간·격자 숫자는 src/collect/collectPlan.ts 의 COLLECT_POLICY
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { useWebcam } from '../camera/useWebcam';
import { grabFrame } from '../camera/grabFrame';
import { blendshape, useFaceLandmarker } from '../gaze/useFaceLandmarker';
import { drawEyes } from '../gaze/drawEyes';
import { EYE_CROP_POLICY, extractEyes, type Img } from '../gaze/eyeCrop';
import type { Pt } from '../gaze/gazeCalibration';
import {
  COLLECT_POLICY,
  dotPosition,
  formatStamp,
  isValidParticipantId,
  labelsCsv,
  makeDotOrder,
  pxToCm,
  sampleFileName,
  saveSlot,
  screenCmFromDiagonal,
  slotsPerDot,
  type GridDot,
  type LabelRow,
} from '../collect/collectPlan';

type Phase = 'setup' | 'collecting' | 'finishing' | 'done';

type DirPicker = (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
const dirPicker = (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker;

interface Counts {
  saved: number;
  noFace: number;
  eyesClosed: number;
  cropFailed: number;
  writeFailed: number;
}

interface Session {
  folderName: string;
  dir: FileSystemDirectoryHandle;
  left: FileSystemDirectoryHandle;
  right: FileSystemDirectoryHandle;
  participantId: string;
  screenPx: { width: number; height: number };
  screenCm: { width: number; height: number };
  /** 인치로 넣었으면 그 값 (cm 는 이걸로 계산), 아니면 null */
  screenInches: number | null;
  startedAt: string;
  order: GridDot[];
  rows: LabelRow[];
  nextId: number;
  /** 파일 쓰기를 차례로 잇는 사슬 (끝날 때 모두 기다림) */
  writes: Promise<void>;
  counts: Counts;
}

/** 지금 보이는 점 */
interface DotState {
  index: number;
  pos: Pt;
  shownAt: number;
  taken: Set<number>;
}

/** 64×64 크롭 → PNG (원본 밖은 OpenCV 처럼 검정, 알파는 255) */
function imgToPng(img: Img): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('canvas 2d 없음'));
  const id = new ImageData(img.width, img.height);
  const c = img.channels;
  for (let i = 0; i < img.width * img.height; i++) {
    id.data[i * 4] = img.data[i * c];
    id.data[i * 4 + 1] = img.data[i * c + 1];
    id.data[i * 4 + 2] = img.data[i * c + 2];
    id.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 만들기 실패'))), 'image/png'),
  );
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, data: Blob | string) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/** 쓰기 실패 시 다시 시도 (백신 등이 파일을 잠깐 잡고 있을 때). 횟수·대기는 COLLECT_POLICY */
async function writeWithRetry(dir: FileSystemDirectoryHandle, name: string, data: Blob) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await writeFile(dir, name, data);
    } catch (e) {
      if (attempt >= COLLECT_POLICY.WRITE_ATTEMPTS) throw e;
      console.warn(`[collect] ${name} 쓰기 실패, 다시 시도 (${attempt}/${COLLECT_POLICY.WRITE_ATTEMPTS})`, e);
      await new Promise((r) => setTimeout(r, COLLECT_POLICY.WRITE_RETRY_MS * attempt));
    }
  }
}

const nextFrame =() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export default function CollectPage() {
  const P = COLLECT_POLICY;
  const { videoRef, status, error, size } = useWebcam();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [participantId, setParticipantId] = useState('');
  const [inches, setInches] = useState('');
  const [rootDir, setRootDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('setup');
  const phaseRef = useRef<Phase>('setup');
  const [dot, setDot] = useState<{ index: number; pos: Pt } | null>(null);
  const [savedLive, setSavedLive] = useState(0);
  const [summary, setSummary] = useState<{ folderName: string; counts: Counts; stoppedEarly: boolean; error?: string } | null>(
    null,
  );

  const sessionRef = useRef<Session | null>(null);
  const dotRef = useRef<DotState | null>(null);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const showDot = (index: number) => {
    const s = sessionRef.current;
    if (!s) return;
    const pos = dotPosition(s.order[index], s.screenPx.width, s.screenPx.height);
    dotRef.current = { index, pos, shownAt: performance.now(), taken: new Set() };
    setDot({ index, pos });
  };

  /** 수집 끝 (다 돌았거나 Esc). 남은 쓰기를 기다리고 labels.csv, meta.json 저장 */
  const finish = useCallback(async (stoppedEarly: boolean) => {
    if (phaseRef.current !== 'collecting') return;
    go('finishing');
    const s = sessionRef.current;
    const dotsShown = s && dotRef.current ? Math.min(dotRef.current.index + 1, s.order.length) : 0;
    dotRef.current = null;
    setDot(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!s) return go('setup');
    let err: string | undefined;
    try {
      await s.writes;
      const rows = [...s.rows].sort((a, b) => a.sampleId - b.sampleId);
      await writeFile(s.dir, 'labels.csv', labelsCsv(rows));
      const meta = {
        participantId: s.participantId,
        folder: s.folderName,
        screenCm: s.screenCm,
        screenInches: s.screenInches,
        screenPx: s.screenPx,
        devicePixelRatio: window.devicePixelRatio,
        screen: { width: window.screen.width, height: window.screen.height },
        camera: videoRef.current ? { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight } : null,
        startedAt: s.startedAt,
        endedAt: new Date().toISOString(),
        userAgent: navigator.userAgent,
        stoppedEarly,
        dotsShown,
        counts: s.counts,
        policy: COLLECT_POLICY,
        eyeCrop: EYE_CROP_POLICY,
        labels: {
          format: 'reference/prepare_data.py 와 같은 열',
          origin: '화면 왼쪽 위 = (0, 0) cm, x 오른쪽 +, y 아래 +',
          gaze: '점의 CSS px × (screenCm ÷ screenPx)',
          dotPosition: `${P.ROWS}행×${P.COLS}열 칸의 가운데`,
        },
      };
      await writeFile(s.dir, 'meta.json', JSON.stringify(meta, null, 2));
    } catch (e) {
      err = `마무리 저장 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
    setSummary({ folderName: s.folderName, counts: { ...s.counts }, stoppedEarly, error: err });
    sessionRef.current = null;
    go('done');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 점 넘기기: 매 화면 프레임 확인
  useEffect(() => {
    if (phase !== 'collecting') return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const d = dotRef.current;
      const s = sessionRef.current;
      if (!d || !s) return;
      if (performance.now() - d.shownAt < P.DOT_MS) return;
      if (d.index + 1 < s.order.length) showDot(d.index + 1);
      else {
        dotRef.current = { ...d, index: s.order.length };
        void finish(false);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, finish]);

  // Esc 나 전체 화면이 풀리면 멈춤 (모은 것은 저장)
  useEffect(() => {
    if (phase !== 'collecting') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void finish(true);
    const onFs = () => !document.fullscreenElement && void finish(true);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [phase, finish]);

  /** 얼굴 인식 결과가 나올 때마다: 저장 차례면 눈 크롭을 저장 */
  const onResult = useCallback(
    (result: FaceLandmarkerResult) => {
      const landmarks = result.faceLandmarks[0] ?? null;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) drawEyes(ctx, landmarks, canvas.width, canvas.height);

      if (phaseRef.current !== 'collecting') return;
      const s = sessionRef.current;
      const d = dotRef.current;
      if (!s || !d || d.index >= s.order.length) return;
      const slot = saveSlot(performance.now() - d.shownAt);
      if (slot == null || d.taken.has(slot)) return;
      d.taken.add(slot); // 이 차례는 저장하든 건너뛰든 한 번만

      if (!landmarks) {
        s.counts.noFace += 1;
        return;
      }
      const bl = blendshape(result, 'eyeBlinkLeft') ?? 0;
      const br = blendshape(result, 'eyeBlinkRight') ?? 0;
      if (bl > P.BLINK_MAX || br > P.BLINK_MAX) {
        s.counts.eyesClosed += 1;
        return;
      }
      const video = videoRef.current;
      const frame = video && grabFrame(video); // 얼굴 사진은 크롭에만 쓰고 저장하지 않음
      const eyes = frame && extractEyes(frame.img, landmarks);
      if (!eyes) {
        s.counts.cropFailed += 1;
        return;
      }

      const id = s.nextId++;
      const name = sampleFileName(id);
      const gazeCm = pxToCm(d.pos, s.screenPx, s.screenCm);
      const { leftEye, rightEye } = eyes;
      s.writes = s.writes.then(async () => {
        try {
          const [lb, rb] = await Promise.all([imgToPng(leftEye), imgToPng(rightEye)]);
          await writeWithRetry(s.left, name, lb);
          await writeWithRetry(s.right, name, rb);
          s.rows.push({ sampleId: id, gazeCm, groupId: s.participantId });
          s.counts.saved += 1;
          setSavedLive(s.counts.saved);
        } catch (e) {
          console.warn('[collect] 저장 실패 (다시 시도해도 안 됨)', id, e);
          s.counts.writeFailed += 1;
          // 짝이 안 맞거나 빈 파일이 남지 않게 이 번호의 두 파일을 지움
          await Promise.all([s.left, s.right].map((dir) => dir.removeEntry(name).catch(() => {})));
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoRef],
  );

  const face = useFaceLandmarker(videoRef, status === 'ready', onResult);
  const faceFound = face.status === 'running' && !!face.stats?.faceDetected;

  const pickFolder = async () => {
    if (!dirPicker) return;
    try {
      setRootDir(await dirPicker({ mode: 'readwrite', id: 'gaze-collect' }));
      setSetupError(null);
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setSetupError(`폴더를 열지 못했어요 (${String(e)})`);
    }
  };

  // 인치 → cm (화면 비율은 창이 있는 화면에서). 창이 노트북 화면에 있어야 맞음
  const screenPxNow = { width: window.screen.width, height: window.screen.height };
  const inchNum = Number(inches);
  const screenCm = inchNum >= 5 && inchNum < 80 ? screenCmFromDiagonal(inchNum, screenPxNow) : null;
  const idOk = isValidParticipantId(participantId);
  /** 아직 안 된 것 (버튼 아래에 보여 줌) */
  const missing = [
    !idOk && '참여자 ID',
    !screenCm && '화면 크기(인치)',
    !rootDir && '저장 폴더',
    face.status !== 'running' && '카메라·얼굴 인식 준비',
  ].filter(Boolean) as string[];
  const canStart = missing.length === 0;

  const start = async () => {
    if (!canStart || !rootDir || !screenCm) return;
    setSetupError(null);
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      setSetupError('전체 화면으로 바꾸지 못했어요. 다시 눌러 주세요.');
      return;
    }
    await nextFrame();
    const screenPx = { width: window.innerWidth, height: window.innerHeight };
    const now = new Date();
    const folderName = `${participantId}_${formatStamp(now)}`;
    try {
      const dir = await rootDir.getDirectoryHandle(folderName, { create: true });
      const left = await dir.getDirectoryHandle('left', { create: true });
      const right = await dir.getDirectoryHandle('right', { create: true });
      sessionRef.current = {
        folderName,
        dir,
        left,
        right,
        participantId,
        screenPx,
        screenCm,
        screenInches: Number(inches) > 0 ? Number(inches) : null,
        startedAt: now.toISOString(),
        order: makeDotOrder(),
        rows: [],
        nextId: 1,
        writes: Promise.resolve(),
        counts: { saved: 0, noFace: 0, eyesClosed: 0, cropFailed: 0, writeFailed: 0 },
      };
    } catch (e) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setSetupError(`저장 폴더를 만들지 못했어요 (${e instanceof Error ? e.message : String(e)})`);
      return;
    }
    setSavedLive(0);
    setSummary(null);
    go('collecting');
    showDot(0);
  };

  const total = P.ROWS * P.COLS * P.LAPS;
  const maxSamples = total * slotsPerDot();

  return (
    <main className="try">
      <header className="page-head">
        <p className="eyebrow">BookRoutine · 개발용</p>
        <h1>시선 데이터 수집</h1>
        <p className="lede">
          화면에 나오는 점을 눈으로 보면, 그때의 눈 크롭(64×64)과 점 위치(cm)를 고른 폴더에 저장해요. 얼굴 전체
          사진은 저장하지 않고, 어디로도 보내지 않아요.
        </p>
      </header>

      <div className="layout">
        <section className="card">
          <div className="stage-wrap">
            <div className="stage mirrored" style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
              <video ref={videoRef} playsInline muted />
              <canvas ref={canvasRef} width={size?.width ?? 640} height={size?.height ?? 480} />
            </div>
            <span className={`pill ${faceFound ? 'ok' : 'warn'}`}>
              {status === 'starting' && '카메라 켜는 중…'}
              {status === 'error' && '카메라 오류'}
              {status === 'ready' &&
                (face.status === 'loading' ? '얼굴 인식 준비 중…' : faceFound ? '얼굴 찾음' : '얼굴이 안 보여요')}
            </span>
          </div>
          {status === 'error' && <p className="error">{error}</p>}
          {face.status === 'error' && <p className="error">{face.error}</p>}
        </section>

        <aside className="side">
          {phase === 'done' && summary && (
            <section className="card">
              <h2>수집 결과</h2>
              <p className="calib-big">샘플 {summary.counts.saved}개 저장</p>
              <p className="hint">
                폴더 <b>{summary.folderName}</b>
                {summary.stoppedEarly && ' · 중간에 멈춤'}
                <br />
                건너뜀: 얼굴 없음 {summary.counts.noFace} · 눈 감음 {summary.counts.eyesClosed} · 크롭 실패{' '}
                {summary.counts.cropFailed} · 쓰기 실패 {summary.counts.writeFailed}
              </p>
              {summary.error && <p className="error">{summary.error}</p>}
            </section>
          )}

          <section className="card collect-form">
            <h2>준비</h2>
            {!dirPicker && <p className="error">이 브라우저는 폴더 저장을 지원하지 않아요. Chrome 이나 Edge 로 열어 주세요.</p>}
            <label>
              참여자 ID
              <input value={participantId} onChange={(e) => setParticipantId(e.target.value.trim())} placeholder="예: p01" />
            </label>
            {participantId && !idOk && <p className="error hint">영문, 숫자, -, _ 만 쓸 수 있어요.</p>}
            <label>
              화면 크기 (인치)
              <input
                type="number"
                inputMode="decimal"
                min="5"
                step="0.1"
                value={inches}
                placeholder="예: 14"
                onChange={(e) => setInches(e.target.value)}
              />
            </label>
            <p className="hint">
              노트북 사양에 적힌 인치(14, 15.6 같은 값)만 넣으면 돼요. 자는 필요 없어요.
              {screenCm
                ? ` → 가로 ${screenCm.width.toFixed(1)}cm × 세로 ${screenCm.height.toFixed(1)}cm (화면 비율 ${screenPxNow.width}×${screenPxNow.height})`
                : ''}
            </p>
            <button type="button" className="ghost wide" onClick={pickFolder} disabled={!dirPicker}>
              {rootDir ? `저장 폴더: ${rootDir.name}` : '저장 폴더 선택'}
            </button>
            <p className="hint">프로젝트 안에 저장한다면 Git에 안 올라가는 collected/ 폴더를 골라 주세요.</p>
            {setupError && <p className="error">{setupError}</p>}
            <button type="button" className="primary wide" disabled={!canStart || (phase !== 'setup' && phase !== 'done')} onClick={start}>
              {phase === 'done' ? '다시 수집 시작' : '수집 시작'}
            </button>
            {missing.length > 0 && <p className="hint error">아직 필요한 것: {missing.join(', ')}</p>}
            <p className="hint">
              점 {total}개 × {P.DOT_MS / 1000}초 (약 {Math.round((total * P.DOT_MS) / 1000)}초), 최대 {maxSamples}개. 고개는 가만히,
              눈으로만 점을 봐 주세요. Esc 를 누르면 멈추고 그때까지 모은 것을 저장해요.
            </p>
          </section>
        </aside>
      </div>

      {(phase === 'collecting' || phase === 'finishing') && (
        <div className="calib">
          {phase === 'collecting' && dot && (
            <>
              <p className="collect-progress">
                {dot.index + 1} / {total} · 저장 {savedLive} · Esc 멈춤
              </p>
              <div className="collect-dot" style={{ transform: `translate(${dot.pos.x}px, ${dot.pos.y}px)` }} />
            </>
          )}
          {phase === 'finishing' && (
            <div className="calib-panel">
              <h2>저장 마무리 중…</h2>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
