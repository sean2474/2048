# Public UI and admin browser QA

> 2026-10-16 UI 작업의 검증 스냅샷이다. 아래 무료 장비·예정 능력·수동 공격과 테스트 수는 당시 상태다. 현재 [게임](../game-design.md)·[설정](../settings.md)·[꾸미기](../loadout-and-economy.md)를 따른다.

Date: 2026-10-16. Local web `localhost:3001`, admin `localhost:3100`, socket `localhost:4000`. Chrome isolated contexts only; no user tabs or user accounts changed. This report records the verified UI revisions; newer settings and rule changes awaiting validation are listed at the end.

## Verified journeys

- Signed dashboard displays fixture Gold 1,216, explicitly ranked 1 win / 0 losses / 0 draws, and its last three matches. Guest dashboard shows Guest with no fabricated statistics. Empty account displays Unrated and no completed matches.
- Korean is the default. Dashboard and history show Korean labels and Korean dates; changing to English updates labels and date format while retaining rating/history. A failed-login error changes between Korean and English without resubmitting.
- Friend waiting room retained exactly the same room code while switching English to Korean; the waiting status translated. The room was subsequently cancelled.
- Animation has six running CSS animations. Pause changed every animation to `paused` and all transforms remained equal after 400 ms. Play resumed running and transform changes.
- Casual game `80deacaa-0465-4946-8ee5-cd9a68eaf30c`: two isolated guest contexts reached the same room; both moved; each opponent board matched the other player's board; surrender produced reciprocal win/loss results.
- Friend game `d124aa4e-e590-4226-aa9b-0ab4426c56ae`: host code/join linked two isolated contexts; reciprocal board synchronization and surrender results passed. Both games ended and IDs were provided for fixture cleanup.
- Invalid friend code displayed a retryable room-unavailable error. Signup password mismatch and failed login displayed errors. Successful fixture login, ranked guest gate, match history and leaderboard data were checked.
- Admin: authenticated administrator reached overview, ordinary fixture account was denied; filters, fixture-only player search/detail, no-result search, and partial telemetry (including unmeasured historical matches) rendered. Suspend confirmation opened with Cancel focus; Escape closed it and restored focus. No suspension write occurred in this styling pass.

## Responsive observations

- 375 × 812: dashboard empty/guest, history, find-match, login and signup had document width 375. Header navigation wraps below the account row; compact wordmark keeps guest login/language controls visible. Form inputs are 48 px high; principal controls are at least 44 px high. Some short text links are less than 44 px wide but exceed the WCAG 24 px target-size minimum.
- 768 × 1024: empty dashboard and find-match fit the viewport. Dashboard uses profile and 320 px illustration columns; content wraps naturally. Admin table uses a labelled internal scrolling region.
- 1440 × 900: signed dashboard shows profile, decorative duel, and three recent matches; screenshot inspected inline. Desktop find-match uses illustration/menu columns.
- 692 × 900 regression: all English header navigation links are visible on the second row; document width is 692. This replaces the previously clipped single-row navigation.
- Short mode dialog at 375 × 400: 343 × 368 dialog, scrollHeight 544 / clientHeight 366, vertical scrolling enabled; Escape restores trigger focus. The modal is no longer a home entry point, but remains bounded when used.

## Evidence and limits

[Rendered DOM measurements](rendered-evidence.json) contain actual browser outputs. Some earlier find-match/leaderboard observations explicitly record a stale development translation bundle (only game dictionary strings translated); these observations are not passes. The subsequent restart and recheck are recorded below. Inline screenshots were inspected, but connector file export to the workspace was denied; no screenshot-file baseline or pixel-diff comparison is available.

No axe scan, screen reader session, performance benchmark, email confirmation flow, real Google OAuth, or payment/purchase flow was performed. Reduced-motion CSS was inspected in source; rendered OS reduced-motion preference was not emulated. Original classic numeric tile colors were restored at the user's request; no blanket contrast-compliance claim is made.

## Subsequent checks: localization, loadout, game layout

