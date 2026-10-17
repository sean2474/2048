# 서버 렌더링과 초기 로딩 최적화

2026-10-17 최초 서버 렌더링 최적화의 측정·검증 기록이다. 기준은 DB 카탈로그가 통합된 `origin/staging`의 `8b5562c`다. 이 작업 당시 staging에 병합되지 않았던 싱글플레이·친구 기능·오디오 브랜치는 변경하거나 이 PR에 포함하지 않았다. 해당 기능을 통합할 때 공통 레이아웃·훅과 페이지를 다시 검증해야 한다.

## 변경

- 홈, 전적, 순위, 대전 찾기 페이지를 Server Component로 구성했다. 홈 프로필·최근 전적과 순위 목록은 서버에서 직접 조회하고 HTML을 생성한다. 페이지 전체를 Client Component로 옮기는 우회 방식은 사용하지 않았다.
- 상호작용만 클라이언트에 남겼다: 미리보기 재생, 시즌 선택, 오류 재시도, 실시간 갱신, 브라우저 시간대 표시. 순위표의 티어 SVG와 배지도 서버에서 렌더링한다.
- 계정·프로필 조회는 요청 단위 React cache를 공유한다. 개인 데이터는 요청 간 캐시하지 않는다. 서버에서 확인한 계정으로 공통 PlayerProvider를 초기화해 클라이언트마다 같은 프로필을 다시 읽지 않는다.
- 데이터 대기는 Suspense와 카드·목록 스켈레톤으로 표시한다. 게스트 카드는 데이터 대기 없이 바로 표시하며, 움직임 줄이기 설정에서는 스켈레톤 애니메이션을 끈다.
- 로그인 이동과 자동 계정 갱신이 겹치지 않게 했고, 다른 탭에서 로그아웃하면 서버 화면도 갱신한다. 인증과 조회 실패 시 기존 재시도 기능을 유지한다.
- 실시간 변경은 짧게 묶어 서버 화면을 갱신한다. 연결 복구·온라인 복귀·탭 복귀도 처리하고, 30초 보조 갱신은 보이는 탭에서만 수행한다. 최초 구독 때문에 같은 목록을 즉시 재조회하지 않는다.
- 텍스트 라벨을 소켓 모듈에서 분리해 홈·전적이 socket.io-client를 불러오지 않게 했다. 로컬 프로필 아이콘 경로는 인증 미들웨어에서 제외한다.

## 같은 기준 코드에서의 빌드 비교

Next.js 15.5.28 프로덕션 빌드의 First Load JS. 동일한 환경 설정과 의존성을 사용한 별도 작업 폴더에서 비교했다.

| 페이지 | 변경 전 | 변경 후 |
|---|---:|---:|
| 홈 | 252 kB | 234 kB |
| 전적 | 250 kB | 233 kB |
| 순위 | 237 kB | 233 kB |
| 대전 찾기 | 239 kB | 238 kB |

홈의 페이지 전용 JS는 7.31 → 2.50 kB, 전적은 5.36 → 1.10 kB, 순위는 6.10 → 1.21 kB다. 이 수치는 Speed Insights의 실사용 점수나 LCP/INP 측정값이 아니다. 운영 반영 이후 실제 표본으로 다시 확인해야 한다.

원본 측정값: [measurements.json](web-performance/measurements.json).

## 검증

- `pnpm test`: 217개 통과. 기존 216개와 새로운 서버 페이지 통합 테스트 1개.
- `pnpm typecheck`, `pnpm lint`, 웹 프로덕션 빌드 통과.
- 로컬 HTTP Supabase fixture로 SSR과 브라우저를 함께 검증했다. 실제 계정이나 원격 DB를 읽거나 수정하지 않는다.
- 서버 통합 테스트: 게스트/로그인 HTML, 동시에 요청한 두 계정의 분리, 인증 미들웨어와 RSC의 검증 요청 수, 프로필 1회 조회, 본인 전적 필터, 시즌 전환, 빈 결과·오류·복구, 지연된 조회보다 먼저 도착하는 스켈레톤, 아이콘 요청의 인증 우회.
- 화면 테스트 3개: 계정 초기화·로그인 이동·두 탭 로그아웃, 순위표의 1440/768/375px·한국어/영어·오류 재시도, 평가전·시즌 참여·지난 시즌 스냅샷. 레코드 테스트를 브라우저 요청 가로채기에서 서버와 브라우저가 함께 사용하는 로컬 fixture로 변경했다.
- Codex 브라우저에서 로그인/로그아웃·대시보드·순위표를 별도로 확인했다.

브라우저 회귀 테스트에는 기존 개발용 Playwright 런타임을 사용한다. 새 프로덕션 의존성은 추가하지 않았다.

```sh
node --test apps/web/tests/server-pages.test.mjs
node --test apps/web/tests/account-provider.browser.mjs apps/web/tests/leaderboard.browser.mjs
node --test --test-name-pattern='lifetime evaluation' apps/web/tests/ranked-seasons.browser.mjs
NEXT_DIST_DIR=.next/performance-final pnpm --filter 2048-duo build
```

[데스크톱](web-performance/leaderboard.png) · [모바일](web-performance/leaderboard-mobile.png)

운영 배포, 실제 모바일 기기, 운영 Speed Insights 재측정은 수행하지 않았다. 로컬 fixture는 실제 Supabase Realtime 연결의 전달 지연을 측정하지 않는다.

이후 통합된 페이지별 서버·클라이언트 구성은 [렌더링 경계](page-performance-boundaries.md), 추가 최적화의 측정은 [전체 성능 비교](full-performance/results.md), 후속 배포는 [통합 기록](full-performance/integration.md)을 따른다. 위 수치와 검증은 최초 SSR 작업 당시 기록으로 유지한다.
