# Coin shop

Common skins (Classic, Slate, Paper, Charcoal, Espresso) and the default Ember Fox profile icon are included with an account. Guests retain Classic and the guest icon. Achievement cosmetics keep their existing unlock conditions.

Prices below are the initial catalog values. Administrators may edit published prices; the live DB catalog is authoritative. See [Content catalog](content-catalog.md).

| Item | Initial coins |
| --- | ---: |
| Rare skin | 300 |
| Epic skin | 600 |
| Legendary skin | 1,200 |
| Owl, Dragon, Cat, Rabbit or Robot profile icon | 150 |

The shop shows included, owned and locked items. A successful purchase updates the balance and ownership immediately; equipping remains in My loadout.

`purchase_cosmetic(p_kind, p_item_id, p_expected_price)` chooses the authenticated purchaser and reads the database price. It locks the catalog entry and the player's wallet, checks ownership and the confirmed price, then charges coins and records ownership in one transaction. A changed price is rejected before charging so the user can confirm it again. Retries of a completed purchase do not charge again. Clients cannot write wallets or purchase records directly. Preferences reject unowned paid equipment; Socket.IO accepts common skins or the account's server-resolved equipped skin.

The initial purchase migration reset previously free, now-paid equipped items to Classic/Ember Fox. It preserves other preferences, common skins and earned achievement cosmetics. Apply the migration before deploying the web and socket changes. The purchase trigger is separate from the achievement trigger, including solo reward extensions.

Validation includes catalog/DB parity, RLS, insufficient funds, duplicate retries, rollback, account deletion, maximum safe balances, purchase/equip browser flows, account switches, and 320–1440px layouts. `apps/socket/tests/cosmetic-remote-smoke.ts` additionally exercises concurrent HTTP RPC calls on staging using disposable accounts and a temporary operator-seeded wallet; it refuses production and cleans up its fixtures.

코인은 대시보드의 [일일 퀘스트](daily-quests.md)에서 출석 20·유효 대전 3판 60·1승 40코인, 한국 시간 하루 최대 120코인을 얻는다. 잔액이 부족하면 구매할 수 없다. 상점은 게임 내 코인만 사용하며 실물 결제는 없다. 실제 휴대폰과 Safari는 검증하지 않았다.

## 코인 거래 내역

`20261017190000_coin_ledger.sql`부터 모든 지갑 변동은 `private.apply_coin_change()`를 거쳐 `coin_transactions`에 한 행씩 남는다. 행에는 변동량, 변동 후 잔액, 사유(`daily_quest`, `purchase`, `admin_grant`, `admin_deduct`), 참조(구매 품목 또는 퀘스트 날짜·ID), 처리 관리자 ID와 메모가 들어간다. 잔액 갱신과 기록은 같은 트랜잭션이며 지갑 행 잠금을 공유하므로 동시 구매·지급에서도 마지막 행의 변동 후 잔액이 지갑과 일치한다.

- 사용자는 RLS로 자신의 거래만 읽고 쓸 수 없다. `/shop`의 **최근 코인 내역**은 최신 8건을 보여 주며 구매·보상 뒤 자동 갱신한다.
- 운영자는 관리자 사용자 상세에서 잔액과 최근 20건을 보고 사유를 기록해 지급·차감한다. [관리자 코인 지급·차감](admin.md#코인-지급차감)
- 경기당 코인 지급은 여전히 없다. 거래 내역은 계정 삭제 시 함께 삭제된다.
- 검증: `apps/socket/tests/coin-ledger.test.ts`(퀘스트·구매 기록, RLS, 관리자 지급·차감 경계, 잔액 일치, 계정 삭제).
