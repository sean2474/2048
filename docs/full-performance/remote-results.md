# 실제 배포 대전 측정

2026-10-17에 실제 배포된 웹·소켓을 독립된 게스트 브라우저 두 개로 측정했다. 요청 가로채기, 가상 DB, 지연 주입, 강제 보드/승패 변경은 사용하지 않았다. 공개/랭크 큐에 들어가지 않고 테스트용 비공개 친구방만 만들었다. 각 환경에서 데스크톱/모바일 에뮬레이션의 자연 종료와 항복을 한 번씩 측정했다. 자연 대전의 다수 입력은 같은 게임 안의 연속 관측이며 독립된 사용자 표본이 아니다.

| 환경 | 웹 배포 SHA | 소켓 빌드 SHA | 소켓 지역 |
|---|---|---|---|
| staging | 0b90df576e82f8642839f1f6c301efe6a8dbcbf7 | 0b90df576e82f8642839f1f6c301efe6a8dbcbf7 | nrt |
| production | dbdc654fecec148d493b1ab6df53fe9d247e7ad8 | 0b90df576e82f8642839f1f6c301efe6a8dbcbf7 | dfw |

지역과 배포 환경이 다르므로 staging과 production의 차이는 코드 최적화 전후 효과로 해석할 수 없다. 제품 코드는 로컬 최적화 측정 기준 a6327c1과 동일하다고 배포 담당이 확인했다. 배포 identity는 검증 후 공급된 값이며 harness가 클라우드 release를 자체 검증한 것은 아니다.

## 자연 종료 및 입력 반응

| 환경 / 화면 | 이동 수 | 플레이 시간 초 | 자기 상태 응답 중앙값 ms | 상대 상태 응답 중앙값 ms | 입력→화면 반영 중앙값 ms | 종료 이유 |
|---|---:|---:|---:|---:|---:|---|
| staging / desktop | 305 | 30.9 | 41.1 | 41.0 | 65.8 | opponent_locked |
| staging / mobile-emulation | 292 | 29.7 | 40.6 | 40.3 | 64.3 | opponent_locked |
| production / desktop | 450 | 98.5 | 200.2 | 183.1 | 220.0 | opponent_locked |
| production / mobile-emulation | 270 | 66.3 | 200.3 | 196.6 | 228.9 | opponent_locked |

자연 게임은 실제 서버 종료 조건까지 입력했다. 경기 길이는 무작위 타일·자동 입력 정책·네트워크에 따라 달라지며 사람의 평균 경기 시간이나 성능 개선 비율이 아니다. 소켓 응답은 브라우저 이벤트 관찰 비용을 포함한다. 화면 반영은 입력 이벤트부터 보드 DOM 변화 이후 두 animation frame까지다.

## 입장과 결과 연출

| 환경 / 화면 / 종료 | 시작→보드 DOM 확인 초 | 방 준비까지 초 | 코드 참가 요청→방 준비 ms | 방 준비→플레이 시작 초 | 종료→오버레이 DOM 확인 ms | 종료→연출 완료 확인 ms | 항복 패킷→종료 패킷 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| staging / desktop / natural | 6.9 | 3.4 | 92.7 | 3.6 | 14.5 | 1067.8 | — |
| staging / desktop / surrender | 6.0 | 2.6 | 91.2 | 3.4 | 12.2 | 1057.0 | 37.5 |
| staging / mobile-emulation / natural | 5.5 | 2.1 | 91.9 | 3.4 | 19.1 | 1052.5 | — |
| staging / mobile-emulation / surrender | 5.6 | 2.2 | 54.9 | 3.4 | 11.6 | 1071.9 | 39.9 |
| production / desktop / natural | 9.1 | 4.9 | 354.0 | 4.2 | 13.0 | 1059.9 | — |
| production / desktop / surrender | 9.3 | 5.2 | 386.5 | 4.1 | 11.2 | 1052.4 | 171.5 |
| production / mobile-emulation / natural | 9.1 | 5.0 | 335.4 | 4.1 | 14.9 | 1056.7 | — |
| production / mobile-emulation / surrender | 8.7 | 4.6 | 370.7 | 4.1 | 1.9 | 1038.8 | 168.9 |

입장 전체 시간은 첫 브라우저의 방 생성 페이지 이동, 코드 확인, 두 번째 브라우저의 참가 페이지 이동과 제출, 소개 연출, 게임 화면 진입을 포함한다. 소개 연출 자체는 의도된 3.2초이고 실제 전송·입장 비용이 더해진다. 따라서 이 합계를 단일 페이지 로딩이나 서버 지연이라고 부르지 않는다. 게스트 브라우저 패킷에는 정확한 서버 방 시작/종료 기록이 없어 roomWallDurationMs는 null이다. 결과 연출 완료는 유한 CSS animation 종료와 두 animation frame 이후 관측한 상한이며 스크린샷은 그 뒤 촬영했다.

## 검증과 재실행 기록

staging은 최초 실행의 4개 시나리오 모두 통과했다. production은 최초 3개가 통과했고 desktop:natural은 참가 페이지의 숨겨진 스트리밍 DOM까지 CSS locator가 선택해 strict-selector 오류가 발생했다. 제품 코드는 수정하지 않았다. 입력과 제출 버튼을 visible 요소로 좁힌 뒤 해당 시나리오 하나만 재실행하여 통과했다.

최초 실패 원본은 [production initial-attempt.json](remote-production/initial-attempt.json), 제한된 재실행은 [production retry](remote-production-retry/raw.json)에 그대로 보존했다. [최종 production 원본](remote-production/raw.json)은 처음 통과한 3개와 재실행 1개를 합치고 그 이력을 provenance에 명시했다. [staging 원본](remote-staging/raw.json)도 보존한다. 당시 최종 결과 스크린샷은 2026-10-23 산출물 정리 후 [정리 전 Git 기록](https://github.com/sean2474/2048/tree/46d8e38d1fb95e15aac8780cc0b81aeacd6c2363/docs/full-performance)에서 확인할 수 있다.

이 측정은 로그인 계정·랭크 저장·재접속 검사와 별개다. 해당 흐름은 배포 smoke 테스트에서 검증한다. 실제 휴대폰, 다양한 ISP, 장기간의 현장 성능 분포는 측정하지 않았다. 정상 게스트 대전 기록은 배포 서버에 남을 수 있으며 삭제 작업은 수행하지 않았다.
