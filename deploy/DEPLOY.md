# 배포 순서 (EC2 nginx + 가비아 도메인, 서브도메인)

이 웹은 **정적 파일만** 있어요. 카메라 영상과 눈 사진은 서버로 가지 않고, 계산은 모두 브라우저에서 해요.
그래서 백엔드와 연결할 것이 없고, nginx 가 파일만 건네주면 돼요.

아래에서 `gaze.example.com` 은 실제 주소로, `EC2_IP` 는 EC2 공인 IP로, `KEY.pem` 은 EC2 접속 키로 바꿔 주세요.

## 왜 서브도메인인가요?
코드가 `/models/...`, `/try` 처럼 주소 **맨 앞**부터 파일을 찾아요.
`gaze.example.com` 같은 새 주소(서브도메인)는 그대로 되지만, `example.com/gaze/` 같은 하위 경로는 코드를 고쳐야 해요.

## 1. 가비아에 서브도메인 만들기 (한 번만)
1. My가비아 → 서비스 관리 → 도메인 → 해당 도메인의 **DNS 관리** (DNS 설정)
2. 레코드 추가: 타입 **A**, 호스트 **gaze**, 값 **EC2_IP**, TTL 600 → 저장
   - EC2 IP는 **탄력적 IP**(고정 IP)여야 해요. 일반 공인 IP는 EC2 를 껐다 켜면 바뀌어요.
   - 이미 백엔드 주소가 같은 방식(A 레코드 → EC2 IP)으로 되어 있으면, 그 값과 똑같이 넣으면 돼요.
   - 네임서버를 Route 53 으로 바꿔 두었다면 가비아가 아니라 Route 53 에 같은 레코드를 추가해요.
3. 몇 분 뒤 확인: `nslookup gaze.example.com` → EC2_IP 가 나오면 성공

## 2. EC2 보안 그룹
인바운드에 **80(HTTP)**, **443(HTTPS)** 이 열려 있는지 확인 (백엔드가 https 면 이미 열려 있을 거예요).

## 3. 빌드 (내 컴퓨터)
```
npm run build
```
`dist/` 폴더가 생겨요 (약 93MB).

## 4. 파일 올리기 (내 컴퓨터, Git Bash)
```
scp -i KEY.pem -r dist ubuntu@EC2_IP:/tmp/gaze-dist
```
(Amazon Linux 면 `ubuntu` 대신 `ec2-user`)

서버에 접속해서 제자리에 옮기기:
```
ssh -i KEY.pem ubuntu@EC2_IP
sudo mkdir -p /var/www/gaze-web
sudo rsync -a --delete /tmp/gaze-dist/ /var/www/gaze-web/
sudo chown -R www-data:www-data /var/www/gaze-web    # Amazon Linux 면 nginx:nginx
rm -rf /tmp/gaze-dist
```

## 5. nginx 설정 (처음 한 번)
`deploy/nginx-gaze.conf` 의 `gaze.example.com` 을 바꾼 뒤 서버에 올려요.
```
scp -i KEY.pem deploy/nginx-gaze.conf ubuntu@EC2_IP:/tmp/gaze.conf
```
서버에서:
```
# Ubuntu
sudo mv /tmp/gaze.conf /etc/nginx/sites-available/gaze
sudo ln -s /etc/nginx/sites-available/gaze /etc/nginx/sites-enabled/gaze
# Amazon Linux 는 위 두 줄 대신: sudo mv /tmp/gaze.conf /etc/nginx/conf.d/gaze.conf

sudo nginx -t                 # "syntax is ok" 가 나와야 함. 오류면 reload 하지 말 것 (백엔드도 멈출 수 있음)
sudo systemctl reload nginx
```
기존 백엔드 설정 파일은 건드리지 않아요. 새 파일 하나만 추가해요.

## 6. https (처음 한 번)
카메라는 **https 에서만** 켜져요.
```
sudo certbot --nginx -d gaze.example.com
```
- certbot 이 없으면: Ubuntu `sudo apt install certbot python3-certbot-nginx`
- 백엔드 인증서도 certbot 으로 받았다면 자동 갱신이 이미 돌고 있어서 따로 할 일 없어요.

## 7. 확인
- `https://gaze.example.com/`, `/tech`, `/try` 를 **주소창에 직접** 쳐서 열리는지
- `/try` 에서 카메라가 켜지는지
- 개발자 도구(F12) → Network → `.wasm` 파일의 Content-Type 이 `application/wasm` 인지
  ```
  curl -sI https://gaze.example.com/mediapipe/wasm/vision_wasm_internal.wasm | grep -i content-type
  ```

## 다음에 새 버전을 올릴 때
3번(빌드) → 4번(파일 올리기)만 다시 하면 돼요. nginx 를 다시 불러올 필요 없어요.
