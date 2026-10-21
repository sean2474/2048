import assert from "node:assert/strict";
import test from "node:test";
import { startServerFixture, fixturePlayer } from "./server-fixture.mjs";

test(
  "public provider seed recovers, shares no identity, and retains valid data during refresh failure",
  { timeout: 120000 },
  async (t) => {
    let fail = true,
      revision = 1,
      catalogReads = 0;
    const catalog = () => ({
      skins: ["published", "draft"].map((status) => ({
        id: status === "draft" ? "private-draft" : "public-seed",
        name: status === "draft" ? "Private draft marker" : `Public seed revision ${revision}`,
        description: "Public display definition",
        status,
        publishedOnce: status === "published",
        revision,
        updatedAt: "2026-10-01T00:00:00Z",
        sortOrder: 0,
        price: 0,
        acquisition: "free",
        rarity: "common",
        tokens: { boardBackground: "#ffffff", emptyBackground: "#ffffff", tileRadius: "1px" },
      })),
      profileIcons: [],
      achievements: [],
    });
    const fixture = await startServerFixture({
      handle: async (url, request, id) => {
        if (url.pathname.endsWith("/rpc/content_catalog")) {
          catalogReads++;
          assert.equal(id, null, "shared seed never forwards a user's JWT");
          assert.equal(request.headers.cookie, undefined);
          assert.equal(request.headers.authorization, "Bearer fixture-public-key");
          return fail
            ? { status: 503, data: { message: "fixture unavailable" } }
            : { data: catalog() };
        }
        if (url.pathname.endsWith("/player_wallets"))
          return { data: [{ player_id: id, balance: id === fixturePlayer ? 17 : 29 }] };
      },
    });
    t.after(fixture.close);
    const read = async (id) => {
      const cookie = fixture.cookie(id);
      const response = await fetch(fixture.origin + "/settings", {
        headers: {
          "accept-language": "en",
          ...(id ? { cookie: `${cookie.name}=${cookie.value}` } : {}),
        },
      });
      assert.equal(response.status, 200);
      return response.text();
    };
    assert.match(await read(fixturePlayer), /Could not load the collection/);
    assert.equal(catalogReads, 1);
    fail = false;
    assert.match(await read(fixturePlayer), /Public seed revision 1/);
    assert.equal(catalogReads, 2, "a failed cold read must not poison subsequent requests");
    for (const id of [undefined, fixturePlayer, "20000000-0000-4000-8000-000000000099"]) {
      const html = await read(id);
      assert.match(html, /Public seed revision 1/);
      assert.doesNotMatch(html, /private-draft|Private draft marker/);
      if (id) {
        const balance = id === fixturePlayer ? 17 : 29;
        assert.match(html, new RegExp(`aria-label="My loadout · ${balance} coins"`));
        assert.doesNotMatch(
          html,
          new RegExp(`aria-label="My loadout · ${balance === 17 ? 29 : 17} coins"`),
        );
      }
    }
    assert.equal(catalogReads, 2, "warm navigation reuses only the public definitions");
    assert.deepEqual(
      new Set(
        fixture.requests.filter((row) => row.path.endsWith("/player_wallets")).map((row) => row.id),
      ),
      new Set([fixturePlayer, "20000000-0000-4000-8000-000000000099"]),
    );
    await new Promise((resolve) => setTimeout(resolve, 31_000));
    fail = true;
    assert.match(await read(), /Public seed revision 1/);
    assert.equal(catalogReads, 3, "stale seed triggers a background refresh");
    fail = false;
    revision = 2;
    assert.match(await read(), /Public seed revision 1/);
    assert.equal(catalogReads, 4, "a failed refresh is retried");
    const recovered = await read();
    assert.match(recovered, /Public seed revision 2/);
    assert.doesNotMatch(recovered, /private-draft|Private draft marker/);
  },
);
