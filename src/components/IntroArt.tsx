/**
 * 소개 페이지 "동작 과정" 예시 그림 (코드로 그린 SVG — 실제 얼굴·눈 사진은 쓰지 않음)
 * 색은 index.css 의 변수(--brand 등)를 씀. 모두 viewBox 160×100
 */
import type { ReactNode } from 'react';

const VB = '0 0 160 100';

/** 1. 웹캠: 노트북 위 카메라가 사람을 비춤 */
export function ArtWebcam() {
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <rect x="34" y="14" width="92" height="60" rx="6" className="art-line" />
      <rect x="40" y="22" width="80" height="46" rx="3" className="art-soft" />
      <rect x="22" y="76" width="116" height="8" rx="3" className="art-line" />
      <circle cx="80" cy="18" r="2.6" className="art-brand" />
      <path d="M80 18 L62 52 M80 18 L98 52" className="art-ray" />
      <circle cx="80" cy="44" r="10" className="art-face" />
      <path d="M64 66 q16 -14 32 0" className="art-face" />
    </svg>
  );
}

/** 2. 얼굴 점: 얼굴 윤곽·눈·입 위의 점들 (MediaPipe 478점을 단순하게) */
export function ArtLandmarks() {
  const dots: [number, number][] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    dots.push([80 + Math.cos(a) * 30, 50 + Math.sin(a) * 38]);
  }
  for (const cx of [67, 93]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      dots.push([cx + Math.cos(a) * 7, 42 + Math.sin(a) * 3.2]);
    }
  }
  for (let i = 0; i <= 6; i++) dots.push([70 + i * (20 / 6), 70 + Math.sin((i / 6) * Math.PI) * 4]);
  for (let i = 0; i < 4; i++) dots.push([80, 46 + i * 5]);
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <ellipse cx="80" cy="50" rx="30" ry="38" className="art-soft" />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" className="art-brand" />
      ))}
      <circle cx="67" cy="42" r="2" className="art-ink" />
      <circle cx="93" cy="42" r="2" className="art-ink" />
    </svg>
  );
}

/** 눈 한 개 (아몬드 모양 + 눈동자) */
function Eye({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="48" height="48" rx="4" className="art-soft art-line" />
      <path d="M6 24 Q24 9 42 24 Q24 39 6 24 Z" className="art-eye" />
      <circle cx="26" cy="24" r="7" className="art-ink" />
      <circle cx="28" cy="22" r="1.8" className="art-glint" />
    </g>
  );
}

/** 3. 눈 자르기: 눈 두 장 (64×64) */
export function ArtEyeCrop() {
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <Eye x={22} y={18} />
      <Eye x={90} y={18} />
      <text x="46" y="82" className="art-text" textAnchor="middle">
        64×64
      </text>
      <text x="114" y="82" className="art-text" textAnchor="middle">
        64×64
      </text>
    </svg>
  );
}

/** 4. 시선 모델: 눈 두 장 → 신경망 → (x, y) cm */
export function ArtModel() {
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <rect x="8" y="22" width="22" height="22" rx="3" className="art-soft art-line" />
      <rect x="8" y="56" width="22" height="22" rx="3" className="art-soft art-line" />
      <path d="M34 33 L50 42 M34 67 L50 58" className="art-ray" />
      <path d="M52 30 L76 36 L76 64 L52 70 Z" className="art-brand-soft" />
      <path d="M80 38 L98 42 L98 58 L80 62 Z" className="art-brand-soft" />
      <path d="M102 50 L114 50" className="art-ray" />
      <rect x="116" y="38" width="38" height="24" rx="6" className="art-brand" />
      <text x="135" y="54" className="art-text-on" textAnchor="middle">
        x, y
      </text>
      <text x="135" y="76" className="art-text" textAnchor="middle">
        cm
      </text>
    </svg>
  );
}

/** 5. 보정: 화면의 점 5개 (가운데 + 네 모서리, 15% 안쪽) */
export function ArtCalibration() {
  const W = 120;
  const H = 72;
  const x0 = 20;
  const y0 = 12;
  const pts: [number, number][] = [
    [0.5, 0.5],
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
  ];
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <rect x={x0} y={y0} width={W} height={H} rx="5" className="art-soft art-line" />
      {pts.map(([fx, fy], i) => (
        <g key={i}>
          <circle cx={x0 + fx * W} cy={y0 + fy * H} r={i === 0 ? 6 : 4} className={i === 0 ? 'art-brand' : 'art-brand-soft'} />
          {i === 0 && <circle cx={x0 + fx * W} cy={y0 + fy * H} r="11" className="art-ring" />}
        </g>
      ))}
    </svg>
  );
}

