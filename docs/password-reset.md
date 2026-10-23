# 비밀번호 재설정

로그인의 **비밀번호를 잊으셨나요?** 링크에서 `/forgot-password`로 이동한다. 가입 여부와 무관하게 같은 완료 안내를 표시한다. 전송 제한·네트워크 오류는 이메일 존재 여부나 서버 오류 원문을 보여주지 않고 재시도를 안내한다.

## 인증 흐름

1. 재설정 전용 Supabase 클라이언트가 `resetPasswordForEmail`로 PKCE 재설정 이메일을 요청한다. 리디렉션 주소는 현재 출처의 `/auth/callback?type=recovery`로 고정된다. 전용 storage adapter는 PKCE verifier만 localStorage에 보관하고 인증 세션은 각 흐름의 메모리에만 둔다. 같은 브라우저의 새 탭에서도 이메일 링크를 열 수 있으며 기존 로그인 쿠키는 읽거나 수정하지 않는다.
2. 콜백은 코드만 고정 상대 경로 `/reset-password?recovery_code=…`로 전달해 접속한 브라우저 출처를 유지한다. 외부 `next` 값과 전달된 Host 헤더는 사용하지 않는다. 다른 쿼리 이름을 사용해 공통 클라이언트의 자동 코드 교환과 재설정 화면의 검증이 경합하지 않게 한다.
3. 재설정 화면은 코드를 주소창에서 즉시 제거하고 한 번 교환한다. 설치된 Supabase SDK가 PKCE verifier에 기록한 `PASSWORD_RECOVERY` 흐름인지 확인한 뒤 `getUser()`로 사용자를 다시 검증한다. 이 과정을 통과한 화면에서만 비밀번호 입력을 허용한다. 단순 로그인 세션만으로는 열리지 않는다.
4. 10자 이상·확인 일치 조건을 검사하고, 저장 직전에 복구한 사용자와 세션을 다시 검증한다. 검증 직후 다른 탭에서 메인 계정이 바뀌어도 변경 대상 계정은 바뀌지 않는다. `updateUser` 성공 후 복구한 계정의 전체 refresh token을 로그아웃 처리한다. 기존 메인 세션에는 로컬 로그아웃을 호출하지 않으므로 다른 계정의 로그인은 보존된다. 복구한 계정의 이미 발급된 access token은 만료 전까지 유효할 수 있다.
5. 로그아웃만 실패한 경우에는 비밀번호 변경 성공과 로그아웃 실패를 함께 표시한다. 비밀번호 저장이 실패했다고 잘못 안내하거나 다시 변경하지 않는다.

메일은 요청한 브라우저에서 열어야 한다. 링크 만료·사용 완료·새로고침으로 코드가 사라진 경우에는 새 링크를 요청한다. verifier는 자신이 읽거나 쓴 값과 현재 저장값이 일치할 때만 삭제하므로, 이전 흐름의 완료가 다른 탭에서 요청한 새 링크를 지우지 않는다. 성공한 코드를 재사용하지 않으며 비밀번호나 인증 토큰을 영구 저장하지 않는다.

## 운영 설정

Supabase Auth URL Configuration의 허용 리디렉션 목록에 실제 웹 출처의 `/auth/callback?type=recovery`를 등록한다. 개발 주소는 `http://[::1]:3001/auth/callback?type=recovery`다. 사이트 URL·기존 가입/소셜 로그인 콜백은 유지한다. 이메일 발송 설정과 전송 제한은 해당 Supabase 프로젝트에서 관리한다. 최신 운영 설정과 실제 메일 검증 결과는 [출시 점검 기록](launch-readiness.md)을 따른다.

공식 API 근거: [비밀번호 재설정 요청](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [PKCE 코드 교환](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession), [비밀번호 인증 흐름](https://supabase.com/docs/guides/auth/passwords). SDK의 `PASSWORD_RECOVERY` verifier 표시 확인은 현재 설치된 `@supabase/auth-js` 구현에 맞췄으며 SDK 업데이트 시 브라우저 회귀 테스트를 함께 실행한다.

## 검증

`apps/web/tests/password-reset.browser.mjs`는 로컬 웹과 실제 Chrome에서 다음 동작을 확인한다. 외부 Supabase 요청만 가상의 계정 응답으로 대체하므로 실제 이메일이나 계정 데이터는 읽거나 쓰지 않는다.

- 로그인 화면 진입점, 이메일만 입력하는 요청 화면, 연속 클릭 방지와 전송 대기 상태.
- 정상·없는 계정의 동일 안내, 전송 제한, 서버 원문 비노출.
- 코드 없음·만료·일반 로그인 코드 거부, 일회성 PKCE 교환과 주소창 코드 제거.
- 짧은 비밀번호·확인 불일치·유니코드 비밀번호, 이전 비밀번호 재사용 거부.
- 복구 세션 불일치·만료, 검증과 저장 사이 및 로그아웃 도중의 메인 계정 변경, 다른 계정의 세션 유지, 변경 성공 후 로그아웃 실패.
- 요청 탭과 이메일을 여는 탭 분리, 실제 요청에서 만든 PKCE verifier 교환, 사용한 이메일 링크 재열기 거부, 브라우저 출처 유지.
- 새로고침 재사용 거부, 외부 리디렉션 무시, 375·768·1440 너비에서 가로 넘침 없음.

2026-10-23 새 테스트 계정으로 실제 가입·복구 메일 수신, 운영 콜백, 비밀번호 변경과 새 비밀번호 로그인을 검증했다. 운영 Site URL과 Redirect URLs도 조회했다. 다만 기본 이메일 서비스의 수신자 제한을 해결할 사용자 소유 SMTP 연결과 외부 수신자 검증은 남아 있다. 공급자 측 PKCE 만료 시간과 실기기 조작도 이번 검사 범위 밖이다. [상세 결과와 남은 조건](launch-readiness.md)

`apps/socket/tests/password-recovery-storage.test.ts`는 verifier의 탭 간 공유, 인증 토큰의 메모리 격리, 메인 세션 보존, 저장 공간 차단, 이전 흐름의 정리가 최신 verifier를 삭제하지 않는 경계를 검증한다.
