# 2048 Duo

최종 갱신: 2026-10-17

5×5 보드에서 실시간으로 겨루는 2048 대전 게임. 게임 웹(`apps/web`), 관리자 웹(`apps/admin`), Socket.IO 판정 서버(`apps/socket`)를 pnpm 워크스페이스로 구성했습니다.

아이콘·이미지·스킨을 만들거나 수정할 때는 [시각 자산 제작 가이드](docs/visual-asset-guide.md)를 먼저 확인하세요. 선 스타일, 색상, 등급별 표현, 합성 연출과 검증 기준을 정리했습니다.

## 실행

Node.js 22 이상과 pnpm 11.1.3을 사용합니다.

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/socket/.env.example apps/socket/.env
pnpm dev
```

게임 웹: http://localhost:3001 · 관리자: http://localhost:3100 · 소켓 서버: http://localhost:4000 · 서버 상태: `/health`

`pnpm dev`는 세 앱을 함께 실행하며 한 프로세스가 종료되면 나머지도 종료합니다. 소켓은 이 명령에서 자동 재시작하지 않으므로 서버 코드를 변경하면 전체 명령을 다시 실행하세요. 각각 실행하려면 `pnpm dev:web`, `pnpm dev:admin`, `pnpm dev:socket`을 사용합니다. 개별 `dev:socket`은 파일 변경 감지 모드이므로 오류가 나면 실제 `/health` 응답도 확인하세요. 이메일 인증 테스트 전에는 사용하는 웹 주소의 `/auth/callback`을 Supabase Redirect URLs에 등록해야 합니다.

환경 예시는 staging Supabase를 기본값으로 사용합니다. 새 체크아웃에서는 실행 전에 같은 staging 프로젝트의 공개 키를 웹·관리자·소켓에, 서버 전용 키를 소켓에만 설정하세요. Supabase 변수를 비워 두면 계정 메뉴 없이 게스트 대전이 동작합니다.

현재 작업 PC의 `apps/web/.env.local`, `apps/admin/.env.local`, `apps/socket/.env`도 staging DB로 전환했습니다. 기존 설정은 Git에서 제외된 `.data/deployment/local-backup`에 파일 권한 600으로 보관하며 로컬 소켓 주소·개인 설정은 유지했습니다. 2026-10-17에 웹·관리자·소켓을 재시작하고 `/health` 응답을 확인했습니다. 이후 환경 변수를 변경해도 **세 앱을 재시작해야 새 설정을 읽습니다.** 위 복사 명령은 새 체크아웃에서만 실행하세요. staging에서는 운영과 별도의 계정·경기·Elo를 사용합니다.

- `pnpm test`: 게임 규칙, Socket.IO, 결과 재시도, 실제 PostgreSQL 엔진(PGlite)의 권한·집계 테스트
- `pnpm test:remote`: 서버 `.env`의 Supabase와 로컬 소켓 서버로 임시 계정 두 개의 대전·결과 저장·RLS·Realtime·관리자 통계·정지/해제를 검증한 뒤 해당 테스트 데이터만 삭제. Fly 서버 검증은 [배포 smoke 검사](docs/deployment.md#배포-검증) 사용
- `pnpm typecheck`: 게임 웹/관리자/서버 타입 검사
- `pnpm lint`: 게임 웹/관리자 린트
- `pnpm build`: 게임 웹과 관리자 프로덕션 빌드
- `pnpm --filter 2048-duo start`: 빌드한 웹 실행
- `pnpm --filter socket start`: 대전 서버 실행
- `pnpm --filter 2048-admin start`: 빌드한 관리자 실행 (3100번)

관리자는 게임 계정으로 별도 로그인하며 `admin_roles`에 등록된 계정만 들어갈 수 있습니다. 경기 검색·양측 상세, 사용자 상태 필터, 전체 정지·해제 감사 이력, 운영 상태와 시즌 전환을 제공합니다. 운영 상태 연결에는 관리자 서버의 `ADMIN_SOCKET_URL`이 필요합니다. 수집 기준과 권한은 [관리자 문서](docs/admin.md)를 참고하세요.

## 화면과 설정

- `/`: 계정 대시보드 · `/find-match`: 일반전/랭크전/친구전 선택
- `/tutorial`: 이동, X 충전, 하드 충전, 공격 받기, 공격권 모아 보내기, 기본 능력으로 X 1개 제거 체험 · `/how-to-play`: 규칙
- `/settings`: 키 바인딩, 문자 단축키, 언어, 닉네임, 로그아웃, 계정 삭제
- `/loadout`: 실제 코인 잔액, 보드 스킨 22종과 원형 프로필 아이콘 8종. 기존 20종·6종은 계정에 무료 제공, 새 보드 2종·프로필 2종은 업적 해금; 게스트는 기본 장비 고정
- `/achievements`: 실제 꾸미기 해금 업적 4종. 한국 시간 기준 7일 연속 출석은 새벽의 서약 보드, 30일은 출근왕 프로필, 유효 대전 10승은 승리의 선봉 프로필, 2048 달성은 룬의 성소 보드를 영구 해금합니다. 별도의 준비 중 업적 6종은 접어서 표시합니다.
- `/shop`: 기존 스킨 19종의 예정 가격·미리보기. 코인 지급·구매는 아직 비활성이고 업적 전용 보드는 판매하지 않습니다. [해금 조건과 업적·상점 설계](docs/achievements-and-shop.md)
- `/forgot-password`, `/reset-password`: 이메일 재설정 링크 요청과 새 비밀번호 저장. [인증 흐름·필요한 리디렉션 설정](docs/password-reset.md)

한국어·영어를 지원합니다. 계정 설정은 DB가 우선이고, 첫 로그인에 설정이 없을 때만 게스트 쿠키를 가져옵니다. 로그아웃하면 원래 게스트 설정을 복원합니다. 다른 탭이나 기기의 변경은 새로고침·재방문 때 반영됩니다. [설정 정책](docs/settings.md)

코인은 로그인한 사용자의 프로필 옆에만 표시합니다. 지급·구매는 보류했으며 지갑의 최초 잔액은 0입니다. 능력 5종은 실전에 적용됩니다. [능력 5종과 코인 지급 제안](docs/loadout-and-economy.md)

## 친구와 테스트

1. 첫 브라우저 탭에서 대전 찾기 → 친구 대전 만들기를 누릅니다.
2. 다른 탭 또는 기기에서 Join Room을 눌러 표시된 여섯 자리 코드를 입력합니다.
3. 양쪽이 게임 화면에 도착하면 방향키/WASD, 보드 스와이프, 방향 버튼으로 플레이합니다.
4. 한쪽을 새로고침하면 보드를 복원합니다. 연결이 끊긴 동안에는 양쪽 입력이 멈추며 30초 뒤 상대에게 승리를 줍니다.
5. 256·512를 합쳐 공격권을 얻은 뒤 Send X / Send hard 버튼으로 발사합니다. Surrender 후 결과를 확인하고 같은 모드의 다시 플레이 버튼으로 새 게임을 시작합니다.

새 탭을 직접 열어 접속하세요. 브라우저의 '탭 복제'는 sessionStorage도 복제할 수 있어 기존 플레이어의 연결을 인계할 수 있습니다. 게스트 토큰은 탭별 sessionStorage에 보관하며 새로고침 시 유지됩니다. 공개 사용자 ID로 다른 사람의 게임을 가져갈 수 없습니다.

휴대폰 테스트: 웹은 개발 PC의 LAN 주소로 접속하고, `NEXT_PUBLIC_SOCKET_URL`도 `http://<PC의 LAN IP>:4000`으로 바꿔 웹 서버를 재시작하세요. `apps/socket/.env`의 `CORS_ORIGINS`에 `http://<PC의 LAN IP>:3001`을 추가합니다.

