# 테스트 실행과 산출물 관리

Node.js 24.x와 pnpm 11.1.3을 사용한다. 전용 worktree에서 `pnpm install --frozen-lockfile`로 시작한다. 실행 중인 개발 서버와 같은 빌드 폴더를 사용하지 않는다.

## 유지하는 검사

| 명령 | 범위 |
| --- | --- |
| `pnpm test` | 게임·소켓·PGlite DB·언어·통계·배포 정책·서버 페이지 회귀 검사 |
| `pnpm test:server` | 웹과 관리자 서버 렌더링, 계정 격리, 로그인 유지, 권한 검사 |
| `pnpm test:boundaries:browser` | 서버/브라우저 경계, 사용자 조작과 데이터 갱신 |
| `pnpm test:performance:browser` | 화면 전환, 로딩 표시, 퀘스트·보관함 갱신 |
| `pnpm typecheck`, `pnpm lint`, `pnpm format:check` | 타입·코드 규칙·서식 |
| `pnpm build` | 웹·관리자 프로덕션 빌드 |

CI는 위 기본 검사와 두 브라우저 묶음을 실행한다. 브라우저 검사는 저장소에 고정된 Playwright와 Chrome을 사용하며 CI에서 브라우저를 설치한다. 로컬 설치 명령은 `pnpm exec playwright install chrome`이다.

나머지 `apps/web/tests/*.browser.mjs`와 `apps/admin/tests/*.browser.mjs`는 기능별 수동 회귀 검사다. 일부는 개발 서버와 전용 테스트 계정을 전제로 하므로 파일 및 해당 기능 문서의 실행 조건을 먼저 확인한다. 파일명만 보고 모든 브라우저 검사를 한꺼번에 실행하지 않는다. 언어 동기화 검사는 WebKit도 필요하다.

성능 측정 도우미의 단위 검사는 `node --test apps/web/tests/performance-metrics.test.mjs apps/web/tests/performance-fixture.test.mjs`로 실행한다. 전체 측정은 [성능 측정 가이드](full-performance/README.md)를 따른다.

`pnpm test:remote`와 `apps/socket/tests/*remote-smoke.ts`, `deployed-smoke.ts`는 실제 환경에 임시 데이터를 만들 수 있다. 일반 단위 검사와 분리하며 [배포 가이드](deployment.md)의 환경·계정·정리 조건을 지킨다.

## 결과 파일

- 스크린샷·측정 JSON·오디오 미리보기·빌드 로그의 기본 저장 위치는 저장소 루트의 `test-results/<기능>/`이다. Git, Docker, Vercel 업로드에서 제외한다.
- 전체 성능 측정은 `test-results/full-performance/<label>/`, 원격 측정은 `test-results/full-performance/remote-<환경>/`에 저장한다. `BENCH_OUTPUT`으로 별도 위치를 지정할 수 있다.
- CI의 화면 전환 실패 증거는 기존 `apps/web/.next/route-loading/`에서 수집하여 Actions artifact로 7일 보관한다. 임시 서버 빌드와 설정도 각 검사 전용 `.next`와 `.tsconfig.fixture-*` 경로를 사용한다.
- 문서가 인용하는 기존 `docs/` 자료는 당시의 고정된 검증 기록이다. 새 테스트 결과로 덮어쓰지 않는다. 새 결과를 문서 근거로 남길 때만 필요한 파일을 선별해 추가한다.
- 결과를 정리할 때에는 해당 검사가 종료됐는지 확인하고 자신이 생성한 결과 폴더만 삭제한다. 다른 작업의 worktree·개발 서버·빌드 폴더는 정리 대상이 아니다.

## 2026-10-23 정리

어떤 소스·테스트·문서에서도 파일명이 참조되지 않는 과거 스크린샷 215개와 빌드 로그 4개(총 19,992,044바이트)를 제거했다. 회귀 테스트·fixture는 유지하며, 문서에서 인용하는 결과와 DNS·배포 복구 자료도 남겼다. 제거된 자료는 [정리 전 Git 기록](https://github.com/sean2474/2048/tree/46d8e38d1fb95e15aac8780cc0b81aeacd6c2363/docs)에서 확인할 수 있다.
