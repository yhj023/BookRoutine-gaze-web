/**
 * 전자책 읽기 체험 (보정 뒤, 전체 화면 위에 덮어 씀)
 *
 *  흐름: 두 점 위치 맞추기 → 1쪽 → 2쪽 → … (자동 넘김) → 읽기 결과 카드
 *  - 글은 ebookText.ts 의 유명한 글 5편 중 하나. 들어올 때와 [다시 읽기] 때마다 다음 글 (종류가 번갈아 나옴)
 *  - 쪽을 열면(위치 맞추기 뒤 포함) 박스는 첫 줄에서 시작 (lineTracker.start). 세로 평활화도 처음부터
 *
 *  - 글을 단어 span 으로 나누고 화면 위치(getBoundingClientRect)를 기억. 쪽이나 창 크기가 바뀌면 다시 잼
 *  - 보정된 시선(fittedMap) → 부드럽게(가로 1.5초·세로 2.5초 중앙값 + 떨림 무시) → 줄 따라가기(createLineTracker: 붙어 있기 + 읽는 순서
 *    + 줄 끝 돌아오기) 또는 L: 가장 가까운 단어(DWELL_MS 머물면 이동)
 *  - 쪽 넘김: 마지막 줄에서 줄 끝 돌아오기가 나오면 (쪽을 연 뒤 PAGE_MIN_MS 지나서) 다음 쪽. ← → 키로도 넘김
 *  - 1초 동안 계속 글 영역(보정 오차만큼 넓힘) 밖이면 박스를 그 자리에서 흐리게 하고 "글 밖을 보고 있어요"
 *  - 읽은 시간은 자리 비움·눈 감음이면 멈춤. 딴짓·자리 비움이 1초 넘으면 글이 흐려지고 읽던 줄에 책갈피,
 *    다시 집중하면 "여기부터 이어 읽어요" (src/reading/readingSession.ts, SESSION_POLICY)
 *  - 다 읽으면 결과 카드: 읽은 시간, 집중 비율, 딴짓 횟수, 분당 글자 수, 줄마다 머문 시간 막대
 *  - 시작할 때 두 점 위치 맞추기: 첫 단어를 보고 스페이스 → 마지막 단어를 보고 스페이스.
 *    각각 최근 1초 시선 중앙값으로 가로 이동 + 세로 배율·이동을 계산 (alignTwoPoint, R 다시 맞추기).
 *    세로 배율은 화면 아래를 볼 때 시선 값이 위로 눌리는 것을 펴 줌
 *  - 단축키 L 단어↔줄, G 시선 점, Q 2×2 구역(예비), ← → 쪽
 * 좌표는 전체 화면 viewport 기준 CSS px (보정과 같은 기준). 전체 화면이 아니거나 크기가 다르면 경고.
 * 크기 비교는 보정 화면처럼 이 화면 자신의 크기(getBoundingClientRect)로 함 —
 * window.innerWidth 는 아래 준비 화면의 스크롤 막대까지 포함해서 보정 값과 약 12px 달랐음
 * 시선 처리 계산은 src/reading/readingGaze.ts (READING_POLICY)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CALIBRATION_POLICY, type GazeCalibration, type Pt } from '../gaze/gazeCalibration';
import type { JudgeResult } from '../gaze/focusJudge';
import type { SampleHub } from '../gaze/gazeSample';
import { DETAIL_LABEL, FOCUS_LABEL } from '../gaze/focusLabels';
import {
  NO_CORRECTION,
  alignTwoPoint,
  applyCorrection,
  contains,
  createDwell,
  createLineTracker,
  createOutsideHold,
  createReadingSmoother,
  createRecent,
  groupLines,
  inflate,
  nearestRect,
  quadrantOf,
  recentMedian,
  textAreaMargin,
  unionRect,
  type GazeCorrection,
  type Rect,
} from '../reading/readingGaze';
import {
  SESSION_POLICY,
  createReadingSession,
  formatMs,
  longestLine,
  type LineRef,
  type SessionSummary,
} from '../reading/readingSession';
import { EBOOKS, bookChars, nextBookIndex, splitPage } from './ebookText';

type Mode = 'word' | 'line';

interface Layout {
  words: Rect[];
  lineOf: number[];
  lines: Rect[];
  area: Rect | null;
}

interface Props {
  hub: SampleHub;
  cal: GazeCalibration;
  focus: JudgeResult | null;
  onExit: () => void;
}

const rectCenter = (r: Rect): Pt => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
/** 화면 크기가 보정 때와 이만큼(px) 넘게 다르면 경고 */
const SIZE_TOLERANCE_PX = 2;
const cm = (px: number) => {
  const v = px * CALIBRATION_POLICY.CM_PER_PX;
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
};