## 게임 규칙

- 같은 숫자는 한 이동에 한 번 합쳐집니다. 유효한 이동 후 2 또는 4가 등장합니다.
- 새 256마다 X 블록 공격권, 새 512마다 하드 블록 공격권을 1개 충전합니다. 종류별 최대 3개까지 보관하며 초과 충전은 버립니다. 128은 공격하지 않습니다.
- 공격 버튼 또는 1·2 키로 직접 발사합니다. 보관한 공격권을 이동 없이 연속 발사할 수 있으며, 문자 단축키는 끌 수 있습니다. X는 움직이지만 합쳐지지 않고 하드 블록은 고정됩니다.
- 상대는 도착 예정 공격을 보고 다음 유효한 이동에서 받습니다. 장애물을 일반 타일보다 먼저 넣고 빈칸이 없으면 대기합니다. 대기는 최대 6개이며 가득 차면 발사하지 않고 공격권을 유지합니다.
- 자동 방어력은 없습니다. 특수능력은 경기 전 1개 선택하고 병합 점수 1024마다 1회 충전해 기본 3번 키 또는 능력 버튼으로 사용합니다. 이동·공격·능력 키는 키 설정에서 바꿀 수 있습니다. 기본 능력은 X 1개 제거입니다. 솔로는 이번 구현 범위에서 제외했습니다.
- 2048을 먼저 만들거나 상대가 움직이지 못하면 승리합니다. 같은 이동에서 양쪽 모두 막히면 무승부입니다.

