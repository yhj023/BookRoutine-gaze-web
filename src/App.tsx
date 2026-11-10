import TryPage from './pages/TryPage';

/** 아주 작은 라우터: 주소를 보고 화면을 고른다 (react-router 없이) */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';

  if (path === '/try') return <TryPage />;

  return (
    <main className="home">
      <p className="eyebrow">BookRoutine · 전시 체험</p>
      <h1>화면 주시 기반 집중 지표</h1>
      <p className="lede">
        노트북 웹캠으로 눈을 보고, 내가 화면을 보고 있는지 알아봐요. 카메라 영상은 이 컴퓨터 안에서만 처리되고
        어디에도 보내지 않아요.
      </p>
      <a className="primary" href="/try">
        체험 시작하기 →
      </a>
    </main>
  );
}