export default function ReadingScene({ hub, cal, focus, onExit }: Props) {
  // 글과 쪽
  const [bookIdx, setBookIdx] = useState(() => nextBookIndex());
  const book = EBOOKS[bookIdx];
  const bookRef = useRef(book);
  bookRef.current = book;
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const pageStartRef = useRef(performance.now());
  const tokens = useMemo(() => splitPage(book.pages[page].text), [book, page]);
  const words = useMemo(() => tokens.map((t) => t.w), [tokens]);
  /** 쪽마다 줄 글자 (결과 카드의 줄 막대에 씀) */
  const pageLinesRef = useRef<string[][]>([]);

  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const layoutRef = useRef<Layout>({ words: [], lineOf: [], lines: [], area: null });
  const [layout, setLayout] = useState<Layout>(layoutRef.current);

  // 시선 오차(약 4.7cm)가 단어 폭(약 3cm)보다 커서 줄 강조로 시작
  const [mode, setMode] = useState<Mode>('line');
  const modeRef = useRef<Mode>('line');
  const [showDot, setShowDot] = useState(false);
  const [quadMode, setQuadMode] = useState(false);
  const quadRef = useRef(false);

  const [gazePt, setGazePt] = useState<Pt | null>(null);
  /** 강조 중인 단어(또는 줄, 칸) 번호. null = 숨김 */
  const [shown, setShown] = useState<number | null>(null);
  /** 강조 박스가 있는 줄 (읽기 기록용) */
  const currentLineRef = useRef<number | null>(null);
  const trackerRef = useRef(createLineTracker());
  const [outside, setOutside] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ w: 0, h: 0, fs: document.fullscreenElement != null });
  const viewRef = useRef(view);

  /** 위치 맞추기 단계: 0 첫 단어, 1 마지막 단어, null 끝 (처음엔 맞추기부터) */
  const [alignStep, setAlignStep] = useState<0 | 1 | null>(0);
  const alignStepRef = useRef<0 | 1 | null>(0);
  const aligning = alignStep != null;
  /** 첫 단어를 볼 때의 시선 중앙값 */
  const firstMedianRef = useRef<Pt | null>(null);
  const [alignMsg, setAlignMsg] = useState<string | null>(null);
  /** 보정 결과에 더할 위치 맞춤 (가로 이동, 세로 배율·이동) */
  const [corr, setCorr] = useState<GazeCorrection>(NO_CORRECTION);
  const corrRef = useRef<GazeCorrection>(NO_CORRECTION);
  /** 위치 맞추기용 최근 시선 (보정 결과, 이동 전) */
  const recentRef = useRef(createRecent());

  // 읽기 기록 (시간, 집중, 딴짓, 줄마다 머문 시간)
  const sessionRef = useRef(createReadingSession());
  const [activeMs, setActiveMs] = useState(0);
  const [paused, setPaused] = useState(false);
  const [distracted, setDistracted] = useState(false);
  /** 딴짓을 시작할 때 읽던 줄 */
  const [bookmark, setBookmark] = useState<LineRef | null>(null);
  const bookmarkRef = useRef<LineRef | null>(null);
  /** "여기부터 이어 읽어요" 를 보여 줄 줄 */
  const [resumeAt, setResumeAt] = useState<LineRef | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const finishedRef = useRef(false);

  const setBookmarkBoth = (b: LineRef | null) => {
    bookmarkRef.current = b;
    setBookmark(b);
  };

  /** 쪽 바꾸기. 마지막 쪽 다음이면 결과 카드 */
  const turnPageRef = useRef((delta: number) => {
    if (finishedRef.current) return;
    const next = pageRef.current + delta;
    if (next < 0) return;
    if (next >= bookRef.current.pages.length) {
      finishedRef.current = true;
      setSummary(sessionRef.current.summary(bookChars(bookRef.current)));
      return;
    }
    pageRef.current = next;
    setPage(next);
    pageStartRef.current = performance.now();
    // 새 쪽은 첫 줄부터 (세로 값이 아직 앞 쪽 아래를 가리켜도 잠깐 붙잡아 둠)
    trackerRef.current.start(0);
    currentLineRef.current = 0;
    setShown(0);
    setBookmarkBoth(null);
    setResumeAt(null);
  });

  const restart = () => {
    sessionRef.current = createReadingSession();
    finishedRef.current = false;
    setSummary(null);
    setActiveMs(0);
    setPaused(false);
    setDistracted(false);
    // 다음 글로 바꿈 (turnPage 가 bookRef 를 보므로 바로 맞춰 둠)
    const nb = nextBookIndex();
    bookRef.current = EBOOKS[nb];
    setBookIdx(nb);
    pageLinesRef.current = [];
    pageRef.current = 1; // turnPage(-1) 로 0쪽 + 정리
    turnPageRef.current(-1);
  };

  // 단어 위치 재기 (처음, 쪽이 바뀔 때, 글꼴이 다 불러와졌을 때, 창 크기가 바뀔 때)
  useLayoutEffect(() => {
    const measure = () => {
      const ws = spanRefs.current
        .slice(0, words.length)
        .filter((el): el is HTMLSpanElement => el != null)
        .map((el) => toRect(el.getBoundingClientRect()));
      const { lineOf, lines } = groupLines(ws);
      layoutRef.current = { words: ws, lineOf, lines, area: unionRect(ws) };
      setLayout(layoutRef.current);
      const texts: string[] = lines.map(() => '');
      lineOf.forEach((l, i) => (texts[l] = texts[l] ? `${texts[l]} ${words[i]}` : words[i]));
      pageLinesRef.current[pageRef.current] = texts;
      const r = rootRef.current?.getBoundingClientRect();
      viewRef.current = {
        w: r?.width ?? window.innerWidth,
        h: r?.height ?? window.innerHeight,
        fs: document.fullscreenElement != null,
      };
      setView(viewRef.current);
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', measure);
    };
  }, [words]);

  // 단축키 (한글 입력 상태에서도 되게 e.code 사용)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        const step = alignStepRef.current;
        if (step == null) return;
        e.preventDefault();
        const ws = layoutRef.current.words;
        if (ws.length < 2) return;
        const m = recentMedian(recentRef.current.points(performance.now()));
        if (!m) {
          setAlignMsg('시선 값이 모자라요. 얼굴이 카메라에 보이게 하고 다시 눌러 주세요.');
          return;
        }
        if (step === 0) {
          firstMedianRef.current = m;
          alignStepRef.current = 1;
          setAlignStep(1);
          setAlignMsg(null);
          return;
        }
        const c = alignTwoPoint(rectCenter(ws[0]), firstMedianRef.current!, rectCenter(ws[ws.length - 1]), m);
        if (!c) {
          setAlignMsg('마지막 단어의 시선이 첫 단어보다 위로 나왔어요. 마지막 단어를 보고 다시 눌러 주세요.');
          return;
        }
        corrRef.current = c;
        setCorr(c);
        alignStepRef.current = null;
        setAlignStep(null);
        setAlignMsg(null);
        // 맞춘 뒤에는 첫 줄부터
        trackerRef.current.start(0);
        currentLineRef.current = 0;
        setShown(0);
        pageStartRef.current = performance.now();
        sessionRef.current.skipGap();
        return;
      }
      if (finishedRef.current) return;
      if (e.code === 'KeyR') {
        alignStepRef.current = 0;
        setAlignStep(0);
        firstMedianRef.current = null;
        setAlignMsg(null);
      } else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        if (alignStepRef.current != null) return;
        turnPageRef.current(e.code === 'ArrowRight' ? 1 : -1);
      } else if (e.code === 'KeyL') {
        modeRef.current = modeRef.current === 'word' ? 'line' : 'word';
        setMode(modeRef.current);
      } else if (e.code === 'KeyG') setShowDot((v) => !v);
      else if (e.code === 'KeyQ') {
        quadRef.current = !quadRef.current;
        setQuadMode(quadRef.current);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 시선 샘플 → 평활화 → 강조 대상 (+ 쪽 끝이면 다음 쪽)
  useEffect(() => {
    const map = cal.fittedMap;
    if (!map) return;
    const smoother = createReadingSmoother();
    const dwell = createDwell();
    const lineTracker = trackerRef.current;
    const outsideHold = createOutsideHold();
    const margin = textAreaMargin(cal.errorPx);
    const recent = recentRef.current;
    recent.reset();
    let lastKind = '';
    let lastCorr = corrRef.current;
    let lastPage = pageRef.current;
    return hub.subscribe((s) => {
      // 보기 방식이나 쪽이 바뀌면 머무름을 처음부터 (번호의 뜻이 달라지므로)
      const kind = alignStepRef.current != null ? 'align' : quadRef.current ? 'quad' : modeRef.current;
      if (kind !== lastKind || pageRef.current !== lastPage) {
        dwell.reset();
        // 보기 방식이 바뀌면: 위치 맞추기 뒤는 첫 줄, 그 밖(L·Q)은 지금 줄에서 다시
        if (kind !== lastKind && kind !== 'align') {
          lineTracker.start(lastKind === 'align' ? 0 : (currentLineRef.current ?? 0));
        }
        // 쪽이 바뀌면 세로 평활화도 처음부터 (앞 쪽 마지막 줄 위치에서 미끄러져 오지 않게)
        if (pageRef.current !== lastPage) smoother.reset();
        outsideHold.reset();
        lastKind = kind;
        lastPage = pageRef.current;
      }
      // 위치를 새로 맞췄으면 평활화도 처음부터 (옛 위치에서 미끄러져 오지 않게)
      if (corrRef.current !== lastCorr) {
        smoother.reset();
        lastCorr = corrRef.current;
      }
      if (!s.faceDetected || !s.gaze) return; // 얼굴을 놓치면 마지막 상태 유지 (판정 칩이 자리 비움을 알려 줌)
      const raw = map(s.gaze);
      recent.push(s.timestamp, raw);
      const p = smoother.push(s.timestamp, applyCorrection(corrRef.current, raw));
      setGazePt(p);

      if (kind === 'align' || finishedRef.current) {
        setOutside(false);
        if (kind === 'align') setShown(null);
        return;
      }
      if (kind === 'quad') {
        setOutside(false);
        currentLineRef.current = null;
        setShown(dwell.push(s.timestamp, quadrantOf(p, viewRef.current.w, viewRef.current.h)));
        return;
      }
      const L = layoutRef.current;
      const inArea = L.area != null && contains(inflate(L.area, margin), p);
      const out = outsideHold.push(s.timestamp, inArea);
      setOutside(out);
      // 글 밖이면 박스는 그 자리에 둠 (1초 넘게 밖이면 흐리게만 해서 깜빡이지 않게)
      if (!inArea) return;
      // 줄 따라가기는 단어 모드에서도 돌림 (쪽 끝 신호를 쓰려고)
      const line = lineTracker.push(s.timestamp, p, L.lines);
      if (kind === 'line') {
        setShown(line);
        currentLineRef.current = line;
      } else {
        const id = nearestRect(p, L.words);
        const w = dwell.push(s.timestamp, id < 0 ? null : id);
        setShown(w);
        currentLineRef.current = w == null ? null : (L.lineOf[w] ?? null);
      }
      if (lineTracker.takePageEnd() && performance.now() - pageStartRef.current >= SESSION_POLICY.PAGE_MIN_MS) {
        turnPageRef.current(1);
      }
    });
  }, [hub, cal]);

  // 집중 판정(1초에 4번) → 읽기 기록, 책갈피
  useEffect(() => {
    if (!focus || focus.phase !== 'tracking' || alignStepRef.current != null || finishedRef.current) return;
    const sess = sessionRef.current;
    const line = currentLineRef.current;
    const st = sess.push(performance.now(), focus, line == null ? null : { page: pageRef.current, line });
    setActiveMs(sess.activeMs);
    setPaused(st.paused);
    setDistracted(st.distracted);
    if (st.distracted && !bookmarkRef.current) setBookmarkBoth({ page: pageRef.current, line: line ?? 0 });
    if (st.resumed && bookmarkRef.current) {
      const b = bookmarkRef.current;
      if (b.page === pageRef.current) {
        trackerRef.current.jump(b.line);
        currentLineRef.current = b.line;
        if (modeRef.current === 'line' && !quadRef.current) setShown(b.line);
        setResumeAt(b);
      }
      setBookmarkBoth(null);
    }
  }, [focus]);

  // "여기부터 이어 읽어요" 는 잠깐만
  useEffect(() => {
    if (!resumeAt) return;
    const id = window.setTimeout(() => setResumeAt(null), SESSION_POLICY.RESUME_TOAST_MS);
    return () => window.clearTimeout(id);
  }, [resumeAt]);

  const sizeOk =
    Math.abs(view.w - cal.screen.width) <= SIZE_TOLERANCE_PX && Math.abs(view.h - cal.screen.height) <= SIZE_TOLERANCE_PX;

  // 강조 박스 위치
  let box: Rect | null = null;
  const target = alignStep == null ? null : alignStep === 0 ? layout.words[0] : layout.words[layout.words.length - 1];
  if (!aligning && !quadMode && !summary && shown != null) box = (mode === 'line' ? layout.lines : layout.words)[shown] ?? null;
  const pad = mode === 'line' ? 10 : 6;
  const markRect = !quadMode && bookmark && bookmark.page === page ? layout.lines[bookmark.line] : undefined;
  const resumeRect = !quadMode && resumeAt && resumeAt.page === page ? layout.lines[resumeAt.line] : undefined;
  const away = distracted && !aligning && !summary;

  return (
    <div className="ebook" ref={rootRef}>
      {(!view.fs || !sizeOk) && (
        <p className="ebook-warn">
          {!view.fs ? '전체 화면이 아니에요.' : '화면 크기가 보정할 때와 달라요.'} 시선 위치가 어긋날 수 있어요. 처음 화면에서 다시
          시작해 주세요.
        </p>
      )}

      {focus && !summary && (
        <p className={`focus-chip ebook-chip ${focus.phase === 'calibrating' ? 'calibrating' : focus.state}`}>
          {focus.phase === 'calibrating' ? '기준 잡는 중' : FOCUS_LABEL[focus.state]}
          {focus.phase === 'tracking' && focus.state === 'unfocused' && focus.detail && (
            <small> · {DETAIL_LABEL[focus.detail]}</small>
          )}
        </p>
      )}

      {/* 2×2 구역 때도 글은 자리를 지키게 숨기기만 함 (단어 위치가 그대로 유지되도록) */}
      <article key={page} className={`ebook-page${quadMode || summary ? ' hidden' : ''}${away ? ' away' : ''}`}>
        <p className="ebook-text">
          {tokens.map((t, i) => (
            <span key={i}>
              <span ref={(el) => (spanRefs.current[i] = el)}>{t.w}</span>
              {t.br ? <br /> : ' '}
            </span>
          ))}
        </p>
      </article>
      {quadMode && (
        <div className="quad">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={shown === i ? 'on' : undefined}>
              {i + 1}
            </div>
          ))}
        </div>
      )}

      {box && (
        <div
          className={`ebook-box ${mode}${outside || away ? ' dim' : ''}`}
          style={{
            transform: `translate(${box.left - pad}px, ${box.top - pad}px)`,
            width: box.right - box.left + pad * 2,
            height: box.bottom - box.top + pad * 2,
          }}
        />
      )}
      {markRect && (
        <div
          className="ebook-bookmark"
          style={{ transform: `translate(${markRect.left - 44}px, ${markRect.top - 10}px)` }}
          aria-label="책갈피"
        />
      )}
      {resumeRect && (
        <p className="ebook-resume" style={{ transform: `translate(${resumeRect.left}px, ${resumeRect.top - 44}px)` }}>
          여기부터 이어 읽어요
        </p>
      )}
      {aligning && !quadMode && target && (
        <div
          className="ebook-target"
          style={{
            transform: `translate(${target.left - 8}px, ${target.top - 8}px)`,
            width: target.right - target.left + 16,
            height: target.bottom - target.top + 16,
          }}
        />
      )}
      {aligning && (
        <div className="ebook-align">
          <b>위치 맞추기 {alignStep === 0 ? '1/2' : '2/2'}</b> 빨간 테두리 안의 {alignStep === 0 ? '첫' : '마지막'} 단어를
          바라본 채로 <kbd>스페이스</kbd>를 눌러 주세요.
          {alignMsg && <small>{alignMsg}</small>}
        </div>
      )}
      {!aligning && !quadMode && !summary && (away ? (
        <p className="ebook-outside">잠깐 쉬는 중이에요. 책갈피를 꽂아 둘게요</p>
      ) : outside ? (
        <p className="ebook-outside">글 밖을 보고 있어요</p>
      ) : (
        mode === 'line' &&
        shown != null &&
        layout.lines.length > 1 &&
        shown === layout.lines.length - 1 && (
          <p className="ebook-outside ebook-lasthint">
            마지막 줄이에요. 끝까지 읽고 왼쪽 위(첫 줄 자리)를 보면{' '}
            {page + 1 < book.pages.length ? '다음 쪽으로 넘어가요' : '결과가 나와요'}
          </p>
        )
      ))}
      {showDot && gazePt && !summary && (
        <div className="ebook-dot" style={{ transform: `translate(${gazePt.x}px, ${gazePt.y}px)` }} />
      )}

      {summary && (
        <ResultCard
          title={`「${book.title}」 ${book.author}`}
          summary={summary}
          pageLines={pageLinesRef.current}
          onRestart={restart}
          onExit={onExit}
        />
      )}

      <footer className="ebook-foot">
        {!aligning && !summary && (
          <span className="ebook-progress">
            「{book.title}」 {book.author}
            {book.translated && ' (우리말로 옮김)'} · {page + 1} / {book.pages.length}쪽 · 읽은 시간 {formatMs(activeMs)}
            {paused && <b> (멈춤)</b>}
          </span>
        )}
        <span>
          시선 추적 오차 약 {Number.isFinite(cal.errorCm) ? cal.errorCm.toFixed(1) : '–'}cm (보정 결과)
          {!aligning && ` · 위치 맞춤 가로 ${cm(corr.ox)}cm · 세로 ×${corr.sy.toFixed(2)}`}
        </span>
        <span className="ebook-keys">
          ← → 쪽 · R 위치 다시 맞추기 · L {mode === 'word' ? '단어' : '줄'} 강조 · G 시선 점 {showDot ? '끄기' : '켜기'} · Q{' '}
          {quadMode ? '읽기 화면' : '2×2 구역'} ·{' '}
          <button type="button" className="link" onClick={onExit}>
            준비 화면으로
          </button>
        </span>
      </footer>
    </div>
  );
}

