# Browser QA — 2026-10-16 (Asia/Seoul)

> 2026-10-16 관리자 QA 기록이다. 후속 기능과 검증 경로는 [관리자](admin.md)·[기능 확장](feature-expansion-2026-10-17.md)·[카탈로그](content-catalog.md)에 있다.

Local public app: `http://localhost:3001`. Local admin app: `http://localhost:3100`. Chrome DevTools, separate disposable browser contexts. No real user session or account was changed.

## Design direction and public UI changes

Purpose: make account entry and match selection compact, readable, and predictable for returning players and first-time mobile players. Keep the cream background, warm brown actions, and real 2048 board as the home focal point. Existing components and routes remain in use; no new features or dependencies.

- Login/signup: single form card; 24px mobile / 32px desktop padding; 8px label gap; 16px between fields; 44px inputs and submit action; explicit focus treatment.
- Home: 32px content gap / 48px desktop column gap, restrained heading size, compact 40px shared buttons. Match-selection choices are 48px high.
- Match lobby, friend create/join: consistent page spacing and grouped instructions/actions. Join code keeps a larger 64px input. How-to-play copy gets readable line height.
- Public Tailwind scans `packages/ui/src` after shared Button/AlertDialog extraction.

## Verified in the browser

| Journey | Evidence / result |
| --- | --- |
| Public signup | 1440×1000 and 375×812: page width equals viewport; 32px/24px card padding; all four inputs and submit 44px; labels have 8px gaps. Exact rendered measurements in `ui-spacing-rendered.json`. |
| Public home | 1200px desktop and 375px mobile: no horizontal overflow; board and menu remain readable; home actions measure 40px. |
| Login / friend join / ranked gate | 375px: no horizontal overflow; login inputs 44px; join label/code/action visible; guest ranked gate presents sign-in action. |
| Guest casual — separate contexts | Both clients reached room `5f18af3a-4be8-4793-89de-ca4c910038c2`; tile positions/values and score 4 matched after moves; surrender gave opposite win/loss states and casual replay links. |
| Guest friend — separate contexts | Host code accepted by second context; both reached room `397f8527-4d82-44a0-a781-67256115c266`; tile positions/values and score 4 synced; surrender and friend replay links correct. |
| Admin authentication | Guest redirected to login. Disposable administrator reached overview. Disposable non-admin received “Administrator access required,” with no overview navigation. Sign-out returned to login. |
| Admin filters | Last 7 days + Friend returned 1 completed match; Refresh retained both filter selections. |
| Admin player operation | Searched only Player QA, verified one matching account, opened its detail. Suspended then restored only disposable fixture `7a1444db-3ee3-4484-97dc-bb8b56d9d4e2`; final status Active; both reasons and audit entries displayed. |
| Admin confirmation focus | 375px dialog fits viewport (343px width, x=16); initial focus Cancel; Escape closes dialog and restores focus to Refresh. |
| Cross-app session separation | Same disposable administrator logged into both apps. Public logout removed only the public cookie; admin page reload and detail RPC still succeeded. Admin logout removed only the admin cookie; public page reload remained signed in. This checked reloads, not forced refresh-token expiry. |
| Admin responsive overview | 1440px, 768px, and 375px: document width equals viewport. At 375px, attack table scrolls within its container; dashboard cards wrap into two columns. |

Public login/signup and admin operation pages had no console errors after the final dev restart. A temporary stale server/client class mismatch during hot editing disappeared after that restart. Final validation passed: 50 automated tests, root typecheck/lint, and production builds for both web and admin. Production route output contains no game `/admin` route; the admin routes belong to the standalone app.

## Evidence and limits

Desktop/mobile screenshots were visually inspected inline. File export was rejected by the browser tool for both a temporary path and the declared visualizations directory; no workaround was used, and there are no saved screenshot paths to report. Sanitized rendered DOM measurements are saved in `ui-spacing-rendered.json`.

No committed visual baseline exists, so visual regression status is INCONCLUSIVE. No formal design-checker pass is claimed. Axe, screen-reader testing, performance/Core Web Vitals, dark mode, and real mobile hardware were not checked. No new-account signup was submitted. The full attack-charging journey was verified earlier, not repeated during this spacing pass.

The local evidence checker was run on `ui-design-evidence.json`; it correctly returned incomplete for the full accessibility gate and deliberately unexercised loading, empty, error and partial-data states. Functional and responsive observations above do not imply those broader gates passed.

Cleanup completed: deleted the two exact QA matches above, both disposable users and their audit rows, and the private credential directory. Follow-up database queries confirmed no fixture players or matches remain. The designated real administrator account was preserved.