/** 6. 집중 판정: 세 가지 결과 */
export function ArtFocus() {
  const chips = [
    { y: 14, label: '집중', cls: 'ok' },
    { y: 40, label: '딴짓', cls: 'warn' },
    { y: 66, label: '자리 비움', cls: 'bad' },
  ];
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      {chips.map((c) => (
        <g key={c.label}>
          <rect x="34" y={c.y} width="92" height="20" rx="10" className={`art-chip ${c.cls}`} />
          <text x="80" y={c.y + 14} className={`art-chip-text ${c.cls}`} textAnchor="middle">
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 전자책 읽기: 줄 강조 + 시선 점 + 책갈피 (기술 설명 '읽기 화면' 장) */
export function ArtReading() {
  return (
    <svg viewBox={VB} className="art" aria-hidden="true">
      <rect x="18" y="8" width="124" height="84" rx="6" className="art-paper" />
      {[22, 38, 54, 70].map((y, i) => (
        <rect key={y} x="30" y={y} width={i === 3 ? 60 : 100} height="6" rx="3" className="art-textline" />
      ))}
      <rect x="25" y="33" width="110" height="16" rx="6" className="art-highlight" />
      <circle cx="96" cy="41" r="5" className="art-dot" />
      <path d="M22 50 L22 66 L26 62 L30 66 L30 50 Z" className="art-mark" />
    </svg>
  );
}

/**
 * 소개 배너 오른쪽 그림: 노트북 화면의 글, 지금 읽는 줄 강조, "집중" 표시 (흰색 계열, 배너 색 위에 올림).
 * 전에는 큰 눈(파란 눈동자 원)이었는데 깔끔하지 않아서 바꿈 (2026-11-12)
 */
export function ArtHero() {
  const lines = [
    { y: 58, w: 132 },
    { y: 80, w: 144 },
    { y: 102, w: 138 },
    { y: 124, w: 84 },
  ];
  return (
    <svg viewBox="0 0 240 200" className="hero-art" aria-hidden="true">
      {/* 화면 */}
      <rect x="28" y="26" width="184" height="124" rx="12" className="hero-screen" />
      <rect x="114" y="32" width="12" height="3" rx="1.5" className="hero-cam" />
      {/* 읽는 줄 강조 */}
      <rect x="42" y="70" width="156" height="20" rx="10" className="hero-highlight" />
      {lines.map((l) => (
        <path key={l.y} d={`M50 ${l.y} H${50 + l.w}`} className="hero-text" />
      ))}
      {/* 받침 */}
      <path d="M14 158 H226 L216 168 H24 Z" className="hero-base" />
      {/* 집중 표시 */}
      <rect x="150" y="134" width="74" height="28" rx="14" className="hero-chip" />
      <path d="M163 148 l5 5 l9 -10" className="hero-check" />
      <text x="203" y="153" textAnchor="middle" className="hero-chip-text">
        집중
      </text>
    </svg>
  );
}

/** 기능 설명 작은 아이콘 (24×24, 선 그림) */
export type FeatureIconName = 'calib' | 'dot' | 'focus' | 'book' | 'bookmark' | 'chart';

export function FeatureIcon({ name }: { name: FeatureIconName }) {
  const paths: Record<FeatureIconName, ReactNode> = {
    calib: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <circle cx="12" cy="11" r="1.6" />
        <circle cx="6.5" cy="7.5" r="1" />
        <circle cx="17.5" cy="7.5" r="1" />
        <circle cx="6.5" cy="14.5" r="1" />
        <circle cx="17.5" cy="14.5" r="1" />
        <path d="M9 21h6" />
      </>
    ),
    dot: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <circle cx="14" cy="10" r="3" />
        <path d="M9 21h6" />
      </>
    ),
    focus: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    book: (
      <>
        <path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1z" />
        <path d="M21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z" />
      </>
    ),
    bookmark: <path d="M7 3h10v18l-5-4-5 4z" />,
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="feature-icon" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