/** 다 읽은 뒤 결과 카드 (+ 줄마다 머문 시간 막대) */
function ResultCard({
  title,
  summary,
  pageLines,
  onRestart,
  onExit,
}: {
  title: string;
  summary: SessionSummary;
  pageLines: string[][];
  onRestart: () => void;
  onExit: () => void;
}) {
  const top = longestLine(summary.lineMs);
  const maxMs = Math.max(1, ...summary.lineMs.flat().map((v) => v ?? 0));
  const stats = [
    { label: '읽은 시간', value: formatMs(summary.activeMs) },
    { label: '집중한 비율', value: `${Math.round(summary.focusRatio * 100)}%` },
    { label: '딴짓 횟수', value: `${summary.distractions}번` },
    { label: '분당 읽은 글자', value: `${Math.round(summary.charsPerMin)}자` },
  ];
  return (
    <section className="ebook-result" aria-label="읽기 결과">
      <h2>다 읽었어요!</h2>
      <p className="ebook-result-title">{title}</p>
      <div className="ebook-stats">
        {stats.map((s) => (
          <div key={s.label}>
            <b>{s.value}</b>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <h3>줄마다 머문 시간</h3>
      <ol className="ebook-lines">
        {pageLines.map((lines, p) =>
          lines.map((text, l) => {
            const ms = summary.lineMs[p]?.[l] ?? 0;
            const isTop = top?.page === p && top.line === l;
            return (
              <li key={`${p}-${l}`} className={isTop ? 'top' : undefined}>
                <span className="text">
                  {l === 0 && <em>{p + 1}쪽</em>}
                  {text}
                </span>
                <span className="bar">
                  <i style={{ width: `${(ms / maxMs) * 100}%` }} />
                </span>
                <span className="ms">
                  {(ms / 1000).toFixed(1)}초{isTop && ' · 여기서 오래 머물렀어요'}
                </span>
              </li>
            );
          }),
        )}
      </ol>
      <p className="hint">시선 추적 오차가 있어서 줄마다 시간은 대략적인 값이에요.</p>
      <div className="ebook-result-actions">
        <button type="button" className="primary" onClick={onRestart}>
          다른 글 읽기
        </button>
        <button type="button" className="ghost" onClick={onExit}>
          준비 화면으로
        </button>
      </div>
    </section>
  );
}
