/**
 * 기술 설명 페이지 (/tech) — 모델과 계산을 조금 더 자세히
 * 숫자는 코드의 *_POLICY 에서 바로 읽어 와서, 값을 바꾸면 이 페이지도 같이 바뀜
 * 아래 구역들은 슬라이드(Slides)로 한 장씩 넘겨 봄 — SECTIONS 와 <section> 순서·개수가 같아야 함
 */
import { CALIBRATION_POLICY } from '../gaze/gazeCalibration';
import { FOCUS_JUDGE_POLICY as F } from '../gaze/focusJudge';
import { READING_POLICY as R } from '../reading/readingGaze';
import { SESSION_POLICY as S } from '../reading/readingSession';
import { CALIBRATION_FLOW_POLICY } from './CalibrationOverlay';
import Slides from '../components/Slides';
import { ArtCalibration, ArtEyeCrop, ArtLandmarks, ArtModel, ArtReading } from '../components/IntroArt';

const sec = (ms: number) => `${ms / 1000}초`;
const cmOf = (px: number) => `${(px * CALIBRATION_POLICY.CM_PER_PX).toFixed(1)}cm`;

const SECTIONS = [
  { id: 'flow', label: '전체 흐름' },
  { id: 'face', label: '얼굴 점' },
  { id: 'eyes', label: '눈 자르기' },
  { id: 'model', label: '시선 모델' },
  { id: 'calib', label: '5점 보정' },
  { id: 'judge', label: '집중 판정' },
  { id: 'reading', label: '읽기 화면' },
  { id: 'stack', label: '사용한 기술' },
] as const;

