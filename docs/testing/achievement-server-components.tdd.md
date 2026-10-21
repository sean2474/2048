# Achievement server components and attendance actions

The journeys come from the request to render pages and skeletons on the server, with narrowly scoped client interactions and authenticated Server Actions.

- The server renders achievement totals, attendance records, reward cards and URL filters without waiting for browser JavaScript.
- A delayed progress read streams the server skeleton before the data resolves.
- Rendering only reads `achievement_state`; visiting after hydration uses the authenticated action to synchronize rewards and check in.
- Repeated requests do not create another attendance write after success. Failed synchronization/attendance remain retryable, and guests never mutate.
- Results and pending work stay associated with the authenticated account.

## RED evidence

`node --test apps/web/tests/achievement-server.test.mjs` failed against `origin/staging` because server HTML lacked `Permanently unlocked` and had no reward data. Commit `5a4df50` captures the reproducer before implementation.

The action browser test additionally reproduced a missing synchronization error notice: the read-only page had loaded, but failed synchronization did not provide a retry. The test timed out waiting for `Could not load achievement progress.` before the notice was added.

## Validation

| Guarantee | Test | Evidence |
| --- | --- | --- |
| Payload validation, guest rejection, read-only rendering service, mutation ordering, no repeated attendance, explicit errors, concurrent account isolation | `apps/web/tests/achievement-operations.test.ts` | 7 passing tests |
| Server HTML, URL filters, guest/account isolation, read recovery, streaming before read completion, zero render mutations | `apps/web/tests/achievement-server.test.mjs` | Passing loopback HTTP fixture |
| Single automatic Server Action, no browser mutation RPC, updated RSC cards, filter navigation, sync retry, check-in retry, guest behavior | `apps/web/tests/achievement-actions.browser.mjs` | 2 passing Playwright tests; three consecutive successful runs |

Commands:

- `pnpm --filter socket exec tsx --test --experimental-test-coverage ../web/tests/achievement-operations.test.ts`
- `node --test apps/web/tests/achievement-server.test.mjs`
- `node --test apps/web/tests/achievement-actions.browser.mjs` with the bundled Playwright package available through `NODE_PATH`.
- `pnpm exec tsc --noEmit --incremental false -p apps/web/tsconfig.json`
- Scoped ESLint for the achievement page, provider, action, loader, operation helper and interaction/skeleton components.

The operation helper measured 98.68% line, 97.40% branch and 95.65% function coverage. This is scoped service coverage, not an application-wide coverage claim. The browser capability/regression checks passed on the first final run and all three repeated final runs (pass@1 100%, pass@3 100%, three-run stability 100%). Server and browser fixtures use loopback services only; no production accounts or database mutations were used. The wider application build and integrated review belong to the parent boundary-refactor validation.
