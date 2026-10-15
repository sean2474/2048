# 설정·게임 화면 최종 검증

2026-10-16, 로컬 게임 3001 / 관리자 3100 / 소켓 4000.

- 전체 `pnpm typecheck`, `pnpm lint`, `pnpm test` 통과: socket/schema/UI설정/DB 테스트 73개 + 공통 locale 테스트 2개 = **75개**.
- `pnpm build`로 게임 웹과 관리자 프로덕션 빌드 성공.
- 마이그레이션 파일명을 실제 원격 이력과 맞춘 뒤 wallet/preferences/account-deletion 14개를 재검증했다. 삭제 HTTP UTF-8 수신 보완 후 account-deletion 4개 재검증도 성공했다.
- React·보안·최종 통합 코드 리뷰에서 남은 차단 사항 없음. 설정 로딩 중 문자 단축키가 켜지는 문제, 삭제 응답이 다른 계정의 로그아웃을 유발할 수 있는 문제, 대기 매칭과 삭제의 경합을 수정하고 검증했다.
- `git diff --check` 통과. 새 런타임 의존성을 추가하지 않았다.

## 실제 Supabase 검증

- 지갑: 본인 잔액 0 조회, 타 계정 잔액 미노출, 클라이언트 차감·증액 거부.
- 설정: 본인 행 생성·조회, 다른 계정 행 접근 차단, 잘못된 locale 및 타 계정 ID 쓰기 거부.
- 새 임시 가입자에게 지갑 0 자동 생성.
- 별도 임시 계정으로 삭제 HTTP API 성공: 전역 세션 해제, Auth 계정·프로필·지갑·설정 삭제, 과거 참가자 이름 `Deleted player` 익명화, 상대방 기록 보존 확인.
- 마이그레이션 8개가 원격 적용됐고 로컬 파일 버전을 원격 이력과 맞췄다. 새 wallet/preferences/lifecycle 관련 보안 진단 항목은 없었다.
- 최종 QA 후 임시 계정 4개와 지정된 테스트 경기 8개를 정리하고 개인 임시 자격증명 파일을 삭제했다. 기존 실제 관리자 계정은 보존됐음을 확인했다.

기존 진단 항목은 유지된다: 직접 접근을 막기 위한 관리자 테이블의 [RLS 무정책 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), 내부 관리자 검사로 보호하는 RPC의 [SECURITY DEFINER 실행 안내](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [유출 비밀번호 보호 비활성화](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). 기존 Socket.IO 하위 의존성의 보안 업데이트는 이번 UI/설정 변경에서 수행하지 않았다.

## 브라우저 증거와 한계

[QA 보고서](report.md)와 [렌더링 측정](rendered-evidence.json)을 참고한다. 테스트는 격리된 브라우저와 임시 계정만 사용했다.

최신 브라우저 QA는 게스트 쿠키→계정 DB 우선→독립 세션 재로그인→로그아웃 시 게스트 복원, 닉네임 검증과 헤더/순위 반영, 삭제 확인창과 실제 QA 계정 삭제를 포함한다. 최신 5단계 튜토리얼과 이동 없는 4회 연속 공격, 새 게스트 대전의 동기화·기권, 320/375/768/1440px 대전 배치도 확인했다. 모바일 튜토리얼은 안내문을 읽기 위해 세로 스크롤을 허용한다.

`evidence-check.json`을 frontend-design-direction 검사기로 실행했으며 접근성 전체 pass 요건은 충족하지 못했다. 사용자가 명시적으로 복원한 원본 숫자 타일의 일부 색상 대비가 기준에 못 미치기 때문에 `partial`로 기록했다. 키보드·포커스·레이블·주요 조작 대상 크기 관찰을 전체 WCAG 인증으로 확대하지 않는다. 스크린리더, 실제 휴대폰, OS의 동작 줄이기 모드, 운영 배포는 검증하지 않았다.
