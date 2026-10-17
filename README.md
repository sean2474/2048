# 2048 Duo

최종 갱신: 2026-10-17. 완료된 기능 브랜치를 통합한 기준이다. 전체 성능 측정 결과와 배포 검증은 별도 보고서에 기록한다.

개발은 기능별 `codex/` 브랜치와 전용 worktree에서 진행하고, 검증 후 `staging`으로 순차 병합합니다. [Git 작업 규칙](AGENTS.md)을 먼저 확인하세요.

5×5 실시간 대전과 4×4 싱글플레이를 제공하는 2048 게임. 게임 웹(`apps/web`), 관리자 웹(`apps/admin`), Socket.IO 판정 서버(`apps/socket`)를 pnpm 워크스페이스로 구성했습니다.

## 실행과 검증

Node.js 22 이상, pnpm 11.1.3을 사용한다. 새 체크아웃에서 환경 예시를 복사하고 같은 staging 프로젝트의 키를 설정한다. 기존 환경 파일은 덮어쓰지 않는다.

```sh
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/socket/.env.example apps/socket/.env
pnpm dev
```

게임 웹은 `http://localhost:3001`, 관리자는 `http://localhost:3100`, 소켓은 `http://localhost:4000`이다. `/health`는 소켓 생존 상태를 확인한다. 서비스 키는 소켓 서버에만 설정하고 `NEXT_PUBLIC_*`에는 공개 키만 사용한다. 환경 변수를 바꾸면 해당 앱을 재시작하고 배포용 공개 변수는 재빌드한다.

`pnpm dev`는 세 앱을 실행하며 하나가 종료되면 나머지도 종료한다. 이 명령의 소켓은 자동 재시작하지 않는다. 개별 실행은 `pnpm dev:web`, `pnpm dev:admin`, 변경 감지 소켓은 `pnpm dev:socket`이다. 병렬 작업은 별도 worktree·포트·빌드 디렉터리를 사용한다.

| 명령 | 검사 범위 |
| --- | --- |
| `pnpm test` | 게임·소켓·SQL/PGlite·언어·통계·서버 페이지 회귀 |
| `pnpm typecheck` | 웹·소켓·관리자 타입 |
| `pnpm lint` | 웹·관리자 ESLint |
| `pnpm build` | 웹·관리자 프로덕션 빌드 |
| `pnpm test:remote` | 실제 Supabase와 로컬 소켓을 사용하는 임시 계정 통합 검사 |

