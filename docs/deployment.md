# 운영·테스트 환경 배포

최종 갱신: 2026-10-17

게임 웹, 관리자 웹, 실시간 게임 서버를 따로 배포한다. 테스트는 전용 staging 웹·소켓·Supabase를 사용한다. 테스트 계정, 경기, Elo, 업적, 코인은 운영과 공유하지 않는다.

## 환경 구성

| 서비스 | 운영 | 테스트(staging) |
|---|---|---|
| 게임 웹 | Vercel `2048-web`, `https://www.2048duo.io` | Vercel `2048-web-staging`, `https://2048-web-staging.vercel.app` |
| 관리자 웹 | Vercel `2048-admin`, `https://admin.2048duo.io` | `2048-admin`의 Preview 배포 |
| 소켓 | Fly `2048-socket`, `https://2048-socket.fly.dev`, `dfw` | Fly `2048-socket-staging`, `https://2048-socket-staging.fly.dev`, `nrt` |
| Supabase 프로젝트 | `rbfujqjvkfdgaofztrdq` | `nwdjucplpyorwiwshxtf` (Seoul) |
| 소켓 설정 | [`fly.toml`](../fly.toml) | [`fly.staging.toml`](../fly.staging.toml) |

각 Fly 앱은 1 GB 메모리의 머신 **1개**와 해당 앱 전용 1 GB `results` 볼륨을 사용한다. 볼륨은 `/data`에 마운트하고 결과 재시도 파일은 `/data/results`에 저장한다. 운영 볼륨을 staging에 연결하거나 운영 DB를 테스트 DB로 복제하지 않는다.

Vercel의 Root Directory는 게임 `apps/web`, 관리자 `apps/admin`이다. 루트의 `pnpm-lock.yaml`, 워크스페이스 설정과 공통 `packages`를 함께 빌드하도록 Root Directory 밖 소스 포함을 허용한다. Next.js preset과 앱별 `build` 스크립트를 사용한다.

`2048-web`·`2048-admin`의 **Preview 환경 변수도 staging DB·소켓**을 사용한다. 전용 staging 프로젝트의 Vercel Production 배포는 운영 게임이 아니다. `NEXT_PUBLIC_APP_ENV=staging`으로 구분한다. Vercel의 운영 웹·관리자는 `main`, 전용 테스트 웹은 `staging` 브랜치를 추적한다. 기능 변경은 staging에서 검증한 뒤 main에 반영한다. Git 푸시는 Vercel 웹 배포를 트리거하며 Fly 소켓은 아래 명령으로 별도 배포한다. 배포 전 프로젝트·대상 환경·커밋을 확인한다.

## 환경 변수와 접근 경계

| 대상 | 필요한 값 |
|---|---|
| 게임 웹 | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_APP_ENV` |
| 관리자 웹 | 해당 환경의 공개 Supabase URL·공개 키, 서버 전용 `ADMIN_SOCKET_URL` |
| 소켓 | `APP_ENV`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CORS_ORIGINS`, `PORT=4000`, `RESULT_OUTBOX_DIR=/data/results` |

- 운영 게임은 `NEXT_PUBLIC_APP_ENV=production`, staging·Preview는 `staging`을 사용한다. Vercel의 시스템 환경 변수 노출(`autoExposeSystemEnvs`)을 켜서 `NEXT_PUBLIC_VERCEL_ENV`도 빌드에 제공한다. 두 값이 모두 `production`일 때만 [웹 통계](analytics.md)를 전송한다.
- `NEXT_PUBLIC_*` 변경은 **재빌드·재배포**해야 브라우저에 반영된다. 서비스 키는 Fly의 서버 전용 secret으로만 설정하며 웹·관리자·Git에 넣지 않는다. 운영/테스트 키를 섞지 않는다.
- `CORS_ORIGINS`는 쉼표로 구분한 정확한 HTTPS origin 목록이다. 운영에는 운영 웹 주소, staging에는 `https://2048-web-staging.vercel.app` 등 실제 사용하는 해당 환경의 고정 주소만 허용한다. 임의의 `*.vercel.app` 와일드카드나 localhost를 운영 설정에 추가하지 않는다.
- 기능 브랜치의 Preview URL로 게임을 테스트하려면 그 **정확한 origin을 staging 소켓에 먼저 허용**한다. Preview가 staging DB를 사용해도 CORS 허용 목록에 자동 등록되지는 않는다. 사용이 끝난 URL은 목록에서 제거한다.
- 소켓은 HTTP 요청과 WebSocket 연결의 브라우저 Origin을 검사한다. Origin은 사용자 인증을 대체하지 않는다. 관리자 권한은 DB `admin_roles`로 매번 확인하고 관리자는 게임과 별도 쿠키로 로그인한다. 자세한 접근 제어는 [관리자 가이드](admin.md)를 따른다.

소켓은 `APP_ENV=production` 또는 `staging`에서 누락된 키, 키 종류, 부정확한 HTTPS origin, 상대 outbox 경로, 잘못된 포트를 시작 시 거절한다. 개발용 `.env.example`의 기본값을 운영에 그대로 복사하지 않는다.