- Restart resolved the stale translation bundle. Find-match and leaderboard subsequently rendered complete Korean text. Failed-login and signup-mismatch errors switch/appear correctly in Korean; English labels and locale-specific dates were verified.
- Final requested header behavior: guest has no coin badge; signed-in coin balance is outside navigation, immediately next to the avatar. Settings navigation remains accessible to guests. Admin navigation is absent. At 320, 375, 692 and 1440 px the coin/auth controls stay inside the viewport. The newly added settings error popover has a 320 px exception described below.
- Public sign-out left the separately authenticated admin session usable after reload. Admin sign-out left the public fixture session usable after reload.
- Loadout: actual authenticated wallet balance 0 appears in the page and header. Before migration, errors showed a retry control and header ‘—’; errors were not converted into a zero balance. Guest wallet prompts sign-in. All three skins are free and the coin shop is disabled. All ten ability concepts explicitly have no battle effect.
- Initial browser persistence passed: Slate/opponent-shuffle survive reload; clear selection and changes synchronize across two tabs; invalid JSON/unknown registry IDs safely become Classic/no ability. A temporary test-only failure of `Storage.setItem` for `duo.loadout` showed an error and preserved Paper/opponent-shuffle across SPA navigation; the injected failure was immediately removed. These checks cover the initial implementation; DB/cookie persistence replacing it remains to be validated.
- Tutorial completed through real local engine moves: 2+2→4, 128+128→256 with X ticket 1, then key 1 sends the attack, leaves X ticket 0 and adds X to the practice opponent board. Focus advances to Next and finally Find match. Restart restored the initial board. English/Korean and widths 375, 768, 1440 were checked. A subsequent tutorial layout revision reuses the match screen; its full journey is pending a fresh pass.
- New casual match `dd5b4cea-f8a5-46f9-940b-412aa58fc288` paired an isolated guest with a disposable signed-in fixture. Both moved and reciprocal board state matched. Q was bound to Move up; a duplicate Q binding was rejected, the saved binding survived reload and moved the board. Turning custom shortcuts off, then blurring the checkbox, disabled A while ArrowRight still moved/merged. Surrender produced reciprocal loss/win and the room ended.
- Latest match screen fit 320×740, 375×812, 768×1024 and 1440×900: document width/height equaled viewport dimensions; toolbar, both boards, three-slot attack stacks and direction controls stayed visible. Slate applied to actual BoardView (`rgb(129,139,153)`); another browser retained Classic (`rgb(203,197,182)`). Mobile opponent preview is intentionally 88 px. A 320 px tile-position measurement taken during resize animation was followed by a stable check with all tiles inside their cells.

Remaining: new DB/cookie settings migration and settings-page save/error flows, final match-screen tutorial revision, and later attackReady rule removal require their own verification. During in-progress settings integration the authenticated account settings request failed; its shared LanguageSwitcher Retry control was at x=-46..-1 in a 320 px header. This was reported to root for the owning worker to contain the error control within the viewport. No pass is claimed for that error layout.

Cleanup match IDs for this redesign pass: `80deacaa-0465-4946-8ee5-cd9a68eaf30c`, `d124aa4e-e590-4226-aa9b-0ab4426c56ae`, `dd5b4cea-f8a5-46f9-940b-412aa58fc288`. All ended. Root owns fixture cleanup.

## Final settings, profile and tutorial pass

This pass supersedes the earlier pending DB/cookie and tutorial notes. It used three new isolated contexts after the settings and deletion migrations and server restart. Evidence: [settings and game measurements](settings-rendered-evidence.json), [settings error measurements](settings-error-evidence.json). Fixture emails, passwords and authentication tokens are excluded from these artifacts.

