# 웹 사용 통계와 성능 지표

최종 갱신: 2026-10-17

게임 웹에 Vercel Web Analytics와 Speed Insights를 연결한다. 페이지 유입·명시적인 클릭·매칭 흐름은 Vercel에서, 실제 경기·Elo·공격 통계는 [관리자 화면](admin.md)에서 확인한다. Vercel 이벤트를 경기 DB의 대체 기록으로 사용하지 않는다.

## 어디서 보는가

| 목적 | 확인 위치 | 기준 |
|---|---|---|
| 페이지 방문, 유입, 주요 버튼·꾸미기 사용 | Vercel `2048-web` → Analytics → 페이지/Custom Events | 브라우저가 전송한 이벤트 |
| 실제 사용자 환경의 페이지 성능 | Vercel `2048-web` → Speed Insights | 수신된 브라우저 성능 표본 |
| 완료 경기, 모드·종료 사유, 티어·공격 통계 | `admin.2048duo.io` → Overview/Matches | 게임 서버가 DB에 저장한 결과 |
| 현재 연결·방·매칭·저장 대기 | 관리자 Operations | 현재 Fly 프로세스 상태 |

2026-10-17 설정은 **Web Analytics Pro, Plus 미사용**이다. 이벤트 속성은 모두 2개 이하로 제한했다. Speed Insights는 현재 무료 RES(Real Experience Score) 화면을 사용하며 전체 Core Web Vitals 상세 기능을 위한 유료 Plus는 활성화하지 않았다. 플랜 변경 없이 모든 지표를 볼 수 있다고 가정하지 않는다. 사용량·비용·추가 기능은 Vercel 프로젝트 대시보드에서 확인한다.

## 수집 환경과 데이터 범위

[`analytics.ts`](../apps/web/src/lib/analytics.ts)의 조건을 모두 만족할 때만 SDK와 이벤트를 켠다.

```text
NODE_ENV=production
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_VERCEL_ENV=production
```

따라서 로컬 개발, Vercel Preview, 전용 staging 프로젝트는 수집하지 않는다. 전용 staging의 Vercel 대상이 Production이어도 `NEXT_PUBLIC_APP_ENV=staging`이므로 꺼진다. Vercel 시스템 환경 변수 노출과 재빌드가 필요하다. [환경별 배포 가이드](deployment.md)를 따른다.

- 전송 URL에서 query·hash·URL 자격증명을 제거한다. 동적 경기 주소는 `/play/[id]`로 치환해 방 ID를 보내지 않는다.
- 허용한 페이지 경로만 수집한다. 인증 callback·오류·비밀번호 찾기·재설정 경로와 알 수 없는 경로는 제외한다. `/login`, `/signup` 페이지 방문 자체는 포함한다.
- 커스텀 속성에는 이메일·표시 이름·계정 UUID·경기/방 ID·친구 코드·입력 내용·토큰을 넣지 않는다. 입력 키, 마우스 좌표, 세션 녹화, 전체 클릭 자동 수집은 추가하지 않았다.
- 경기 이벤트의 중복 방지용 방 ID는 해당 탭의 메모리와 `sessionStorage`에만 보관하며 분석 payload에는 넣지 않는다.
- 통계 SDK나 브라우저 저장소 오류가 게임·꾸미기 저장을 중단하지 않게 처리한다. 광고 차단·오프라인·페이지 종료 때문에 이벤트가 누락될 수 있다.

위 규칙은 애플리케이션이 보내는 URL·커스텀 속성 범위다. Vercel 자체의 방문자·유입·기기 집계를 서버 DB의 계정 식별자로 해석하지 않는다.

## 이벤트 목록

이벤트 정의는 [`apps/web/src/lib/analytics.ts`](../apps/web/src/lib/analytics.ts), SDK 연결은 [`GameAnalytics`](../apps/web/src/components/widget/analytics.tsx)에 있다.

| 이벤트 | 속성 | 발생 기준 |
|---|---|---|
| `navigation_clicked` | `destination` | `data-analytics-link`로 표시한 내부 링크 클릭. 허용된 고정 경로만 전송 |
| `queue_started` | `mode` | 소켓 연결 후 일반/랭크 매칭 요청을 보내기 직전. 같은 대기 화면의 재접속은 중복 제외 |
| `queue_cancel_clicked` | `mode` | 검색 중 취소 버튼 클릭. 서버의 취소 완료 확인을 뜻하지 않음 |
| `match_started` | `mode` | 일시정지가 아닌 경기 상태를 처음 수신 |
| `match_finished` | `mode`, `outcome` | 서버 종료 메시지 수신. `win`/`loss`/`draw`는 해당 플레이어 관점 |
| `cosmetic_previewed` | `item`, `source` | 꾸미기/상점 상세 열기. 카탈로그 ID와 `loadout`/`shop`만 전송 |
| `cosmetic_equipped` | `category`, `item` | 보드/프로필 장착 처리 성공. 분류는 `skins`/`icons` |
| `skin_filter_changed` | `rarity`, `source` | 등급 필터 클릭. `all` 또는 카탈로그 등급 |
| `merge_previewed` | `skin`, `sound` | 합성 미리보기 시작. `sound`는 재생 가능·음소거·볼륨 조건상 소리가 켜져 있는지 표시 |
| `attendance_checked_in` | `unlocked` | 출석 요청 성공. 이번 요청에서 해금된 업적 수 |