## Supabase와 로그인 설정

원격 DB 이력의 버전은 `supabase/migrations` 파일명과 일치해야 한다. 마이그레이션은 staging에서 검증한 **같은 파일**을 운영에 순서대로 적용한다. 적용된 파일을 수정하거나 원격 버전 이력을 임의로 다시 작성하지 않는다.

각 Supabase 프로젝트의 Auth Site URL과 redirect 허용 목록은 해당 환경의 실제 웹 주소에 맞춘다. 가입·OAuth는 `/auth/callback`, 비밀번호 복구는 `/auth/callback?type=recovery`로 돌아온다. 실제 사용하는 URL을 명시하며 운영 인증을 staging callback으로 보내지 않는다. 관리자도 해당 환경 DB의 별도 관리자 역할이 필요하다.

리디렉션 설정 완료는 이메일 전달 성공을 뜻하지 않는다. 가입 메일·비밀번호 재설정 메일의 실제 수신과 callback 완료는 배포 후 별도 확인한다. Google 로그인은 해당 Supabase provider 설정을 완료한 환경에서만 `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`로 켠다.

## 배포 순서

1. `pnpm test`, `pnpm typecheck`, `pnpm lint`와 변경에 해당하는 브라우저 검사를 통과시킨다.
2. 대상 환경을 확인하고 필요한 DB 마이그레이션을 먼저 적용한다. DB 이력과 저장소 파일 목록을 비교한다.
3. 카탈로그를 처음 적용할 때 [초기 이미지 업로드](catalog-assets.md)를 완료한다. Fly 앱의 리전, 머신 1개, 전용 볼륨, 환경별 secrets를 확인하고 새 ID·프로토콜을 처리할 소켓을 먼저 배포한다.
4. Vercel의 프로젝트·Root Directory·환경 변수·커밋을 확인하고 웹과 관리자를 배포한다. 새 결과 사유 등 클라이언트가 먼저 읽을 수 있어야 하는 변경은 예외로, 기존·신규 사유를 모두 읽는 호환 웹을 먼저 배포한 뒤 소켓을 바꾼다. 호환성을 확보하지 못하면 동시 기능 공개를 보류한다.
5. staging 랭크 검사를 완료한 뒤 운영 페이지·연결·게스트 친구전을 확인한다. 자동 랭크 smoke는 staging 전용이다. 운영/테스트 주소와 실제 접속 DB가 일치해야 한다.

저장소 루트에서 실행한다.

```sh
# 테스트 서버
fly deploy --config fly.staging.toml --depot=false --remote-only --ha=false

# 운영 서버
fly deploy --config fly.toml --depot=false --remote-only --ha=false
```

`--ha=false`는 신규 배포 시 여분 머신 생성을 막는다. 배포 뒤에도 각 앱의 머신 수를 확인한다. 2026-10-17에는 Depot 빌더 인증이 401/403으로 실패해 `--depot=false --remote-only`로 Fly 원격 빌더를 사용했다.

현재 방·보드·매칭·재접속 상태는 프로세스 메모리에 있다. **머신 재시작·배포는 진행 중 경기를 끊을 수 있다.** 자동 정지는 꺼져 있으며 다중 머신·자동 확장은 지원하지 않는다. Redis 어댑터만 추가해서 현재 보드 상태를 공유할 수는 없다.

## 배포 검증

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

통계 수치는 최초 검증 시점의 작은 표본이며 대표 성능이나 장기 이용량을 뜻하지 않는다. 실제 가입·비밀번호 재설정 메일 수신은 별도 확인이 필요하다. 관리자 MFA 강제는 아직 구현하지 않았다. 현재 관리자 접근은 서버·DB 역할 검사와 별도 로그인 쿠키를 사용한다.

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

기존 `pnpm test:remote`는 실제 Supabase에 **로컬 소켓 서버**를 연결하는 통합 검사다. Fly 네트워크·배포 이미지·실제 볼륨을 검증하는 위 검사와 구분한다. 현재 이 가이드의 배포와 검증 절차는 수동이며 자동 CI 게이트가 구축되어 있다고 가정하지 않는다.

## 장애·롤백

문제가 생기면 이전 앱 이미지/배포로 되돌리되 **같은 환경의 볼륨과 DB를 유지**한다. 볼륨 삭제나 DB 마이그레이션 역적용으로 롤백하지 않는다. 스키마와 호환되는 이전 앱인지 먼저 확인한다.

`/health`는 프로세스 생존 검사이며 DB 저장 성공·여유 디스크 공간·진행 중 경기 복원을 보증하지 않는다. 관리자 Operations의 저장 대기, 최근 원격 저장, outbox 오류와 Fly 로그·볼륨 용량을 함께 확인한다. 디스크 장애 동안 메모리에만 남은 결과는 프로세스까지 종료되면 복구할 수 없다.

요청 제한은 Fly에서 검증된 `Fly-Client-IP`, 직접 실행 시 TCP 상대 주소를 사용한다. 별도 프록시를 추가할 때는 클라이언트 주소 신뢰 정책을 다시 확인한다.
