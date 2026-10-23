# 2048 Duo administration — design contract

Purpose: inspect match balance and manage account access from a separately deployed admin application. Administrators need to scan telemetry coverage before interpreting attack performance and confirm a player identity before changing access.

Direction: quiet operational console in the same warm tabletop family as the game, as specified in `../../docs/ui-redesign-contract.md`. A 224px desktop navigation rail separates global navigation from the data workspace. Mobile uses a compact header and a modal sidebar drawer. The menu closes on route changes, Escape, its close button or a backdrop click; the native dialog keeps keyboard focus inside while open. The distinguishing detail is the square 2048 mark, restrained terracotta active navigation, olive secondary signals, and tabular numeric data. No hero area or nested cards.

Local reference: the first separated admin was usable but visually flat: equal-weight KPI cards, bare table values and isolated text errors. Use shared Button/AlertDialog primitives, 44px minimum controls, 8/16/24/32px spacing, 24px panel padding and 16px table-cell padding. The console uses warm ivory #f6f3eb, ink #282b28, terracotta #a4432d, olive #52634b, white panels, #e3dfd5 borders and #676c60 secondary text. Panels have 12–20px corners and subtle shadows; labels use 10–11px tracked text. Tier, mode, result and account status remain text-labelled pill badges, never color alone.

Hierarchy: page title and utility action; period/mode toolbar; four primary KPI panels followed by a quieter strip of four existing supplementary metrics; attack table; secondary distributions. Player detail prioritizes account identity and status, then access control, history and audit. Login, loading, empty, error and denied-access screens use the same panel/field/type treatment. No RPC, authentication, data source or metric changes are part of this visual pass.

Targets: 375x812, 768x1024 and 1440x900. Desktop content has a maximum width of 1280px. At 375px, toolbars wrap, metrics use two columns, and data tables scroll within their own regions without widening the page. Long names, emails and reasons wrap or truncate with their complete data still available in detail.

States:
- Loading: stable navigation remains; a status message announces the pending query. Refresh and mutations cannot overlap.
- Empty: explicitly state no matching matches/players/telemetry; retain filters and navigation.
- Error: query errors offer Refresh/Search; login errors permit retry. Uncertain mutations require reloading before another attempt.
- Partial: historical missing telemetry is “Not measured,” separate from measured zero. Attack percentages show sample counts and a correlation caveat.
- Success: show audit-confirmed access outcome, reload details, and return keyboard focus to a persistent control.
- Permission: guest receives a dedicated admin sign-in path; an authenticated non-admin sees access denied and sign-out. Administrators complete TOTP enrollment or verification at `/mfa` before entering the console. RPCs independently enforce membership and the `aal2` session requirement.

Accessibility: visible focus rings, semantic tables with captions and headings, explicit field labels, live status/error messages, keyboard-operable confirmation with restored focus, and reduced-motion support. No external image or chart assets are needed for this data workflow.

Localization: Korean is the default; English is available from the login, console, permission and authentication-error screens. The shared `duo.locale` cookie drives server rendering and the client provider. Text, accessible labels, error/success messages, tiers, modes and result labels are translated; numeric/date displays use the selected locale, while daily buckets retain Korea time. Account names, email addresses, IDs and written moderation reasons are never translated. Switching language preserves filters, drafts and pending requests. In the initial UI pass, the 182-entry catalog passed static key/placeholder checks; direct login responses passed default Korean, English cookie and invalid-cookie fallback assertions. Rendered language switching and narrow layouts must be checked for changed screens.

Historical verification: the initial 182-entry locale check and disposable-account browser checks described above belong to the original UI pass. Follow [administrator QA](../../docs/browser-qa.md), [UI evidence](../../docs/ui-refresh/report.md) and the [current admin guide](../../docs/admin.md) for later coverage. This document does not assert that every later screen or deployment was re-tested.
