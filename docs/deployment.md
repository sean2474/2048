# 운영·테스트 환경 배포

최종 갱신: 2026-10-23

게임 웹, 관리자 웹, 실시간 게임 서버를 따로 배포한다. 테스트는 전용 staging 웹·소켓·Supabase를 사용한다. 테스트 계정, 경기, Elo, 업적, 코인은 운영과 공유하지 않는다.

## 환경 구성

| 서비스 | 운영 | 테스트(staging) |
|---|---|---|
| 게임 웹 | Vercel `2048-web`, `https://www.2048duo.io` | Vercel `2048-web-staging`, `https://2048-web-staging.vercel.app` |
| 관리자 웹 | Vercel `2048-admin`, `https://admin.2048duo.io` | `2048-admin`의 Preview 배포 |
| 소켓 | Fly `2048-socket`, `https://2048-socket.fly.dev`, `nrt` | Fly `2048-socket-staging`, `https://2048-socket-staging.fly.dev`, `nrt` |
| Supabase 프로젝트 | `rbfujqjvkfdgaofztrdq` | `nwdjucplpyorwiwshxtf` (Seoul) |
| 소켓 설정 | [`fly.toml`](../fly.toml) | [`fly.staging.toml`](../fly.staging.toml) |

각 Fly 앱은 1 GB 메모리의 머신 **1개**와 해당 앱 전용 1 GB `results` 볼륨을 사용한다. 볼륨은 `/data`에 마운트하고 결과 재시도 파일은 `/data/results`에 저장한다. 운영 볼륨을 staging에 연결하거나 운영 DB를 테스트 DB로 복제하지 않는다.

운영 웹의 `2048duo.io`·`www.2048duo.io`는 Cloudflare **DNS only** CNAME으로 Vercel에 직접 연결한다. 2026-10-22 사용자 승인 후 추가 프록시 경유를 제거했고, HTTPS와 기본 주소의 `www` 이동은 Vercel이 처리한다. `admin.2048duo.io`는 기존 Proxied, `socket.2048duo.io`는 기존 DNS only 설정을 유지한다. 이 두 웹 주소에는 Cloudflare의 HTTP 보안·트래픽 검사가 적용되지 않는다. 현재 대상값, 측정 결과와 두 레코드만 복구하는 절차는 [DNS 변경 기록](navigation-performance/dns-routing-results.md)에 있다.

Vercel의 Root Directory는 게임 `apps/web`, 관리자 `apps/admin`이다. 루트의 `pnpm-lock.yaml`, 워크스페이스 설정과 공통 `packages`를 함께 빌드하도록 Root Directory 밖 소스 포함을 허용한다. Next.js preset과 앱별 `build` 스크립트를 사용한다.

`2048-web`·`2048-admin`의 **Preview 환경 변수도 staging DB·소켓**을 사용한다. 전용 staging 프로젝트의 Vercel Production 배포는 운영 게임이 아니다. `NEXT_PUBLIC_APP_ENV=staging`으로 구분한다. Vercel의 운영 웹·관리자는 `main`, 전용 테스트 웹은 `staging` 브랜치를 추적한다. 기능 변경은 staging에서 검증한 뒤 main에 반영한다. `main`·`staging`의 Vercel Git 자동 배포는 앱별 `vercel.json`에서 끄고 아래 GitHub Actions가 순서를 제어한다. 기능 브랜치 Preview는 유지한다.

## 자동 검증과 배포

- `CI`: staging/main 대상 PR에서 테스트, 웹·관리자 빌드, 타입 검사, 린트, 형식 검사, 브라우저 기능·로딩 검사를 실행한다. 필수 상태 검사 이름은 `CI`다. Node 24.x와 pnpm 11.1.3을 사용한다.
- `Deploy staging`: staging 푸시 뒤 같은 검사를 통과하면 테스트 환경을 자동 배포한다. Actions에서 staging 브랜치를 선택해 다시 실행할 수도 있다.
- `Deploy production`: **수동 실행만** 허용한다. GitHub Actions → Deploy production → Run workflow에서 main을 선택한다. main 푸시·병합만으로 운영을 배포하지 않는다. 동일한 Git 소스 트리의 성공한 staging 배포와 보관 중인 검증 기록이 없으면 중단한다.

