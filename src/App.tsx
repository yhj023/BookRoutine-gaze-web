import TopNav from './components/TopNav';
import { useIsFullscreen } from './components/useFullscreen';
import IntroPage from './pages/IntroPage';
import TechPage from './pages/TechPage';
import TryPage from './pages/TryPage';
import CollectPage from './pages/CollectPage';

/** 아주 작은 라우터: 주소를 보고 화면을 고른다 (react-router 없이) */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isFullscreen = useIsFullscreen();

  // /collect 는 메뉴에 없음 (주소로만). 전체 화면에서는 메뉴 숨김
  const page =
    path === '/try' ? <TryPage /> : path === '/collect' ? <CollectPage /> : path === '/tech' ? <TechPage /> : <IntroPage />;

  return (
    <div className={isFullscreen ? 'app fullscreen' : 'app'}>
      {!isFullscreen && <TopNav path={path} />}
      {page}
    </div>
  );
}