매칭 모드는 `casual`/`ranked`, 경기 이벤트에는 `friend`도 포함한다. `queue_started`는 매칭 서버의 수락이나 매치 성사를 보장하지 않는다. `merge_previewed.sound=true` 역시 사용자가 실제 소리를 들었다는 증거는 아니다. 출석 이벤트 수는 고유 출석 계정 수와 다를 수 있다.

## 숫자 해석

- **사용 흐름:** `/find-match` 이동 → `queue_started` → `match_started` → `match_finished`를 같은 기간·모드로 비교한다. 개인 식별자를 보내지 않으므로 계정별 완전한 퍼널이나 정확한 사용자별 전환율은 아니다.
- **매칭 이탈:** `queue_cancel_clicked`를 매칭 시작 수와 함께 살핀다. 창 닫기·연결 오류는 취소 클릭에 포함되지 않는다. 대기 시간은 현재 관리자 Operations에서 확인하며 이 이벤트에 시간 속성을 추가하지 않았다.
- **꾸미기 관심:** `cosmetic_previewed`의 카탈로그 ID·화면별 횟수, 등급 필터, `cosmetic_equipped`를 비교한다. 상점 구매는 아직 이벤트로 수집하지 않는다.
- **게임 수:** `match_started`·`match_finished`는 **플레이어 브라우저 관점**이다. 한 경기에서 양쪽이 보내면 2건이 될 수 있고 한쪽만 받으면 1건일 수 있다. 단순히 2로 나눈 수를 실제 경기 수로 사용하지 않는다.

같은 탭에서 해당 경기의 시작·종료를 재수신할 때 중복을 억제한다. 다른 탭·기기까지 고유 경기를 보장하지 않는다. 실제 완료 경기 수, 승률, Elo와 공격 밸런스는 DB 기반 관리자 집계를 기준으로 한다. 클라이언트 이벤트는 임의 생성될 수도 있으므로 보상·결제·랭크 판정에 사용하지 않는다.

## 검증과 확장

2026-10-17 배포와 자동 테스트 159개·타입 검사·린트는 통과했다. 실제 운영 Vercel 대시보드에서도 Analytics 방문자 2명·페이지 조회 11회, `navigation_clicked`·`queue_started`·`match_started`·`match_finished` 이벤트와 익명화된 `/play/[id]` 경로를 확인했다. Speed Insights에는 성능 표본 8개가 수신됐다. 최초 검증 시점의 적은 표본이므로 대표 성능이나 장기 이용량을 판단하는 근거로 사용하지 않는다.

브라우저 DOM 검사에서 운영은 Analytics·Speed Insights SDK를 로드하고 staging은 두 SDK를 로드하지 않는 것도 확인했다.

- `pnpm test`에 [`analytics.test.ts`](../apps/web/tests/analytics.test.ts)가 포함된다. 운영 조건, 민감 URL 제거, 경로 제한, 경기 중복 억제, 저장소·전송 실패를 검사한다.
- [`analytics.browser.mjs`](../apps/web/tests/analytics.browser.mjs)는 `ANALYTICS_TEST_ORIGIN`의 실행 중인 웹을 사용한다. 기본값은 `http://[::1]:3001`, `ANALYTICS_EXPECT_ENABLED=true`이면 운영 빌드의 이벤트를 기대한다. 브라우저 검사는 Vercel 전송을 차단하고 SDK 호출만 관찰하므로 실제 대시보드 수신 검증과 구분한다.
- 배포 후 운영 페이지의 방문과 주요 클릭이 Vercel에 집계되는지, staging에서는 SDK가 로드되지 않는지 확인한다. 성능 표본과 대시보드 표시에는 시간이 걸릴 수 있다.

새 이벤트는 먼저 운영상 필요한 질문을 정한 뒤 기존 `Events` 타입에 고정된 속성만 추가한다. 사용자 입력을 그대로 속성이나 이벤트 이름으로 전달하지 않는다. 페이지 추가 시 허용 경로, URL 정리 테스트, 이 표를 함께 갱신한다.