export default function TechPage() {
  return (
    <main className="intro tech">
      <section className="intro-hero tech-hero">
        <p className="eyebrow">기술 설명</p>
        <h1>눈 사진 두 장에서 "읽고 있는 줄"까지</h1>
        <p className="intro-sub">모든 계산은 브라우저 안에서 해요. 영상과 눈 사진은 밖으로 나가지 않아요.</p>
      </section>

      <Slides items={SECTIONS}>

      <section id="flow" className="intro-section">
        <h2>전체 흐름</h2>
        <ol className="flow-list">
          <li>
            웹캠 영상에서 <b>얼굴 점 478개</b>를 찾아요.
          </li>
          <li>
            점을 기준으로 두 눈을 <b>64×64 사진</b>으로 잘라요 (1초에 최대 10번).
          </li>
          <li>
            <b>시선 모델</b>이 눈 사진 두 장으로 보는 곳을 cm 단위로 짐작해요.
          </li>
          <li>
            <b>5점 보정</b>으로 만든 변환식이 cm 값을 화면 위치(px)로 바꿔요.
          </li>
          <li>
            <b>집중 판정</b>이 시선·고개·눈을 1초에 4번 보고 집중 / 딴짓 / 자리 비움을 정해요.
          </li>
          <li>
            <b>읽기 화면</b>은 시선 위치를 부드럽게 다듬어 읽고 있는 줄을 따라가요.
          </li>
        </ol>
      </section>

      <section id="face" className="intro-section tech-block">
        <ArtLandmarks />
        <div>
          <h2>얼굴 점 찾기</h2>
          <ul>
            <li>MediaPipe Face Landmarker로 얼굴 한 개에서 점 478개(눈동자 포함)를 찾아요.</li>
            <li>고개 각도(좌우·상하)는 얼굴의 3차원 변환 행렬에서 계산해요.</li>
            <li>눈 감은 정도는 MediaPipe가 주는 눈 깜빡임 값(eyeBlink)을 써요.</li>
            <li>모델 파일과 실행 파일은 이 사이트에 함께 들어 있어서, 다른 서버에서 받아 오지 않아요.</li>
          </ul>
        </div>
      </section>

      <section id="eyes" className="intro-section tech-block">
        <ArtEyeCrop />
        <div>
          <h2>눈 자르기</h2>
          <ul>
            <li>
              양쪽 <b>눈꼬리</b> 네 점(33·133, 263·362)을 기준으로 얼굴을 돌려 눈이 수평이 되게 해요. 눈동자는 시선에 따라
              움직이기 때문에 기준으로 쓰지 않아요.
            </li>
            <li>얼굴을 224px 크기로 맞추고, 두 눈 사이를 그 35%로 맞춰요.</li>
            <li>눈꺼풀 둘레 크기의 1.8배인 정사각형을 잘라 64×64로 줄여요.</li>
            <li>
              모델을 학습할 때 쓴 파이썬(OpenCV) 코드와 <b>숫자 하나까지 같은 사진</b>이 나오도록 계산을 그대로 옮겼어요.
            </li>
            <li>모델에 넣는 사진은 거울처럼 뒤집지 않아요 (화면에 보이는 영상만 거울 모드).</li>
          </ul>
        </div>
      </section>

      <section id="model" className="intro-section tech-block">
        <ArtModel />
        <div>
          <h2>시선 모델</h2>
          <table className="spec">
            <tbody>
              <tr>
                <th>구조</th>
                <td>
                  MobileNetV3-Small(이미지넷으로 미리 배운 모델)을 눈 인코더로 써요. 두 눈에 <b>같은 인코더</b>를 함께 쓰고,
                  두 특징을 합쳐 작은 신경망이 위치를 계산해요.
                </td>
              </tr>
              <tr>
                <th>입력</th>
                <td>눈 사진 2장 (각 64×64, RGB 0~255). 사진 속 왼쪽 눈과 오른쪽 눈을 정해진 순서로 넣어요.</td>
              </tr>
              <tr>
                <th>출력</th>
                <td>숫자 2개: 보고 있는 곳의 가로·세로 위치 (cm, 보정 전)</td>
              </tr>
              <tr>
                <th>학습 데이터</th>
                <td>노트북 화면을 보는 눈 사진과 그때 본 위치</td>
              </tr>
              <tr>
                <th>실행</th>
                <td>
                  PyTorch 모델을 TFLite로 바꿔서 브라우저에서 <b>LiteRT.js(CPU)</b>로 실행해요. 같은 눈 사진에서 파이썬과 같은
                  값이 나오는 것을 확인했어요.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="calib" className="intro-section tech-block">
        <ArtCalibration />
        <div>
          <h2>5점 보정</h2>
          <ul>
            <li>
              가운데와 네 모서리(화면 가장자리에서 15% 안쪽)에 점이 하나씩 나와요. 점마다 최소 {sec(CALIBRATION_FLOW_POLICY.DOT_MIN_MS)}{' '}
              보여 주고, 안정된 값을 {CALIBRATION_FLOW_POLICY.DOT_TARGET_SAMPLES}개 모아요.
            </li>
            <li>점이 나타난 뒤 {sec(CALIBRATION_POLICY.SETTLE_MS)} 동안은 눈이 옮겨 가는 중이라 값을 버려요.</li>
            <li>
              점마다 모은 값의 가운데 값으로 <b>아핀 변환</b>(숫자 6개)을 만들어요. 좌우 반전, 크기 차이, 위치 어긋남, 약간의
              기울어짐을 한 번에 바로잡아요.
            </li>
            <li>점 하나를 빼고 만든 변환식으로 뺀 점을 맞혀 보는 방법으로 보정 품질(좋음 / 보통 / 낮음)을 정해요.</li>
            <li>마지막에 가운데 점을 {sec(CALIBRATION_FLOW_POLICY.FIXATION_MIN_MS)} 바라보며 시선이 얼마나 흔들리는지 재요.</li>
          </ul>
        </div>
      </section>

      <section id="judge" className="intro-section">
        <h2>집중 판정</h2>
        <p className="hint">
          정해진 기준이 아니라 <b>이 사람의 평소 모습</b>(보정할 때의 고개 각도·눈 뜬 정도)과 비교해요. 1초에 4번, 위에서부터
          차례로 봐요.
        </p>
        <table className="spec judge">
          <thead>
            <tr>
              <th>순서</th>
              <th>조건</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>얼굴이 안 보임</td>
              <td>
                <span className="focus-chip away">자리 비움</span>
              </td>
            </tr>
            <tr>
              <td>2</td>
              <td>
                두 눈이 모두 감김 (기준 = 평소 값 + {F.EYE_BLINK_MARGIN}, 최소 {F.EYE_BLINK_FLOOR})
              </td>
              <td>
                <span className="focus-chip unfocused">딴짓 · 눈 감음</span>
              </td>
            </tr>
            <tr>
              <td>3</td>
              <td>
                고개가 평소보다 좌우 {F.MAX_YAW_DEV_DEG}° / 상하 {F.MAX_PITCH_DEV_DEG}° 넘게 돌아감
              </td>
              <td>
                <span className="focus-chip unfocused">딴짓 · 고개를 돌림</span>
              </td>
            </tr>
            <tr>
              <td>4</td>
              <td>시선이 화면 밖 (보정 오차를 생각해 조금 여유를 둠)</td>
              <td>
                <span className="focus-chip unfocused">딴짓 · 시선이 화면 밖</span>
              </td>
            </tr>
            <tr>
              <td>5</td>
              <td>{sec(F.STARE_WINDOW_MS)} 동안 시선이 거의 움직이지 않음</td>
              <td>
                <span className="focus-chip unfocused">딴짓 · 멍때림</span>
              </td>
            </tr>
            <tr>
              <td>6</td>
              <td>나머지</td>
              <td>
                <span className="focus-chip focused">집중</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="hint">한 번 튀는 결과는 최근 {F.SMOOTH_WINDOW}번의 다수결로 걸러요.</p>
      </section>

      <section id="reading" className="intro-section tech-block">
        <ArtReading />
        <div>
          <h2>읽기 화면</h2>
          <ul>
            <li>
              <b>부드럽게 하기</b>: 가로는 최근 {sec(R.SMOOTH_X_WINDOW_MS)}, 세로는 최근 {sec(R.SMOOTH_Y_WINDOW_MS)} 동안의 가운데
              값을 써요. {cmOf(R.SMOOTH_DEADZONE_PX)} 안쪽 떨림은 무시해요.
            </li>
            <li>
              <b>위치 맞추기</b>: 첫 단어와 마지막 단어를 볼 때의 시선으로 가로 위치와 세로 크기를 다시 맞춰요. 화면 아래를 볼 때
              눈꺼풀이 내려와 시선이 위로 눌리는 것도 펴 줘요.
            </li>
            <li>
              <b>줄 붙어 있기</b>: 줄 경계를 {cmOf(R.LINE_STICK_PX)} 더 넘어가야 다른 줄로 봐요. 다음 줄은{' '}
              {sec(R.LINE_NEXT_DWELL_MS)}, 바로 위 줄이나 한 줄 건너뛰기는 {sec(R.LINE_OTHER_DWELL_MS)}, 그보다 먼 줄은{' '}
              {sec(R.LINE_FAR_DWELL_MS)} 머물러야 옮겨요. 다음 줄로
              넘어간 뒤 {sec(R.SWEEP_NO_BACK_MS)} 동안은 위 줄로 돌아가지 않아요.
            </li>
            <li>
              <b>첫 줄에서 시작</b>: 쪽을 열면 박스는 첫 줄에 있어요. {sec(R.LINE_START_HOLD_MS)} 동안은 위아래 값으로 옮기지
              않아서, 앞 쪽 아래를 보던 시선 때문에 밀려나지 않아요.
            </li>
            <li>
              <b>줄 끝 돌아오기</b>: 시선이 줄의 {Math.round(R.SWEEP_RIGHT_FRAC * 100)}% 넘게 갔다가{' '}
              {Math.round(R.SWEEP_LEFT_FRAC * 100)}% 안쪽으로 돌아오면 바로 다음 줄로 넘겨요. 줄 앞을 먼저 본 뒤에만, 그리고
              그 줄을 {sec(R.SWEEP_MIN_LINE_MS)} 넘게 보여 준 뒤에만 세요 (짧은 줄은 길이만큼 줄여요). 마지막 줄을 끝까지 읽고
              왼쪽 위(첫 줄 자리)를 봐도 다음 쪽으로 넘겨요. 마지막 줄이면 다음 쪽으로 넘겨요 (쪽을
              연 뒤 {sec(S.PAGE_MIN_MS)} 지나서).
            </li>
            <li>
              <b>책갈피</b>: 딴짓이나 자리 비움이 {sec(S.DISTRACT_MS)} 넘게 이어지면 읽던 줄에 책갈피를 꽂고, 자리 비움·눈 감음
              동안에는 읽은 시간을 멈춰요.
            </li>
          </ul>
        </div>
      </section>

      <section id="stack" className="intro-section">
        <h2>사용한 기술</h2>
        <div className="stack-grid">
          <div className="card">
            <h3>화면</h3>
            <p>Vite · React · TypeScript</p>
          </div>
          <div className="card">
            <h3>얼굴 점</h3>
            <p>MediaPipe Tasks Vision (Face Landmarker)</p>
          </div>
          <div className="card">
            <h3>시선 모델 실행</h3>
            <p>LiteRT.js (TFLite, WebAssembly)</p>
          </div>
          <div className="card">
            <h3>모델 학습</h3>
            <p>PyTorch · MobileNetV3-Small · OpenCV</p>
          </div>
        </div>
      </section>
      </Slides>
    </main>
  );
}
