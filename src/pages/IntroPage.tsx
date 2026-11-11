/**
 * 소개 페이지 (/) — 관람객용 쉬운 설명
 *  1. 한 줄 소개 + [체험하기]  2. 체험 순서  3. 동작 과정 (코드로 그린 예시 그림)
 *  4. 이런 걸 할 수 있어요 (기능)  5. 개인정보 (맨 아래)
 * 자세한 모델·계산 설명은 /tech (TechPage)
 */
import type { ReactNode } from 'react';
import { SERVICE_NAME } from '../components/TopNav';
import {
  ArtCalibration,
  ArtEyeCrop,
  ArtFocus,
  ArtHero,
  ArtLandmarks,
  ArtModel,
  ArtWebcam,
  FeatureIcon,
  type FeatureIconName,
} from '../components/IntroArt';

/** 기능: 제목 + 한 줄 요약 + 짧은 항목 (긴 문단 대신 훑어 읽기 쉽게) */
const FEATURES: { icon: FeatureIconName; title: string; summary: string; points: string[] }[] = [
  {
    icon: 'calib',
    title: '5점 보정',
    summary: '내 눈에 맞춰 시선 위치를 맞춰요.',
    points: ['화면의 점 5개를 눈으로 따라가기', '약 20초면 끝'],
  },
  {
    icon: 'dot',
    title: '실시간 시선 점',
    summary: '지금 화면 어디를 보는지 보여 줘요.',
    points: ['파란 점이 시선을 따라 움직임'],
  },
  {
    icon: 'focus',
    title: '집중 판정',
    summary: '1초에 4번, 집중 · 딴짓 · 자리 비움을 판단해요.',
    points: ['딴짓 이유: 고개 돌림, 눈 감음, 화면 밖, 멍때림'],
  },
  {
    icon: 'book',
    title: '전자책 읽기',
    summary: '읽고 있는 줄을 상자로 따라가요.',
    points: ['줄 끝 → 줄 앞으로 눈을 옮기면 다음 줄', '마지막 줄을 다 읽으면 다음 쪽'],
  },
  {
    icon: 'bookmark',
    title: '책갈피와 일시정지',
    summary: '딴짓하면 읽던 줄을 기억해 둬요.',
    points: ['돌아오면 "여기부터 이어 읽어요"', '자리를 비우면 읽은 시간이 멈춤'],
  },
  {
    icon: 'chart',
    title: '읽기 결과',
    summary: '다 읽으면 내 읽기 기록을 보여 줘요.',
    points: ['읽은 시간 · 집중한 비율 · 딴짓 횟수', '분당 글자 수 · 줄마다 머문 시간'],
  },
];

const STEPS = [
  { title: '카메라 앞에 앉기', desc: '[시작]을 누르면 전체 화면이 되고 카메라가 켜져요. 얼굴이 화면에 크게 보이게 앉아 주세요.' },
  { title: '5점 보정', desc: '화면에 나타나는 점을 차례로 바라봐요. 약 20초 걸려요.' },
  { title: '전자책 읽기', desc: '첫 단어와 마지막 단어를 보고 스페이스를 눌러 위치를 맞춘 뒤, 유명한 글 한 편을 편하게 읽어요. 읽을 때마다 다른 글이 나와요.' },
];

const PIPELINE: { name: string; desc: string; art: ReactNode }[] = [
  { name: '웹캠', desc: '노트북 카메라로 얼굴을 비춰요', art: <ArtWebcam /> },
  { name: '얼굴 점 찾기', desc: '얼굴에서 점 478개를 찾아요', art: <ArtLandmarks /> },
  { name: '눈 자르기', desc: '두 눈을 64×64 사진으로 잘라요', art: <ArtEyeCrop /> },
  { name: '시선 모델', desc: '눈 사진으로 보는 곳(cm)을 짐작해요', art: <ArtModel /> },
  { name: '보정', desc: '점 5개로 내 눈에 맞춰 화면 위치로 바꿔요', art: <ArtCalibration /> },
  { name: '집중 판정', desc: '시선·고개·눈으로 집중을 판단해요', art: <ArtFocus /> },
];

export default function IntroPage() {
  return (
    <main className="intro">
      {/* 1. 한 줄 소개 */}
      <section className="intro-hero intro-banner">
        <div className="intro-banner-text">
          <p className="eyebrow">{SERVICE_NAME}</p>
          <h1>웹캠으로 눈을 보고, 지금 화면에 집중하고 있는지 알려 줘요</h1>
          <p className="intro-sub">화면 주시 기반 집중 지표</p>
          <div className="intro-actions">
            <a className="intro-cta" href="/try">
              체험하기 →
            </a>
            <a className="intro-link" href="/tech">
              기술 설명 보기
            </a>
          </div>
        </div>
        <ArtHero />
      </section>

      {/* 2. 체험 순서 */}
      <section className="intro-section">
        <h2>체험 순서</h2>
        <ol className="try-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <span className="pipeline-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 3. 동작 과정 */}
      <section className="intro-section">
        <h2>어떻게 동작하나요?</h2>
        <ol className="pipeline">
          {PIPELINE.map((p, i) => (
            <li key={p.name}>
              {p.art}
              <span className="pipeline-num">{i + 1}</span>
              <b>{p.name}</b>
              <small>{p.desc}</small>
            </li>
          ))}
        </ol>
        <p className="hint">
          그림은 이해를 돕기 위한 예시예요. 모델과 계산이 더 궁금하면 <a href="/tech">기술 설명</a>을 봐 주세요.
        </p>
      </section>

      {/* 4. 기능 */}
      <section className="intro-section">
        <h2>이런 걸 할 수 있어요</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="card feature">
              <span className="feature-badge">
                <FeatureIcon name={f.icon} />
              </span>
              <div>
                <h3>{f.title}</h3>
                <p className="feature-summary">{f.summary}</p>
                <ul>
                  {f.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 5. 개인정보 (맨 아래) */}
      <section className="intro-section card privacy">
        <h2>개인정보는 이렇게 지켜요</h2>
        <ul>
          <li>
            카메라 영상은 <b>저장하지 않아요.</b>
          </li>
          <li>
            영상과 눈 사진을 서버나 다른 곳으로 <b>보내지 않아요.</b>
          </li>
          <li>
            모든 계산은 지금 보고 있는 <b>이 브라우저 안에서만</b> 해요. 창을 닫으면 아무것도 남지 않아요.
          </li>
        </ul>
      </section>
    </main>
  );
}
