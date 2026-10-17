# Coin shop

Common skins (Classic, Slate, Paper, Charcoal, Espresso) and the default Ember Fox profile icon are included with an account. Guests retain Classic and the guest icon. Achievement cosmetics keep their existing unlock conditions.

| Item | Coins |
| --- | ---: |
| Rare skin | 300 |
| Epic skin | 600 |
| Legendary skin | 1,200 |
| Owl, Dragon, Cat, Rabbit or Robot profile icon | 150 |

The shop shows included, owned and locked items. A successful purchase updates the balance and ownership immediately; equipping remains in My loadout.

`purchase_cosmetic` chooses the authenticated purchaser and database price. It locks that player's wallet, checks duplicate ownership, then charges coins and records ownership in one transaction. Retries of a completed purchase do not charge again. Clients cannot write wallets or purchase records directly. Preferences reject unowned paid equipment; Socket.IO accepts common skins or the account's server-resolved equipped skin.

The migration resets previously free, now-paid equipped items to Classic/Ember Fox. It preserves other preferences, common skins and earned achievement cosmetics. Apply the migration before deploying the web and socket changes. The purchase trigger is separate from the achievement trigger, including solo reward extensions.

Validation includes catalog/DB parity, RLS, insufficient funds, duplicate retries, rollback, account deletion, maximum safe balances, purchase/equip browser flows, account switches, and 320–1440px layouts. `apps/socket/tests/cosmetic-remote-smoke.ts` additionally exercises concurrent HTTP RPC calls on staging using disposable accounts and a temporary operator-seeded wallet; it refuses production and cleans up its fixtures.

Coin earning is not implemented by this change: accounts with a zero balance cannot buy paid items. Purchases use in-game coins only; there is no real-money payment flow. Physical phones and Safari have not been tested.
