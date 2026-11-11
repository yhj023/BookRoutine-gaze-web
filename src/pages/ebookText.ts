/**
 * 전자책 읽기 체험 글: 저작권이 끝난(공유 저작물) 유명한 글 4편. 읽을 때마다 다음 글이 나옴 (소설 → 우화 → 철학 → 고전)
 *  - 시는 넣지 않음: 줄이 짧아 줄 끝 돌아오기가 너무 빨리 나와 줄을 건너뛰고 쪽이 넘어갔음 (2026-11-12)
 *  - 김구 「나의 소원」은 지루하다고 해서 뺌 (2026-11-12). 이야기가 있는 글 위주로.
 *  - 외국 고전(세네카, 마르쿠스 아우렐리우스)과 이솝 우화는
 *    원작이 공유 저작물이고, 번역은 남의 번역을 쓰지 않고 직접 우리말로 옮김
 *  - 36px 글자, 줄 높이 120px(약 3.2cm, index.css .ebook-text) → 한 쪽이 4~5줄이 되게 나눔 (ebookText.test.ts 가 길이 확인).
 *    3줄짜리 쪽은 너무 빨리 끝나서 넣지 않음
 *  - '\n' 은 강제 줄 바꿈 (지금 글에는 없음)
 */
export interface EbookPage {
  text: string;
}

export interface EbookBook {
  title: string;
  author: string;
  /** 산문, 시, 우화, 고전 … (번갈아 나오게 차례를 섞어 둠) */
  kind: string;
  /** 직접 우리말로 옮긴 글이면 true ("우리말로 옮김" 표시) */
  translated?: boolean;
  pages: readonly EbookPage[];
}

export const EBOOKS: readonly EbookBook[] = [
  {
    title: '마지막 잎새',
    author: '오 헨리',
    kind: '소설',
    translated: true,
    pages: [
      {
        text:
          '뉴욕의 작은 방에서 젊은 화가 존시가 폐렴으로 앓아누웠습니다. 존시는 창밖 담쟁이덩굴의 잎을 하나씩 세며 말했습니다. ' +
          '"저 마지막 잎새가 떨어지면, 나도 떠나게 될 거야."',
      },
      {
        text:
          '그날 밤 차가운 비바람이 밤새 몰아쳤습니다. 아침에 커튼을 걷자, 벽에는 잎새 하나가 여전히 붙어 있었습니다. ' +
          '다음 날에도, 그다음 날에도 잎새는 떨어지지 않았습니다.',
      },
      {
        text:
          '"끝까지 버티는 저 잎새처럼 나도 살아 볼래." 존시는 기운을 되찾았습니다. ' +
          '그 잎새는 아래층 늙은 화가 베어먼 할아버지가 비바람 속에서 밤새 벽에 그려 놓은 그림이었습니다.',
      },
    ],
  },
  {
    title: '토끼와 거북',
    author: '이솝 우화',
    kind: '우화',
    translated: true,
    pages: [
      {
        text:
          '옛날에 발이 빠른 토끼가 느린 거북을 놀렸습니다. 거북은 화내지 않고 말했습니다. ' +
          '"그럼 저 언덕 위 나무까지 누가 먼저 가나 겨뤄 볼까?" 토끼는 웃으며 그러자고 했습니다.',
      },
      {
        text:
          '출발하자마자 토끼는 저만치 앞서 나갔습니다. 한참 뒤를 돌아보니 거북은 보이지도 않았지요. ' +
          '"한숨 자고 가도 내가 이기겠네." 토끼는 나무 그늘에 누워 잠이 들었습니다.',
      },
      {
        text:
          '그동안 거북은 쉬지 않고 한 걸음씩 걸었습니다. 토끼가 눈을 떴을 때, 거북은 벌써 언덕 위 나무에 닿아 있었습니다. ' +
          '느려도 멈추지 않고 꾸준히 걷는 걸음이 결국 이깁니다.',
      },
    ],
  },
  {
    title: '인생의 짧음에 대하여',
    author: '세네카',
    kind: '철학',
    translated: true,
    pages: [
      {
        text:
          '우리에게 주어진 시간이 짧은 것이 아니라, 우리가 그 시간의 많은 부분을 헛되이 쓰는 것이다. ' +
          '인생은 충분히 길다. 잘 쓰기만 하면 가장 큰 일을 이루기에도 넉넉하다.',
      },
      {
        text:
          '그러나 시간을 아무렇게나 흘려보내면, 흘러가는 줄도 몰랐던 시간이 이미 다 지나가 버렸음을 마지막에야 깨닫는다. ' +
          '우리는 짧은 인생을 받은 것이 아니라, 스스로 인생을 짧게 만드는 것이다.',
      },
      {
        text:
          '사람들은 늘 내일을 기다리며 오늘을 서둘러 흘려보낸다. 그러나 자기 시간을 온전히 자기를 위해 쓰고, ' +
          '하루하루를 마지막 날처럼 꾸리는 사람은 내일을 애타게 기다리지도, 두려워하지도 않는다.',
      },
    ],
  },
  {
    title: '명상록',
    author: '마르쿠스 아우렐리우스',
    kind: '고전',
    translated: true,
    pages: [
      {
        text:
          '아침에 일어나기 힘들 때는 이렇게 생각하라. "나는 사람으로서 할 일을 하러 일어난다." ' +
          '내가 태어난 이유, 이 세상에 온 까닭인 그 일을 하러 가는데 무엇을 불평하겠는가?',
      },
      {
        text:
          '아니면 나는 이불 속에서 따뜻하게 누워 있으려고 태어났는가? 작은 풀과 새, 개미와 거미와 벌을 보라. ' +
          '저마다 제 몫의 일을 하며 세상을 함께 꾸려 가고 있지 않은가?',
      },
      {
        text:
          '만 년이나 살 것처럼 행동하지 마라. 죽음은 늘 가까이 있다. 살아 있는 동안, 할 수 있는 동안, 좋은 사람이 되어라. ' +
          '지금 하는 일을 인생의 마지막 일처럼 정성을 다해 하라.',
      },
    ],
  },
];