- **Current persistence policy:** signed-in preferences use the account database; guests use the `duo.guest-settings` cookie. Locale, keybindings, custom-shortcut enablement, board skin and planned ability selection share the settings provider. Existing account settings take precedence over guest choices. This replaces the earlier localStorage implementation; its older tests above are historical.
- Guest English / Move up Q / Slate / custom shortcuts off survived route navigation and a full reload. The saved cookie contained those exact values. Logging into the regular disposable account loaded its existing Korean / W / Classic / shortcuts on values instead. After saving English / E / Paper / shortcuts off to that account, a second, independently authenticated browser context loaded all four values. Logout in the first browser restored its original English / Q / Slate / shortcuts off guest choices. No account preferences appeared in the guest cookie.
- A temporary exception on **only guest-settings cookie writes** produced a visible save error without changing the selected setting. Native cookie access was restored immediately. Retry cleared the error. Error cards and Retry controls stayed inside the horizontal viewport at 320, 375, 768 and 1440 px. The old negative-x header Retry defect is resolved. At small widths the two shared LanguageSwitcher error cards overlap at the same bounded fixed position; the settings panel also exposes its own error and Retry control.
- Settings normal pages had no horizontal overflow at all four widths. Controls measured 44 px high or more; text inputs measured 50 px high. At 320/375 px the page intentionally scrolls vertically. Desktop and tablet retain a readable constrained form column.
- Regular fixture nickname validation counted Unicode code points: 33 emoji were invalid and disabled Save. The email field was readonly. Saving `  QA설정검증  ` removed the outer spaces, showed the six-character nickname, and updated both the header and ranked leaderboard. The regular fixture was retained for root cleanup.
- **Only the explicitly designated empty fixture was deleted.** An incorrect confirmation email kept Delete disabled. Cancel closed the dialog and restored focus to its trigger. At 375×812, the confirmation dialog measured 343×612 and fit the viewport. Entering the matching fixture email enabled confirmation; the real deletion endpoint succeeded and the page returned to `/` as a guest with the Login link and no deletion error. No real user account was edited or deleted.
- The guest-settings CTA initially rendered `Sign in` in Korean because of the stale dev bundle. After the final build and server restart, a new isolated guest context verified `lang=ko`, the translated guest section, and CTA text `로그인` linking to `/login`. This remaining translation check is resolved; the verification tab was closed.

### Latest five-step tutorial

The final implementation has **five** steps, not the earlier three/four: Controls, X block, Hard block, Incoming blocks, Save & send. All five were completed through actual UI actions:

1. ArrowLeft merged two 2 tiles into 4; focus moved to Next.
2. Merging two 128 tiles charged one X ticket; clicking X depleted it and placed a movable X on the practice opponent's next move.
3. Merging two 256 tiles charged a hard ticket; clicking it placed a fixed hard block on the opponent.
4. A left move received X and hard obstacles. Moving down moved X from row 1 / column 1 to row 4 / column 1, while hard stayed at row 1 / column 2.
5. One merge charged two X and two hard tickets. Four consecutive attack clicks, with **no movement between them**, depleted all four tickets and placed all four obstacles on one opponent move. The final Find match link targeted `/find-match` and received focus. Restart this step restored its lesson board and zero tickets.

English/Korean text and current shortcut-off instructions were checked. The tutorial fits horizontally at 375, 768 and 1440 px. At 768×1024 and 1440×900 its page height equals the viewport. The longer 375 px coach card and battlefield need vertical scrolling (Korean step five measured page height 956 on an 812 px viewport); the relevant buttons remain reachable. Screenshot was inspected inline; this is an observed mobile layout behavior, not a no-scroll claim. The user-facing match itself retains its no-scroll layout.

### Final online smoke

Guest match **`8aeeb115-6b70-4a41-bef9-e48db530a3da`** paired two new isolated guests. Moves from each browser appeared in the other browser's opponent board, with exact matching tile values and positions. With cookie-saved custom shortcuts off, A left the board unchanged and ArrowLeft made a valid move. Slate rendered as `rgb(129,139,153)` on the actual board. Reload caused by mobile viewport emulation resumed the same match. The game measured no page overflow at 320×740, 375×812, 768×1024 and 1440×900; the narrow layouts kept toolbar, attacks, main board, 88 px opponent preview and direction controls visible. Surrender produced reciprocal loss/win and correct replay/menu links. Both game tabs had no error/warning console messages in the final check.

This online pass was a short smoke and did not earn an attack ticket. Consecutive ticket use was verified in the five-step tutorial; server rule tests are reported separately by root. No claim is made here that new repeated-ticket behavior was exercised over a live WebSocket.

Root received the fourth ended guest match ID for cleanup. QA3 was deleted by the UI, and no further fixture use is needed. All owned browser tabs were closed after verification. Existing exclusions still apply: no axe/screen-reader/performance pass, no rendered reduced-motion emulation, and no screenshot-file baseline/pixel-diff comparison. Visual regression remains **INCONCLUSIVE** without a baseline; the listed interaction checks are verified individually.
