/**
 * 상단 고정 메뉴. 전체 화면일 때는 숨김 (/ 소개, /tech 기술 설명, /try 체험, /collect 수집).
 * /collect 는 메뉴에 넣지 않음 — 주소로만 들어감
 */
const LINKS = [
  { href: '/', label: '소개' },
  { href: '/tech', label: '기술 설명' },
  { href: '/try', label: '체험하기' },
] as const;

export const SERVICE_NAME = 'BookRoutine 시선 체험';

export default function TopNav({ path }: { path: string }) {
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <a className="topnav-brand" href="/">
          {SERVICE_NAME}
        </a>
        <nav>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className={path === l.href ? 'on' : undefined} aria-current={path === l.href ? 'page' : undefined}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