브라우저 검사는 각 기능 문서의 `*.browser.mjs`를 실행한다. 배포된 소켓은 [staging smoke 절차](docs/deployment.md#배포-검증)로 검사한다. 과거 테스트 수는 아래 검증 문서의 해당 시점 기록이다.

## 화면과 기능

| 화면 | 기능 |
| --- | --- |
| `/` | 계정·랭크·최근 경기, 일일 퀘스트와 친구 요약 |
| `/find-match` | 일반전·랭크전·친구 방 입장, 특수 능력 선택 |
| `/solo` | 4×4 타임어택·무한모드, 저장된 진행상황 이어하기 |
| `/friends`, `/watch/[playerId]` | 친구 요청·메시지·대전 신청, 허용된 경기 관전 |
| `/history`, `/leaderboard` | 최근 전적·점수 변화, 시즌별 순위 |
| `/loadout` | 보드·아이콘 장착, 등급·보유 필터, 상세 미리보기 |
| `/shop` | DB 카탈로그의 코인 상품 구매·보유 상태·잔액 |
| `/achievements` | 자동 출석, 달성 개수·다음 목표·필터, 업적왕과 영구 꾸미기 보상 |
| `/tutorial`, `/how-to-play` | 조작·자동 공격·기본 능력 연습, 규칙 |
| `/settings` | 언어·키·닉네임·소리 설정, 로그아웃·계정 삭제 |
| `/feedback` | 피드백 작성 |
| `/forgot-password`, `/reset-password` | 이메일 비밀번호 복구 |

콘텐츠 이름·가격·공개 상태·조건은 DB 카탈로그가 기준이다. 관리자의 `/catalog`에서 스킨·프로필·업적과 Storage 이미지를 관리한다. 새 조건 종류나 애니메이션 구현에는 코드 변경이 필요하다. [콘텐츠 관리](docs/content-catalog.md) · [이미지 초기 업로드](docs/catalog-assets.md)

기본 일반 스킨과 여우 아이콘은 무료이며 코인 상품은 구매하고 업적 보상은 조건을 달성해야 장착할 수 있다. 지갑의 초기 잔액은 0이다. 대시보드의 일일 퀘스트는 출석 20·유효 대전 3판 60·1승 40코인으로 한국 시간 하루 최대 120코인을 지급하며 구매는 실제 잔액을 차감한다. 출석·대전·솔로·랭크 보상과 다른 업적 5개 달성 시 업적왕을 제공한다. 공개 조건과 콘텐츠 수량은 관리자 설정에 따라 달라진다. [일일 퀘스트](docs/daily-quests.md) · [상점](docs/cosmetic-shop.md) · [업적](docs/achievements-and-shop.md) · [랭크 보상](docs/rank-cosmetics.md)

한국어·영어를 지원한다. 계정 설정은 DB가 우선이고 새 계정의 첫 설정에만 게스트 언어·키 설정을 가져온다. 소리는 브라우저 로컬에 저장한다. 게스트는 기본 꾸미기·X 제거 능력을 사용한다. [설정 정책](docs/settings.md)

홈·전적·순위·대전 찾기는 서버 렌더링을 사용하고 상호작용과 실시간 갱신은 클라이언트에서 처리한다. [구조와 빌드 비교](docs/web-performance.md)

## 멀티 대전 규칙

- 같은 숫자는 한 이동에 한 번 합쳐지고 유효 이동 후 2 또는 4가 생성된다.
- 새 256마다 X, 새 512마다 하드블록을 자동 발사한다. X는 움직이지만 합쳐지지 않고 하드블록은 고정된다.
- 공격은 상대의 다음 유효 이동에서 일반 타일보다 먼저 들어간다. 빈칸이 없으면 최대 6개까지 대기하고 초과 공격은 버린다.
- 경기 전 고른 능력은 병합 점수 1024마다 1회 충전한다. 최대 1회분을 저장하며 기본 1번 키나 버튼으로 사용한다. [능력 5종과 제한](docs/loadout-and-economy.md)
- 1024를 먼저 만들거나 상대가 움직이지 못하면 승리하고 같은 이동에 양쪽이 막히면 무승부다.
- 일반전·친구전은 게스트도 참여하며 랭크에 영향을 주지 않는다. 랭크전은 로그인 계정끼리 초기 Elo 1200, K=32로 집계한다. 최초 10경기 후 공식 티어, 시즌 10경기 후 순위표 참가 자격을 얻는다. 승급전과 시즌 Elo 초기화는 없다. [상세 랭크 규칙](docs/ranked-seasons.md)

서버가 보드·점수·승패·능력과 계정 신원을 판정한다. 멀티 대전은 연결이 끊기면 양쪽 입력을 멈추고 30초 동안 재접속을 기다린다. 방 상태는 메모리에 있으므로 서버 재시작 시 진행 중 멀티 대전은 복구되지 않는다. [게임 설계](docs/game-design.md) · [구현 구조](docs/implementation-notes.md)

싱글플레이는 공격·능력 없이 4×4 타임어택·무한모드로 진행한다. 서버 DB에 저장된 진행상황은 계정으로 다른 기기에서도, 게스트는 같은 브라우저에서 이어갈 수 있다. 타임어택 시간은 접속하지 않은 동안에도 흐른다. [모드·저장·랭킹·업적](docs/solo-time-attack.md)

친구 방 테스트는 독립된 두 탭에서 방 만들기와 여섯 자리 코드 입장을 사용한다. 탭 복제는 sessionStorage까지 복제해 같은 플레이어 연결을 인계할 수 있다. 휴대폰은 PC의 LAN 주소로 접속하고 웹의 `NEXT_PUBLIC_SOCKET_URL`과 소켓 `CORS_ORIGINS`를 같은 주소에 맞춘다.

## 계정·운영

운영 Supabase는 `rbfujqjvkfdgaofztrdq`, 로컬·staging은 `nwdjucplpyorwiwshxtf`다. 두 환경의 계정·데이터·키는 분리한다. SQL은 `supabase/migrations`의 파일명 순서로 적용하며 이미 적용한 파일은 수정하지 않는다. [환경과 배포 순서](docs/deployment.md)

서버는 경기 결과를 디스크 outbox에 먼저 기록하고 저장 실패를 재시도한다. 같은 경기 ID는 한 번만 집계하며 저장 대기 중인 계정의 다음 랭크 참가를 막아 Elo 처리 순서를 지킨다. 운영에는 영구 볼륨과 소켓 인스턴스 1개를 사용한다. `/health` 정상만으로 DB 저장 성공을 판단하지 않는다.

관리자는 별도 웹에 로그인하며 DB의 `admin_roles`에 등록된 계정만 접근한다. 사용자·경기 검색, 정지·해제 감사, 피드백, 운영 상태, 시즌과 콘텐츠 관리를 제공한다. [관리자](docs/admin.md) · [피드백](docs/feedback.md)

회원가입·복구 링크의 redirect와 실제 메일 수신은 각각 확인한다. [비밀번호 재설정](docs/password-reset.md). 웹 통계는 앱 환경과 Vercel 환경이 모두 production인 빌드만 전송한다. [통계 정책](docs/analytics.md)

## 문서와 검증 기록

- 시각 기준: [자산 제작](docs/visual-asset-guide.md), [꾸미기·능력](docs/loadout-and-economy.md)
- 현재 기능: [카탈로그](docs/content-catalog.md), [랭크](docs/ranked-seasons.md), [상점](docs/cosmetic-shop.md)
- 플레이와 보상: [일일 퀘스트](docs/daily-quests.md), [싱글플레이](docs/solo-time-attack.md), [친구·관전](docs/social.md), [효과음](docs/audio/README.md)
- 통합 검증: [통합·배포 기록](docs/full-performance/integration.md), [성능 결과](docs/full-performance/results.md)
- 설계 이력: [랭크 개편](docs/rank-refinement.md), [관리자 확장](docs/admin-expansion-plan.md)
- 검증 이력: [코드 점검](docs/code-audit-2026-10-16.md), [기능 확장](docs/feature-expansion-2026-10-17.md), [업적 보상](docs/achievement-rewards/verification.md), [관리자 QA](docs/browser-qa.md), [UI 보고서](docs/ui-refresh/report.md)·[검증](docs/ui-refresh/validation.md)

과거 캡처·테스트 결과는 당시 변경의 근거이며 현재 전체 기능의 재검증이나 배포 완료를 뜻하지 않는다. 실제 휴대폰·스크린리더·장기 게임 밸런스와 이메일 수신은 별도 확인이 필요하다.
