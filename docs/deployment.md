# 앱별 배포 구성

저장소는 하나지만 실행하는 서비스는 세 개다. 앱 폴더만 따로 복사하지 말고 루트의 `pnpm-lock.yaml`, 워크스페이스 설정과 해당 앱이 의존하는 `packages`를 함께 빌드한다.

| 앱 | 배포 대상 | 주소 예시 |
|---|---|---|
| `apps/web` | 별도 Vercel 프로젝트, Root Directory `apps/web` | `https://2048duo.io` |
| `apps/admin` | 별도 Vercel 프로젝트, Root Directory `apps/admin` | `https://admin.2048duo.io` |
| `apps/socket` | 상시 실행 Node 서버 1개 | `https://game.2048duo.io` |

주소는 구성 예시이며 이번 작업에서 도메인 연결이나 운영 배포를 실행하지 않았다. Vercel 프로젝트의 빌드에는 Root Directory 밖의 공통 패키지 포함을 허용한다. Next.js preset과 해당 앱의 `build` 스크립트를 사용하며 전체 모노레포 빌드를 각 프로젝트에 중복 지정할 필요는 없다.

## 환경 변수

- 게임 웹: 공개 Supabase URL·공개 키, `NEXT_PUBLIC_SOCKET_URL=https://game.2048duo.io`, `NEXT_PUBLIC_ADMIN_URL=https://admin.2048duo.io`.
- 관리자 웹: 같은 프로젝트의 공개 Supabase URL·공개 키. 관리자 권한은 환경 변수의 이메일이 아니라 DB `admin_roles`에 등록된 계정 UUID로 판단한다.
- 소켓: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, 서버 전용 `SUPABASE_SECRET_KEY`, `CORS_ORIGINS`에 실제 게임 웹 출처, `PORT`, 영구 볼륨 안의 `RESULT_OUTBOX_DIR`.

`NEXT_PUBLIC_*` 값은 웹 빌드 시 반영한다. 관리자에 서비스 키를 넣지 않는다. 소켓 실행 명령은 저장소 루트에서 `pnpm --filter socket start`이며 `/health`가 준비 상태를 응답한다. 기존 루트 Dockerfile도 소켓 앱과 필요한 공유 패키지만 포함한다.

## 소켓 서버와 Vercel

2026-10-16 확인한 공식 문서 기준 Vercel Functions는 WebSocket과 WebSocket 전용 Socket.IO 연결을 베타 지원한다. 그러나 함수 최대 실행 시간에 도달하면 연결이 끊기고 새 연결·재접속이 같은 인스턴스로 들어온다는 보장이 없다.

현재 서버는 매칭 대기열, 방, 보드, 재접속 타이머를 프로세스 메모리에 보관하고 결과 재시도는 디스크 outbox에 기록한다. 따라서 현재 구현은 영구 볼륨을 가진 상시 실행 서버 한 인스턴스에 배포하는 것이 맞다. Vercel로 옮기려면 서버 진입점뿐 아니라 공유 상태·매칭·판정 조율·재접속 복구·결과 큐를 다시 설계해야 한다. Redis 어댑터만 추가해도 현재 보드 상태가 자동으로 공유되지는 않는다.

서버 재시작은 진행 중인 게임을 종료한다. 다중 인스턴스 또는 자동 확장은 아직 지원하지 않는다. `fly.toml`은 `results` 볼륨을 `/data`에 마운트하고 결과를 `/data/results`에 저장하며, 자동 정지를 끈다. 이 파일만 커밋해도 실제 볼륨이나 서버가 생성되는 것은 아니다.

배포 전 같은 `dfw` 리전에 `results` 볼륨을 생성하고 머신을 1개로 유지한다. 신규 앱 배포 시 Fly의 여분 머신 생성을 막기 위해 `fly deploy --ha=false`를 사용한다. 기존 앱은 머신 수와 기존 outbox 경로부터 확인하고, 미전송 JSON 파일을 새 볼륨에 옮긴 후 경로를 바꾼다. 배포 후 `/health`와 랭크 결과 저장을 확인한다. 문제 발생 시 이전 이미지로 되돌리되 같은 볼륨을 유지한다. DB 마이그레이션을 되돌리거나 볼륨을 삭제해 롤백하지 않는다.

Docker 이미지는 Node.js 24와 pnpm 11.1.3을 사용하며 운영 소켓 의존성만 설치한다. Node 프로세스가 직접 종료 신호를 받고 Fly는 최대 30초의 종료 시간을 준다. 디스크 쓰기 실패는 프로세스 메모리에도 남겨 재시도하지만, 디스크 장애 중 프로세스까지 종료되면 아직 디스크에 쓰지 못한 결과는 복구할 수 없다. outbox 오류 로그와 디스크 용량을 운영에서 감시해야 한다.

피드백·계정 삭제의 요청 제한은 Fly 환경에서만 검증된 `Fly-Client-IP`를 사용하고, 직접 실행할 때는 TCP 상대 주소를 사용한다. 별도 프록시를 앞에 추가할 경우 클라이언트 주소 신뢰 정책을 다시 확인한다. 상태 검사(`/health`)는 프로세스 생존 검사이며 DB 저장 성공이나 여유 디스크 공간을 보증하지 않는다.

공식 근거: [Vercel 모노레포](https://vercel.com/docs/monorepos), [공통 소스 포함](https://vercel.com/docs/monorepos/monorepo-faq), [WebSocket 지원과 상태 저장 제한](https://vercel.com/docs/functions/websockets).