일반전·친구전은 게스트도 가능하고 랭크에 영향을 주지 않습니다. 랭크전은 로그인 계정끼리 별도 매칭하며 초기 Elo 1200, K=32를 사용합니다. 최초 랭크 10경기를 마치면 공식 티어를 부여하며, 이후 Elo 구간에 따라 즉시 승급·강등합니다. 승급전은 없습니다. 무승부도 Elo와 평가·시즌 경기 수에 반영됩니다. Bronze / Silver / Gold / Platinum / Diamond / Master 경계는 1000 / 1200 / 1400 / 1600 / 1800입니다. 시즌이 바뀌어도 Elo·현재 티어·최초 평가 진행도는 유지됩니다. 시즌 전적과 최고 기록만 새로 시작하며 이번 시즌 10경기부터 순위표에 표시합니다. 매칭은 양쪽 대기시간을 반영하며 최대 격차 300점을 유지합니다. [Elo·평가·시즌 규칙](docs/ranked-seasons.md)

## Supabase 환경 연결

운영 프로젝트는 `rbfujqjvkfdgaofztrdq`, 로컬 개발·staging 프로젝트는 Seoul 리전의 `nwdjucplpyorwiwshxtf`입니다. 두 환경은 계정·데이터·키를 공유하지 않습니다. Vercel Preview도 staging DB·소켓을 사용합니다. [환경별 주소와 배포 설정](docs/deployment.md)

1. DB 스키마는 `supabase/migrations`에서 관리합니다. 프로필·경기·Elo·관리자·RLS, 지갑, 계정 삭제 시 기록 익명화·닉네임 동기화, 개인 설정·스킨·능력·피드백, 출석·업적 해금을 포함합니다. 새 프로젝트는 이 디렉터리의 SQL을 파일명 순으로 적용하세요.
2. 각 프로젝트의 Authentication → URL Configuration에 해당 환경의 Site URL과 `/auth/callback`을 등록합니다. 로컬 callback은 staging 프로젝트에만 추가하고 비밀번호 재설정의 `?type=recovery` 경로도 허용합니다.
3. `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 게임 웹과 관리자 각각의 환경에 설정합니다. 기존 anon public key 변수도 호환합니다. Secret/service_role 키를 `NEXT_PUBLIC_*`에 넣지 마세요.
4. 새 체크아웃에서는 `apps/socket/.env.example`을 `apps/socket/.env`로 복사하고 같은 staging 프로젝트의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`를 설정합니다. 현재 작업 PC의 서버 `.env`는 파일 권한 600이며 Git과 Docker 이미지에서 제외됩니다. 실제 키는 보안 경로로 전달하고 대시보드의 마스킹된 문자열을 복사하지 마세요.
5. 회원가입 → 이메일 확인 → 로그인 → 로그아웃을 확인합니다. 이메일 확인 링크는 가입한 브라우저에서 열어야 합니다.
6. 서로 다른 두 계정으로 게임을 완료해 `/history` 기록과 `/leaderboard` 순위가 새로고침 없이 갱신되는지 확인합니다.