DB 테스트가 사용하는 PGlite는 Node 24의 [Wasm 코드 회수 오류](https://github.com/nodejs/node/issues/66366)에 영향을 받을 수 있어 소켓 테스트 명령에만 `--no-wasm-code-gc`를 적용한다. 테스트 파일 병렬 실행은 2개로 제한한다. 운영 서버에는 이 테스트 전용 옵션을 적용하지 않는다. 브라우저 기능 검사의 최초 페이지 이동은 CI에서 개발용 페이지를 컴파일할 시간을 허용하며, 화면 동작·로딩 성능의 검증 조건은 유지한다.

배포는 환경 변수·프로젝트·DB 이력을 먼저 대조하고 웹과 관리자를 서비스 주소 변경 없이 빌드한다. 준비된 페이지를 확인한 다음 **DB 마이그레이션 → 기존 경기 종료 대기 후 소켓 교체 → staging 실서버 검사 → 웹·관리자 주소 승격** 순서로 진행한다. 이전 소스의 배포가 준비되는 동안 브랜치가 바뀌면 백엔드를 변경하기 전에 중단한다. 한 환경에서 동시에 두 배포를 실행하거나 진행 중 배포를 새 커밋 때문에 자동 취소하지 않는다.

DB에는 저장소 이력의 끝에 추가된 버전만 적용한다. 원격 이력이 갈라졌거나 중간 버전이 빠졌으면 자동 복구하지 않는다. 웹·관리자 승격은 프로젝트 간 원자적 작업이 아니므로 DB·소켓 변경은 기존 웹과 호환되어야 한다. 호환 웹을 먼저 배포해야 하는 변경은 이 파이프라인에 바로 넣지 말고 단계별 릴리스로 나눈다. 예를 들어 [Space 기본 키 전환](settings.md#2026-10-22-스페이스바-기본-키)은 DB 허용 확장(`20261022043632`) → 호환 웹 → 기본값·데이터 전환(`20261022043633`) 순서다. 아직 두 마이그레이션이 적용되지 않은 구형 웹 환경에는 자동 파이프라인으로 일괄 적용하지 않는다. 실패하면 후속 단계를 멈추며 DB 역적용이나 소켓 강제 재시작은 하지 않는다.

각 실행의 `release-staging` / `release-production` artifact에 커밋·소스 트리, 이전/신규 Vercel 배포 ID, DB 버전, 소켓 이미지와 단계별 결과를 90일 보관한다. 비밀 값은 기록하지 않는다. 90일이 지난 소스를 운영에 배포하려면 staging에서 다시 검증한다.

### 자동화 자격 증명

GitHub `release-staging` 환경은 staging 브랜치, `release-production` 환경은 main 브랜치만 허용한다. PR 검사에는 배포용 secret을 전달하지 않는다.

| GitHub environment secret | 용도 |
|---|---|
| `VERCEL_WEB_TOKEN` | 해당 환경의 웹 프로젝트 하나에 제한한 Vercel 토큰 |
| `VERCEL_ADMIN_TOKEN` | `2048-admin` 프로젝트에 제한한 Vercel 토큰. staging은 Preview, 운영은 Production 사용 |
| `FLY_API_TOKEN` | 해당 환경의 Fly 앱 하나에 제한한 deploy 토큰 |
| `SUPABASE_ACCESS_TOKEN` | 마이그레이션 이력 조회·적용을 위한 Supabase 관리 API 토큰 |
| `SUPABASE_SECRET_KEY` | **release-staging에만** 등록하는 테스트 DB 서비스 키. 실서버 검사 임시 데이터 생성·정리용 |

Vercel·Fly 토큰은 1년 만료로 발급하고 만료 전에 같은 범위의 새 토큰으로 교체한다. Supabase 관리 토큰은 로그인한 계정의 프로젝트 권한을 따르므로 접근 가능한 저장소 관리자와 워크플로 변경 권한을 제한한다. 토큰은 GitHub Secrets에만 저장하고 `.env`나 로그·커밋에 복사하지 않는다. 관리자 프로젝트 토큰은 두 Vercel 환경에 접근할 수 있으므로 파이프라인이 실제 환경 값도 대조한다.

Vercel은 프로젝트 범위 토큰과 공식 REST API를 사용한다. Git 커밋 SHA를 지정해 원격 빌드하고 실제 빌드된 SHA를 다시 대조한다. 보호된 배포의 HTTP 검사는 Vercel의 Automation Bypass를 사용하며 없으면 해당 프로젝트에 생성한다. 이 비밀은 요청 메모리에서만 사용하고 로그·검증 artifact·공개 URL에 넣지 않는다.

새 runner나 자격 증명을 점검할 때 `node scripts/release.mjs --check`로 프로젝트·환경 변수·DB 이력만 읽어 검증할 수 있다. 같은 workflow 환경 변수와 secret이 필요하며 이 명령은 배포하지 않는다.

## 환경 변수와 접근 경계

| 대상 | 필요한 값 |
|---|---|
| 게임 웹 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_APP_ENV` |
| 관리자 웹 | 해당 환경의 공개 Supabase URL·공개 키, 서버 전용 `ADMIN_SOCKET_URL` |
| 소켓 | `APP_ENV`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CORS_ORIGINS`, `PORT=4000`, `RESULT_OUTBOX_DIR=/data/results` |

- 운영 게임은 `NEXT_PUBLIC_APP_ENV=production`, staging·Preview는 `staging`을 사용한다. Vercel의 시스템 환경 변수 노출(`autoExposeSystemEnvs`)을 켜서 `NEXT_PUBLIC_VERCEL_ENV`도 빌드에 제공한다. 두 값이 모두 `production`일 때만 [웹 통계](analytics.md)를 전송한다.
- `NEXT_PUBLIC_*` 변경은 **재빌드·재배포**해야 브라우저에 반영된다. 서비스 키는 Fly의 서버 전용 secret과 staging 실서버 검사 전용 GitHub secret에만 설정하며 웹·관리자·Git에 넣지 않는다. 운영/테스트 키를 섞지 않는다.
- `CORS_ORIGINS`는 쉼표로 구분한 정확한 HTTPS origin 목록이다. 운영에는 운영 웹 주소, staging에는 `https://2048-web-staging.vercel.app` 등 실제 사용하는 해당 환경의 고정 주소만 허용한다. 임의의 `*.vercel.app` 와일드카드나 localhost를 운영 설정에 추가하지 않는다.
- 기능 브랜치의 Preview URL로 게임을 테스트하려면 그 **정확한 origin을 staging 소켓에 먼저 허용**한다. Preview가 staging DB를 사용해도 CORS 허용 목록에 자동 등록되지는 않는다. 사용이 끝난 URL은 목록에서 제거한다.
- 소켓은 HTTP 요청과 WebSocket 연결의 브라우저 Origin을 검사한다. Origin은 사용자 인증을 대체하지 않는다. 관리자 권한은 DB `admin_roles`로 매번 확인하고 관리자는 게임과 별도 쿠키로 로그인한다. 자세한 접근 제어는 [관리자 가이드](admin.md)를 따른다.

소켓은 `APP_ENV=production` 또는 `staging`에서 누락된 키, 키 종류, 부정확한 HTTPS origin, 상대 outbox 경로, 잘못된 포트를 시작 시 거절한다. 개발용 `.env.example`의 기본값을 운영에 그대로 복사하지 않는다.

## Supabase와 로그인 설정

원격 DB 이력의 버전은 `supabase/migrations` 파일명과 일치해야 한다. 마이그레이션은 staging에서 검증한 **같은 파일**을 운영에 순서대로 적용한다. 적용된 파일을 수정하거나 원격 버전 이력을 임의로 다시 작성하지 않는다.

각 Supabase 프로젝트의 Auth Site URL과 redirect 허용 목록은 해당 환경의 실제 웹 주소에 맞춘다. 가입·OAuth는 `/auth/callback`, 비밀번호 복구는 `/auth/callback?type=recovery`로 돌아온다. 실제 사용하는 URL을 명시하며 운영 인증을 staging callback으로 보내지 않는다. 관리자도 해당 환경 DB의 별도 관리자 역할이 필요하다.

리디렉션 설정 완료는 이메일 전달 성공을 뜻하지 않는다. 가입 메일·비밀번호 재설정 메일의 실제 수신과 callback 완료는 배포 후 확인한다. 2026-10-23 운영에서 해당 흐름을 완료했으며, 기본 이메일 서비스의 수신자 제한을 해결할 사용자 소유 SMTP 연결은 남아 있다. 설정 변경 후 일반 수신자 메일함으로 다시 검증한다. [최신 출시 점검 기록](launch-readiness.md)을 참고한다. Google 로그인은 해당 Supabase provider 설정을 완료한 환경에서만 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`로 켠다.

## 배포 순서

1. `pnpm test`, `pnpm typecheck`, `pnpm lint`와 변경에 해당하는 브라우저 검사를 통과시킨다.
2. 대상 환경을 확인하고 필요한 DB 마이그레이션을 먼저 적용한다. DB 이력과 저장소 파일 목록을 비교한다.
3. 카탈로그를 처음 적용할 때 [초기 이미지 업로드](catalog-assets.md)를 완료한다. Fly 앱의 리전, 머신 1개, 전용 볼륨, 환경별 secrets를 확인하고 새 ID·프로토콜을 처리할 소켓을 먼저 배포한다.
4. Vercel의 프로젝트·Root Directory·환경 변수·커밋을 확인하고 웹과 관리자를 배포한다. 새 결과 사유 등 클라이언트가 먼저 읽을 수 있어야 하는 변경은 예외로, 기존·신규 사유를 모두 읽는 호환 웹을 먼저 배포한 뒤 소켓을 바꾼다. 호환성을 확보하지 못하면 동시 기능 공개를 보류한다.
5. staging 랭크 검사를 완료한 뒤 운영 페이지·연결·게스트 친구전을 확인한다. 자동 랭크 smoke는 staging 전용이다. 운영/테스트 주소와 실제 접속 DB가 일치해야 한다.

저장소 루트에서 실행한다.

```sh
# 테스트 서버
node scripts/deploy-socket.mjs staging

# 운영 서버
node scripts/deploy-socket.mjs production
```

배포 스크립트는 커밋된 소스와 실행 중 머신 1개를 확인하고, 이미지 빌드를 끝낸 뒤 머신 내부 `127.0.0.1:4001` 제어 포트로 drain을 시작한다. 새 매칭·친구방·솔로 시작을 잠시 거절하며 진행 중 대전과 그 재접속, 이미 접속한 솔로 게임은 계속 처리한다. 경기 종료, 솔로 종료/접속 종료와 체크포인트·결과 저장이 모두 끝나야 같은 머신의 이미지를 교체한다. 저장 오류가 있거나 15분이 지나면 배포를 취소하고 입장을 재개한다. 무제한 솔로가 계속 진행 중이면 종료를 강제하지 않는다.

동시 배포는 drain 소유자 ID로 차단한다. 대기 중 Ctrl+C/SIGTERM은 입장을 재개하며, 교체가 시작된 뒤에는 Fly 완료를 기다린다. Fly 교체 실패·연결 단절로 결과가 불명확하면 입장을 자동으로 열지 않는다. `fly machine status`와 아래 상태 조회로 확인한 뒤 작업 로그의 `Drain owner` ID로 재개한다. 제어 포트는 외부 서비스로 노출하지 않는다.

```sh
fly machine exec <machine-id> 'node -e "fetch(\"http://127.0.0.1:4001/status\").then(r=>r.text()).then(console.log)"' -a <app>
# 비정상 종료한 배포의 소유자 ID를 확인한 뒤에만 실행
fly machine exec <machine-id> 'node -e "fetch(\"http://127.0.0.1:4001/resume\",{method:\"POST\",headers:{\"x-deployment-id\":\"<Drain owner>\"}}).then(r=>console.log(r.status))"' -a <app>
```

`--ha=false`와 `--only-machines`로 머신 추가를 막는다. 직접 `fly deploy`, restart, stop 명령은 drain을 우회하므로 정상 업데이트에는 사용하지 않는다. 2026-10-17 Depot 빌더 인증 실패 때문에 빌드는 `--depot=false --remote-only`를 유지한다.

구형 서버에는 제어 포트가 없으므로 스크립트가 교체를 거절한다. 최초 도입은 기존 연결이 모두 자연스럽게 종료된 때를 확인하고 새 연결을 차단한 뒤, 다시 연결 0건과 재접속 유예 시간 경과, 결과 outbox와 저장 오류를 확인해 수행한다. 접속자가 있으면 강제 연결 종료 없이 기다리며 게임 중 재접속 경로도 유지한다. 리전 이전은 drain 지원 버전에서 경기·저장 완료를 확인한 뒤 수행한다. 기존 볼륨은 새 서버 검증 전까지 보존하고, 두 리전 서버가 동시에 경기를 받지 않게 한다. 설정의 `primary_region`만 바꿔서는 기존 머신이 이동하지 않으며 실제 머신 리전을 따로 확인한다.

2026-10-17 전체 기능 통합은 **DB·카탈로그 이미지 → 소켓 → 웹/관리자** 순서로 적용한다. 새 웹의 친구 presence가 spectator 연결을 사용하므로 구형 소켓과 혼용하면 게임 연결이 교체될 수 있다. [통합 검증 기록](full-performance/integration.md)에 환경별 DB 이력, 배포 커밋, 검사 결과를 남긴다.

멀티플레이 방·보드·매칭·재접속 상태는 프로세스 메모리에 있다. **위 스크립트의 계획 배포는 경기를 끝낸 뒤 교체한다. 강제 재시작, 서버 장애, 직접 배포는 진행 중 멀티플레이 경기를 끊을 수 있다.** 솔로는 DB에 저장된 진행상황을 복원하지만 저장되지 않은 마지막 변경까지 보존하지는 못한다. [솔로 저장 정책](solo-time-attack.md)을 따른다. 자동 정지는 꺼져 있으며 다중 머신·자동 확장은 지원하지 않는다. Redis 어댑터만 추가해서 현재 보드 상태를 공유할 수는 없다.

## 배포 검증

### 전체 기능 통합 후 배포

솔로·친구·일일 퀘스트·카탈로그·오디오와 성능 개선의 후속 배포는 [통합·배포 기록](full-performance/integration.md)에 있다. 환경별 DB 이력 차이는 해당 기록의 후속 마이그레이션으로 수렴시켰으며 과거 파일을 재실행하거나 적용 이력을 재작성하지 않았다. 배포 커밋과 검사 결과는 그 기록을 기준으로 확인하고, 실제 네트워크 대전 측정은 [별도 결과](full-performance/remote-results.md)를 참고한다.

### 2026-10-17 초기 배포 확인 기록

아래 수치와 환경 상태는 당시 배포 스냅샷이다. 같은 날 추가된 구매·카탈로그나 이후 통합 커밋의 배포·검증 완료를 보증하지 않는다. 카탈로그의 별도 staging 검증은 [해당 기록](content-catalog.md)을 참고한다. 현재 대상은 실제 배포 커밋과 DB 이력으로 확인한다.

| 항목 | 결과 |
|---|---|
| Vercel | 운영 웹·관리자·staging 웹 배포 성공. 운영/테스트 게임 주소 HTTP 200, 관리자 비로그인 접근은 `/login`으로 307 이동 |
| Fly | 두 앱 모두 머신 1개 실행, 상태 검사 통과, `/health` HTTP 200. 환경별 1 GB 볼륨 사용 |
| 결과 outbox | 두 Fly 머신에 SSH로 접속해 `/data/results` 파일 수 각각 0 확인 |
| staging 실제 서버 검사 | `deployed-smoke.ts` 1/1 통과. 랭크 매칭·이동·재접속·항복·경기 기록·1184/1216 Elo, HTTP/WebSocket Origin 제한, 일반 계정의 관리자 접근 거절 확인. 정리 후 DB의 사용자·경기·레이팅·참가자 수 각각 0 확인 |
| 운영 브라우저 대전 | 게스트 두 탭이 같은 친구 방에 입장. 양쪽 이동·병합 점수 4, 상대 보드 동기화, 항복과 상대 승리 확인 |
| Vercel 통계 수신 | Analytics 방문자 2·페이지 조회 11, 이동·매칭·경기 시작/종료 이벤트와 익명화된 `/play/[id]` 경로 확인. Speed Insights 성능 표본 8개 수신 |
| 브라우저 수집 분리 | 운영 DOM에서 Analytics·Speed Insights SDK, staging DOM에서 두 SDK 미로드 확인 |
| 로컬 검사 | 자동 테스트 159개, 타입 검사, 린트 통과 |
| 로컬 개발 환경 | staging 키로 웹 3001·관리자 3100·소켓 4000을 재시작했고 `/health` HTTP 200 확인 |

통계 수치는 최초 검증 시점의 작은 표본이며 대표 성능이나 장기 이용량을 뜻하지 않는다. 당시 미확인이었던 실제 가입·비밀번호 재설정 메일 수신은 [2026-10-23 출시 점검](launch-readiness.md)에서 확인했다. 관리자 접근은 서버·DB 역할 검사, 별도 로그인 쿠키와 인증 앱 2단계 인증(aal2)을 사용한다.

### 코인 거래 내역·관리자 MFA 배포

`20261017190000_coin_ledger.sql`과 `20261017200000_admin_mfa.sql`을 staging에서 먼저 적용하고 검증한 뒤 운영에 같은 파일을 적용한다. 두 파일은 기존 지갑·구매·퀘스트 데이터를 바꾸지 않는다.

1. 각 Supabase 프로젝트의 Authentication → Multi-Factor에서 TOTP가 활성화되어 있는지 확인한다. 비활성화 상태로 MFA 마이그레이션을 적용하면 관리자가 등록 화면에서 막힌다.
2. DB 마이그레이션 → 관리자 웹 → 게임 웹 → 소켓 순서로 배포한다. 이전 관리자 웹은 MFA 마이그레이션 적용 직후부터 모든 관리자 RPC에서 거절되므로 관리자 웹을 바로 이어서 배포한다. 새 웹이 마이그레이션보다 먼저 배포되면 코인 내역 구역만 불러오기 실패를 표시하고 나머지 화면은 동작한다.
3. 배포 뒤 관리자 계정으로 로그인해 인증 앱 등록을 마치고 Operations와 사용자 상세의 Coins 구역이 표시되는지 확인한다. 소켓 `/admin/operations`는 aal2 토큰만 허용한다.
4. 롤백은 전진 마이그레이션으로 `is_game_admin()`을 이전 정의로 되돌린다. 거래 내역 테이블과 지급 기록은 삭제하지 않는다.

### 다음 배포 체크리스트

- 웹·관리자 HTTPS 페이지, 정적 파일, 올바른 환경의 Supabase/소켓 주소를 확인한다.
- 소켓 `/health`가 `{ "ok": true }`를 반환하고 허용/미허용 Origin이 각각 통과/거절되는지 확인한다.
- 독립된 두 세션으로 매칭, 이동, 상대 보드, 연결 끊김/복구, 항복, 결과 저장, Elo를 확인한다.
- 일반 계정이 관리자 데이터에 접근할 수 없는지, 관리자 Operations와 결과 저장 대기열이 정상인지 확인한다.
- 브라우저에서 가입·로그인·비밀번호 복구를 확인하고 이메일은 실제 수신까지 따로 확인한다.
- 운영 웹 통계와 staging 미수집을 확인한다. Vercel 대시보드 집계 지연은 코드 테스트와 별개다.

[`deployed-smoke.ts`](../apps/socket/tests/deployed-smoke.ts)는 **배포된 staging 소켓**에 직접 연결한다. `.env`나 로컬 서버를 자동으로 사용하지 않는다. `APP_ENV=staging`이 아니면 실행을 거절하며 운영에는 사용하지 않는다. staging 랭크 대기열이 비었는지 확인하고 아래 변수와 키가 모두 같은 staging 환경을 가리키게 설정한다.

```sh
export APP_ENV=staging
export SOCKET_TEST_URL=https://2048-socket-staging.fly.dev
export TEST_WEB_ORIGIN=https://2048-web-staging.vercel.app
export SUPABASE_URL=https://nwdjucplpyorwiwshxtf.supabase.co
# 해당 환경의 SUPABASE_PUBLISHABLE_KEY와 SUPABASE_SECRET_KEY를 보안 경로로 설정한다.
pnpm --filter socket exec tsx --test tests/deployed-smoke.ts
```

이 검사는 임시 계정 2개를 만들어 실제 매칭·이동·재접속·항복, 경기 저장과 1184/1216 Elo, 일반 계정의 관리자 접근 거절, HTTP/WebSocket Origin 거절을 확인한다. 검사에서 만든 참가자와 경기인지 확인하고 서버의 저장 완료 응답을 받은 뒤 그 데이터만 정리한다. 매칭 상대나 저장 완료를 확인하지 못하면 계정을 남기고 정리 실패를 보고한다. DB에 행이 있다는 이유만으로 삭제하지 말고 서버 outbox를 확인한 후 처리한다.

기존 `pnpm test:remote`는 실제 Supabase에 **로컬 소켓 서버**를 연결하는 통합 검사다. Fly 네트워크·배포 이미지·실제 볼륨을 검증하는 위 검사와 구분한다. 자동 배포에서는 `deployed-smoke.ts`를 staging 소켓 교체 후 실행하고 통과해야 웹을 승격한다. 이메일 실제 수신과 운영 사용자 경험은 별도 확인한다.

## 장애·롤백

문제가 생기면 이전 앱 이미지/배포로 되돌리되 **같은 환경의 볼륨과 DB를 유지**한다. 볼륨 삭제나 DB 마이그레이션 역적용으로 롤백하지 않는다. 스키마와 호환되는 이전 앱인지 먼저 확인한다.

`/health`는 프로세스 생존 검사이며 DB 저장 성공·여유 디스크 공간·진행 중 경기 복원을 보증하지 않는다. 관리자 Operations의 저장 대기, 최근 원격 저장, outbox 오류와 Fly 로그·볼륨 용량을 함께 확인한다. 디스크 장애 동안 메모리에만 남은 결과는 프로세스까지 종료되면 복구할 수 없다.

요청 제한은 Fly에서 검증된 `Fly-Client-IP`, 직접 실행 시 TCP 상대 주소를 사용한다. 별도 프록시를 추가할 때는 클라이언트 주소 신뢰 정책을 다시 확인한다.