/** 한 단어 (+ 시에서 이 단어 뒤에 줄을 바꾸는지) */
export interface EbookWord {
  w: string;
  br: boolean;
}

/** 쪽 글 → 단어들. 띄어쓰기로 나누고, '\n'(시의 줄 바꿈) 앞 단어에 br 표시 */
export function splitPage(text: string): EbookWord[] {
  const out: EbookWord[] = [];
  const rows = text.split('\n');
  rows.forEach((row, r) => {
    const ws = row.split(/\s+/).filter(Boolean);
    ws.forEach((w, i) => out.push({ w, br: r < rows.length - 1 && i === ws.length - 1 }));
  });
  return out;
}

/** 결과의 분당 글자 수에 쓰는 글 전체 글자 수 (띄어쓰기·줄 바꿈 뺌) */
export const bookChars = (b: EbookBook) => b.pages.reduce((n, p) => n + p.text.replace(/\s/g, '').length, 0);

const LAST_KEY = 'gaze-web.ebook.last';
/** 저장소를 못 쓸 때(사생활 보호 창 등) 이 탭 안에서만 기억 */
let lastInTab = -1;

/** 다음에 읽을 글 번호 (지난번 다음 글, 끝까지 가면 처음으로). 이 브라우저에만 기억 */
export function nextBookIndex(count: number = EBOOKS.length): number {
  let last = lastInTab;
  try {
    const v = Number(localStorage.getItem(LAST_KEY));
    if (localStorage.getItem(LAST_KEY) != null && Number.isInteger(v)) last = v;
  } catch {
    /* 저장소 없음 */
  }
  const next = (last + 1 + count) % count;
  lastInTab = next;
  try {
    localStorage.setItem(LAST_KEY, String(next));
  } catch {
    /* 저장소 없음 */
  }
  return next;
}