이메일 인증과 메일 전달은 환경별로 확인하세요. Redirect 설정만으로 실제 수신 성공이 확인되지는 않습니다. 게스트 대전은 Supabase 익명 로그인에 의존하지 않습니다. Google 로그인은 공급자 설정을 끝낸 뒤에만 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`로 표시할 수 있습니다.

게임 보드와 승패는 Socket.IO 서버가 판정합니다. 서버가 Supabase 인증 토큰을 검증해 경기 시작 시 계정을 고정하고, 종료 결과를 서버 전용 함수로 기록합니다. 같은 경기 ID는 한 번만 집계합니다. 로그인한 사용자는 본인의 최근 20경기와 랭크 점수 변동을 조회할 수 있습니다. 공개 랭킹은 명시적인 랭크전만 Elo로 집계하며, 기존 경기와 승수는 보존하고 소급 점수화하지 않습니다.

Supabase Realtime은 경기 기록과 순위 화면을 갱신합니다. WebSocket 연결 후 PostgreSQL 구독 준비 완료 응답이 오면 다시 조회하며, 연결 문제에 대비해 30초 간격 조회도 수행합니다. DB 저장 전에 서버 디스크에 결과를 기록하고 실패한 요청은 30초마다 재시도합니다. 저장 완료를 확인한 파일만 지웁니다. 저장이 밀린 계정은 Elo 계산 순서를 지키기 위해 다음 랭크 참가를 기다리며, 일반전·친구전은 가능합니다. 서버는 시작할 때 미저장 랭크 계정을 먼저 복원하고 잘못된 outbox 파일이 있으면 시작을 중단합니다. 서버 secret이 없으면 게스트 대전은 가능하지만 결과 저장·랭크전은 비활성화됩니다.

## 배포 시 유의점

- 운영 게임은 `https://www.2048duo.io`, 관리자는 `https://admin.2048duo.io`, 테스트 게임은 `https://2048-web-staging.vercel.app`입니다. Vercel 프로젝트, Fly 앱·볼륨, Supabase 프로젝트를 환경별로 분리합니다. 테스트 계정은 staging에서 별도로 만드세요.
- Vercel Web Analytics·Speed Insights와 주요 클릭·매칭·꾸미기 이벤트를 추가했습니다. `NEXT_PUBLIC_APP_ENV`와 `NEXT_PUBLIC_VERCEL_ENV`가 모두 `production`인 프로덕션 빌드만 전송합니다. [통계 조회 위치·이벤트 정의·수집 제외 범위](docs/analytics.md)
- 같은 Git 저장소에서 게임 웹과 관리자 웹을 별도의 Vercel 프로젝트로 연결합니다. Root Directory는 각각 `apps/web`, `apps/admin`이며 공통 `packages`도 빌드에 포함해야 합니다. 두 앱의 환경 변수는 각각 설정합니다. 소켓은 별도의 상시 실행 Node 서버에 배포합니다. [배포 구성](docs/deployment.md)
- 게임 웹과 소켓 메시지/재접속 프로토콜을 변경할 때는 호환되는 버전을 함께 업데이트해야 합니다. 관리자 웹은 독립 배포합니다.
- 방 상태는 서버 메모리에 있습니다. 서버 재시작 시 진행 중 게임이 종료됩니다. 공유 상태/라우팅을 추가하기 전에는 소켓 서버를 **1개 인스턴스**로 운영하세요.
- 소켓 서버의 `PORT` 기본값은 4000입니다. 허용 웹 출처는 `CORS_ORIGINS`에 쉼표로 나열합니다.
- `RESULT_OUTBOX_DIR`은 영구 볼륨 안의 절대 경로로 설정하세요. 기본 경로는 `apps/socket/.data/results`이며, 영구 볼륨 없이 서버를 교체하면 아직 저장되지 않은 결과가 사라집니다. 저장 대기 파일에는 계정 ID와 경기 점수가 포함됩니다.
- 웹을 배포하기 전에 HTTPS 소켓 주소를 `NEXT_PUBLIC_SOCKET_URL`에 설정해 빌드하세요.
- Docker는 Node.js 24와 pnpm 11.1.3으로 소켓의 운영 의존성만 설치합니다. 운영·staging Fly 앱은 각각 `/data` 영구 볼륨과 `/data/results` 저장 경로, 자동 정지 해제와 상태 검사를 사용합니다. 머신은 앱마다 1개로 유지하며 배포·롤백·검증은 [배포 구성](docs/deployment.md)을 따릅니다.
- 의존성 보안 업데이트 후 `pnpm audit --prod` 경고는 0건입니다. 개발용 ESLint 경로의 `braces@3.0.3` 경고 1건은 npm에 수정 버전이 아직 없어 남아 있습니다. [상세 점검 기록](docs/code-audit-2026-10-16.md), [braces 권고](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

## 현재 검증과 남은 작업

2026-10-17에는 업적·상점 설계와 화면 골격, 비밀번호 재설정, 어드민 P0, 랭크 시즌 기능을 추가했습니다. 후속 작업에서 승급전을 제거하고 생애 Elo·최초 평가 10경기·시즌 참가 10경기 구조로 정리했습니다. 이 단계의 PostgreSQL 동시성·브라우저·권한 검증과 운영 설정은 [기능 확장 검증 기록](docs/feature-expansion-2026-10-17.md)에 정리했습니다. 이어서 출석·경기 업적의 실제 꾸미기 해금 4종을 추가했습니다. 최신 조건과 권한은 [업적 문서](docs/achievements-and-shop.md)를 참고하세요.

운영·staging DB에는 `20261017010000_admin_expansion.sql`, `20261017020000_rank_seasons.sql`, `20261017030000_achievement_unlocks.sql`을 포함한 마이그레이션 18개를 적용했습니다. 원격 이력은 저장소 파일명 버전과 맞췄습니다. 이후 변경도 staging에서 먼저 검증한 같은 마이그레이션을 운영에 적용합니다. 배포 상태와 확인할 항목은 [배포 가이드](docs/deployment.md), 브라우저 통계의 검증 범위는 [통계 가이드](docs/analytics.md)에 정리합니다.

현재 Vercel 3개 프로젝트와 Fly 운영·staging 서버 배포를 완료했습니다. 자동 테스트 159개·타입 검사·린트를 통과했고, 배포된 staging 서버에서 랭크 이동·재접속·항복·DB 기록·Elo·접근 제어 검사 1개를 통과한 뒤 임시 데이터를 정리했습니다. 운영 브라우저에서는 게스트 두 탭의 친구전, 이동·병합·상대 보드 동기화와 항복을 확인했습니다. Vercel Analytics의 방문·클릭·경기 이벤트와 Speed Insights 성능 표본 수신도 확인했습니다. 표본이 적어 대표 성능은 판단하지 않았습니다. 실제 이메일 수신은 별도 확인이 필요하며 관리자 MFA 강제는 아직 구현하지 않았습니다.

2026-10-16 코드 점검에서 전체 타입 검사·린트·자동 테스트 109개·브라우저 테스트 24개와 깨끗한 복사본에서의 게임 웹/관리자 프로덕션 빌드를 통과했습니다. 실제 Supabase 통합 테스트 1개로 임시 계정의 랭크 대전·결과 중복 방지·RLS·Realtime·관리자 통계·정지/해제를 검증한 뒤 테스트 데이터를 삭제했습니다. Docker 이미지 빌드와 실행도 확인했습니다. [점검 및 남은 문제](docs/code-audit-2026-10-16.md)

이전 UI 검증은 [UI 보고서](docs/ui-refresh/report.md)와 [검증 기록](docs/ui-refresh/validation.md)에 보존했습니다. 이전 관리자 로그인·권한·정지/해제·세션 분리 검증은 [관리자 QA](docs/browser-qa.md)에 있습니다.

코인 지급·차감·구매와 솔로 게임은 보류했습니다. 실제 적용된 능력 5종과 코인 지급 추천안은 [기획 문서](docs/loadout-and-economy.md)에 있습니다. 실제 휴대폰·스크린리더·장기 밸런스는 검증하지 않았습니다. 원본 숫자 타일 색상은 사용자 요청대로 유지하므로 모든 타일의 텍스트 대비를 보장하지 않습니다.
