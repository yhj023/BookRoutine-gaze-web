/**
 * 구역을 한 장씩 넘겨 보는 슬라이드 (기술 설명 페이지용)
 *  - 위쪽 탭: 누르면 그 장으로. 아래: ‹ 이전 · 3 / 8 · 다음 ›
 *  - 키보드 ← →, 터치로 좌우 밀기
 *  - 주소 #id 와 맞춤 (#model 로 들어오면 그 장부터, 넘기면 주소도 바뀜)
 * children 은 items 와 같은 순서·개수
 */
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';

/** 터치로 이만큼(px) 넘게 밀면 넘김 */
const SWIPE_PX = 60;

interface Item {
  id: string;
  label: string;
}

const indexFromHash = (items: readonly Item[]) => {
  const i = items.findIndex((it) => `#${it.id}` === window.location.hash);
  return i < 0 ? 0 : i;
};

export default function Slides({ items, children }: { items: readonly Item[]; children: ReactNode }) {
  const slides = Children.toArray(children);
  const n = Math.min(items.length, slides.length);
  const [index, setIndex] = useState(() => indexFromHash(items));
  const startX = useRef<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    const next = Math.max(0, Math.min(n - 1, i));
    setIndex(next);
    history.replaceState(null, '', `#${items[next].id}`);
  };

  // ← → 키 (입력 칸에서는 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
    };
    const onHash = () => setIndex(indexFromHash(items));
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onHash);
    };
  }, [items, n]);

  // 키로 넘겨도 주소와 탭 위치를 맞춤
  useEffect(() => {
    if (window.location.hash !== `#${items[index].id}`) history.replaceState(null, '', `#${items[index].id}`);
    tabsRef.current?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [index, items]);

  return (
    <section className="slides" aria-roledescription="슬라이드" aria-label="기술 설명">
      <div className="slides-tabs" role="tablist" ref={tabsRef}>
        {items.slice(0, n).map((it, i) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            className={i === index ? 'on' : undefined}
            onClick={() => go(i)}
          >
            <span>{i + 1}</span>
            {it.label}
          </button>
        ))}
      </div>

      <div
        className="slides-stage"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (startX.current == null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (dx <= -SWIPE_PX) go(index + 1);
          else if (dx >= SWIPE_PX) go(index - 1);
        }}
        onPointerCancel={() => (startX.current = null)}
      >
        <div key={index} className="slide" role="tabpanel" aria-label={`${index + 1} / ${n} ${items[index].label}`}>
          {slides[index]}
        </div>
      </div>

      <div className="slides-nav">
        <button type="button" className="ghost" onClick={() => go(index - 1)} disabled={index === 0}>
          ‹ 이전
        </button>
        <div className="slides-dots" aria-hidden="true">
          {items.slice(0, n).map((it, i) => (
            <i key={it.id} className={i === index ? 'on' : undefined} />
          ))}
        </div>
        <span className="slides-count">
          {index + 1} / {n}
        </span>
        <button type="button" className="primary" onClick={() => go(index + 1)} disabled={index === n - 1}>
          다음 ›
        </button>
      </div>
      <p className="hint slides-hint">← → 키나 화면을 좌우로 밀어서 넘길 수 있어요.</p>
    </section>
  );
}
