import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PROFILE_ICONS } from "schema/profile-icons";
import { achievementForItem } from "schema/achievements";
import { SHOP_ITEMS } from "schema/economy";
import { ABILITIES, RETIRED_ABILITY_IDS, SKINS } from "schema/loadout";
import { DEFAULT_SETTINGS, isSettings, isSettingsPatch, parseGuestSettings, settingsFromRow, settingsToRow, SettingsStore, type Settings } from "../../web/src/lib/preferences";

const defaults = (): Settings => structuredClone(DEFAULT_SETTINGS);
type Storage = ConstructorParameters<typeof SettingsStore>[0];
function fixture(overrides: Partial<Storage> = {}) {
  let guest: Settings = { ...defaults(), locale: "en", skinId: "paper" };
  const accounts = new Map<string, Settings>();
  const mirrors: string[] = [];
  const patches: unknown[] = [];
  let seeds = 0;
  const storage: Storage = {
    readGuest: () => structuredClone(guest),
    writeGuest: next => { guest = structuredClone(next); },
    readAccount: async id => accounts.has(id) ? structuredClone(accounts.get(id)!) : null,
    seedAccount: async (id, settings) => { seeds++; if (!accounts.has(id)) accounts.set(id, structuredClone(settings)); },
    updateAccount: async (id, patch) => {
      patches.push(patch);
      const current = accounts.get(id);
      if (!current) throw new Error("Missing account");
      const next = { ...current, ...patch };
      accounts.set(id, next);
      return structuredClone(next);
    },
    mirrorLocale: locale => { mirrors.push(locale); },
    ...overrides,
  };
  const store = new SettingsStore(storage, () => {}, "ko");
  return { store, storage, accounts, mirrors, patches, guest: () => guest, seeds: () => seeds };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("preferences validate complete cookies, reject unknown values and map only changed database columns", () => {
  const settings = { ...defaults(), locale: "en" as const, abilityId: "frost-wave" as const };
  assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(settings))), { ...settings, abilityId: null });
  assert.deepEqual(settingsFromRow(settingsToRow(settings)), settings);
  assert.deepEqual(settingsToRow({ locale: "en" }), { locale: "en" });
  assert.deepEqual(settingsToRow({ abilityId: null }), { ability_id: null });
  for (const skin of SKINS) {
    const selected = { ...settings, skinId: skin.id };
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(selected))), { ...settings, abilityId: null });
    assert.deepEqual(settingsFromRow(settingsToRow(selected)), selected);
  }
  for (const icon of PROFILE_ICONS) {
    const selected = { ...settings, iconId: icon.id };
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(selected))), { ...settings, abilityId: null });
    assert.deepEqual(settingsFromRow(settingsToRow(selected)), selected);
  }
  for (const ability of ABILITIES) {
    const selected = { ...settings, abilityId: ability.id };
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(selected))), { ...settings, abilityId: null });
    assert.deepEqual(settingsFromRow(settingsToRow(selected)), selected);
  }
  for (const bad of [{ locale: "fr" }, { skinId: "unknown" }, { iconId: "../../../bad.svg" }, { abilityId: "unknown" }, { customShortcuts: "true" }, { keybindings: {} }, { coins: 999 }, { locale: undefined }]) assert.equal(isSettingsPatch(bad), false);
  for (const value of [null, [], {}, { ...settings, skinId: "unknown" }, { ...settings, keybindings: { ...settings.keybindings, up: "ArrowUp" } }]) {
    assert.equal(isSettings(value), false);
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(value))), DEFAULT_SETTINGS);
  }
  for (const raw of [undefined, "%broken", "bad-json"]) assert.deepEqual(parseGuestSettings(raw), DEFAULT_SETTINGS);
});

test("old guest cookies keep language and controls while restoring the fixed guest loadout", () => {
  const { iconId: _iconId, ...saved } = { ...defaults(), locale: "en" as const, skinId: "kitty" as const, customShortcuts: false };
  assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(saved))), { ...saved, skinId: "classic", iconId: "fox" });
  assert.deepEqual(settingsToRow({ iconId: "owl" }), { icon_id: "owl" });
});

test("retired ability previews preserve account cosmetics and guest language and controls", () => {
  for (const abilityId of RETIRED_ABILITY_IDS) {
    const saved = { ...defaults(), locale: "en" as const, skinId: "kitty" as const, customShortcuts: false, abilityId };
    const expected = { ...saved, abilityId: null };
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(saved))), { ...expected, skinId: "classic" });
    assert.deepEqual(settingsFromRow({ ...settingsToRow(expected), ability_id: abilityId }), expected);
    assert.equal(isSettingsPatch({ abilityId }), false);
  }
  assert.throws(() => settingsFromRow({ ...settingsToRow(defaults()), ability_id: "unknown" }), /Invalid saved settings/);
});

test("account settings win over guest cookies; partial saves preserve other fields and logout restores the guest", async () => {
  const f = fixture();
  const originalGuest = structuredClone(f.guest());
  f.accounts.set("A", { ...defaults(), skinId: "slate" });
  await f.store.load("A");
  assert.equal(f.store.state.scope, "account");
  assert.equal(f.store.state.settings.skinId, "slate");
  assert.equal(f.seeds(), 0);
  f.accounts.set("A", { ...f.accounts.get("A")!, abilityId: "frost-wave" });
  assert.equal(await f.store.save({ locale: "en" }), true);
  assert.deepEqual(f.patches, [{ locale: "en" }]);
  assert.equal(f.store.state.settings.abilityId, "frost-wave");
  assert.deepEqual(f.guest(), originalGuest);
  await f.store.load(null);
  assert.equal(f.store.state.scope, "guest");
  assert.deepEqual(f.store.state.settings, { ...originalGuest, skinId: "classic" });
  await f.store.load("A");
  assert.equal(f.store.state.settings.skinId, "slate");
  assert.equal(f.store.state.settings.abilityId, "frost-wave");
  assert.deepEqual(f.mirrors, ["ko", "en", "en", "en"]);
});

test("only a missing account row is seeded; an insert race keeps the existing database row", async () => {
  const f = fixture();
  await f.store.load("new");
  assert.deepEqual(f.accounts.get("new"), { ...f.guest(), skinId: "classic" });
  assert.equal(f.seeds(), 1);
  f.storage.writeGuest({ ...defaults(), skinId: "slate" });
  await f.store.load("new");
  assert.equal(f.store.state.settings.skinId, "classic");
  assert.equal(f.seeds(), 1);
  const race = fixture();
  race.storage.seedAccount = async id => { race.accounts.set(id, { ...defaults(), skinId: "slate" }); };
  await race.store.load("racer");
  assert.equal(race.store.state.settings.skinId, "slate");
});

test("late account loads and saves cannot change another account or logged-out guest settings", async () => {
  const read = deferred<Settings | null>();
  const f = fixture({ readAccount: id => id === "A" ? read.promise : Promise.resolve({ ...defaults(), skinId: "slate" }) });
  const oldLoad = f.store.load("A");
  await f.store.load("B");
  read.resolve({ ...defaults(), locale: "en", abilityId: "frost-wave" });
  await oldLoad;
  assert.equal(f.store.state.settings.skinId, "slate");
  assert.equal(f.store.state.settings.abilityId, null);
  const write = deferred<Settings>();
  f.storage.updateAccount = () => write.promise;
  const oldSave = f.store.save({ locale: "en" });
  assert.equal(f.store.state.saving, true);
  await f.store.load(null);
  write.resolve({ ...defaults(), locale: "en", skinId: "slate" });
  assert.equal(await oldSave, false);
  assert.deepEqual(f.store.state.settings, { ...f.guest(), skinId: "classic" });
  assert.equal(f.store.state.scope, "guest");
  assert.equal(f.store.state.saving, false);
});

test("guest changes merge against current cookies and failed writes do not claim success", async () => {
  const f = fixture();
  await f.store.load(null);
  f.storage.writeGuest({ ...f.guest(), locale: "ko", iconId: "dragon", abilityId: "swap-32" });
  assert.equal(await f.store.save({ customShortcuts: false }), true);
  assert.equal(f.store.state.settings.abilityId, null);
  assert.equal(f.store.state.settings.iconId, "fox");
  assert.equal(f.store.state.settings.skinId, "classic");
  assert.equal(f.store.state.settings.locale, "ko");
  assert.equal(f.guest().customShortcuts, false);
  const previous = structuredClone(f.store.state.settings);
  f.storage.writeGuest = () => { throw new Error("Cookies blocked"); };
  assert.equal(await f.store.save({ locale: "en" }), false);
  assert.deepEqual(f.store.state.settings, previous);
  assert.ok(f.store.state.error);
  assert.equal(f.store.state.saving, false);
});

test("guests cannot save loadout changes, while accounts can select every category", async () => {
  const f = fixture();
  await f.store.load(null);
  const previous = structuredClone(f.store.state.settings);
  const cookie = structuredClone(f.guest());
  for (const patch of [{ skinId: "slate" }, { iconId: "owl" }, { abilityId: "anchor-tile" }, { locale: "ko", skinId: "slate" }] as const) {
    assert.equal(await f.store.save(patch), false);
    assert.deepEqual(f.store.state.settings, previous);
    assert.deepEqual(f.guest(), cookie);
    assert.equal(f.store.state.error, "Log in to customize your loadout.");
  }
  await f.store.load("A");
  assert.equal(await f.store.save({ skinId: "slate", iconId: "owl", abilityId: "anchor-tile" }), true);
  assert.deepEqual(f.accounts.get("A"), { ...previous, skinId: "slate", iconId: "owl", abilityId: "anchor-tile" });
  await f.store.load(null);
  assert.deepEqual(f.store.state.settings, previous);
});

test("database failures stay visible and retryable without falling back to writable guest settings", async () => {
  const f = fixture({ readAccount: async () => { throw new Error("Offline"); } });
  await f.store.load("A");
  assert.equal(f.store.state.ready, false);
  assert.equal(f.store.state.scope, "account");
  assert.ok(f.store.state.error);
  assert.equal(await f.store.save({ locale: "en" }), false);
  assert.equal(f.seeds(), 0);
  f.storage.readAccount = async () => defaults();
  await f.store.retry();
  assert.equal(f.store.state.ready, true);
  assert.equal(f.store.state.error, null);
  f.storage.updateAccount = async () => { throw new Error("Offline"); };
  assert.equal(await f.store.save({ skinId: "slate" }), false);
  assert.equal(f.store.state.settings.skinId, "classic");
  assert.ok(f.store.state.error);
});

test("concurrent saves are disabled and failed locale mirroring does not report success", async () => {
  const write = deferred<Settings>();
  const f = fixture({ readAccount: async () => defaults(), updateAccount: () => write.promise });
  await f.store.load("A");
  const pending = f.store.save({ locale: "en" });
  assert.equal(await f.store.save({ skinId: "slate" }), false);
  f.storage.mirrorLocale = () => { throw new Error("Cookies blocked"); };
  write.resolve({ ...defaults(), locale: "en" });
  assert.equal(await pending, false);
  assert.equal(f.store.state.settings.locale, "en");
  assert.ok(f.store.state.error);
  assert.equal(f.store.state.saving, false);
});

test("preference RLS isolates accounts and SQL validates every client-controlled setting", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;`);
  const migrations = new URL("../../../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrations)).filter(file => file.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(file, migrations), "utf8"));
  const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
  await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
  assert.deepEqual((await db.query("select * from public.player_preferences")).rows, []);
  async function as(role: "anon" | "authenticated", id: string, action: () => Promise<void>) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    try { await action(); } finally { await db.exec("reset role"); }
  }
  await as("anon", "", async () => {
    await assert.rejects(db.query("select * from public.player_preferences"), /permission denied/);
    await assert.rejects(db.query("insert into public.player_preferences(player_id) values($1)", [A]), /permission denied/);
  });
  await as("authenticated", A, async () => {
    await db.query("insert into public.player_preferences(player_id,locale,skin_id) values($1,'en','paper')", [A]);
    await assert.rejects(db.query("insert into public.player_preferences(player_id) values($1)", [B]), /row-level security/);
    await db.query("insert into public.player_preferences(player_id,locale) values($1,'ko') on conflict(player_id) do nothing", [A]);
    await db.query("update public.player_preferences set ability_id='frost-wave' where player_id=$1", [A]);
    assert.deepEqual((await db.query("select player_id,locale,skin_id,ability_id from public.player_preferences")).rows, [{ player_id: A, locale: "en", skin_id: "paper", ability_id: "frost-wave" }]);
    for (const skin of SKINS) {
      if (achievementForItem("skin", skin.id)) {
        await assert.rejects(db.query("update public.player_preferences set skin_id=$1 where player_id=$2", [skin.id, A]), /Achievement required/);
        continue;
      }
      if (SHOP_ITEMS.some(item => item.kind === "skin" && item.id === skin.id && item.price > 0)) {
        await assert.rejects(db.query("update public.player_preferences set skin_id=$1 where player_id=$2", [skin.id, A]), /Purchase required/);
        continue;
      }
      await db.query("update public.player_preferences set skin_id=$1 where player_id=$2", [skin.id, A]);
      assert.deepEqual((await db.query("select skin_id from public.player_preferences")).rows, [{ skin_id: skin.id }]);
    }
    for (const ability of ABILITIES) {
      await db.query("update public.player_preferences set ability_id=$1 where player_id=$2", [ability.id, A]);
      assert.deepEqual((await db.query("select ability_id from public.player_preferences")).rows, [{ ability_id: ability.id }]);
    }
    for (const icon of PROFILE_ICONS) {
      if (achievementForItem("icon", icon.id)) {
        await assert.rejects(db.query("update public.player_preferences set icon_id=$1 where player_id=$2", [icon.id, A]), /Achievement required/);
        continue;
      }
      if (SHOP_ITEMS.some(item => item.kind === "icon" && item.id === icon.id && item.price > 0)) {
        await assert.rejects(db.query("update public.player_preferences set icon_id=$1 where player_id=$2", [icon.id, A]), /Purchase required/);
        continue;
      }
      await db.query("update public.player_preferences set icon_id=$1 where player_id=$2", [icon.id, A]);
      assert.deepEqual((await db.query("select icon_id from public.player_preferences")).rows, [{ icon_id: icon.id }]);
    }
    for (const [column, value] of [["icon_id", "unknown"], ["locale", "fr"], ["skin_id", "unknown"], ["ability_id", "unknown"]]) {
      await assert.rejects(db.query(`update public.player_preferences set ${column}=$1 where player_id=$2`, [value, A]), /check constraint/);
    }
    for (const bad of [null, [], {}, { ...DEFAULT_SETTINGS.keybindings, up: "KeyS" }, { ...DEFAULT_SETTINGS.keybindings, up: "ArrowUp" }, { ...DEFAULT_SETTINGS.keybindings, up: null }, { ...DEFAULT_SETTINGS.keybindings, extra: "KeyZ" }]) {
      await assert.rejects(db.query("update public.player_preferences set keybindings=$1::jsonb where player_id=$2", [JSON.stringify(bad), A]), /check constraint/);
    }
    await assert.rejects(db.query("update public.player_preferences set icon_id=null where player_id=$1", [A]), /not-null constraint/);
    await assert.rejects(db.query("update public.player_preferences set custom_shortcuts=null where player_id=$1", [A]), /not-null constraint/);
    await assert.rejects(db.query("update public.player_preferences set player_id=$1 where player_id=$2", [B, A]), /permission denied/);
    await assert.rejects(db.query("delete from public.player_preferences where player_id=$1", [A]), /permission denied/);
  });
  await as("authenticated", B, async () => {
    assert.deepEqual((await db.query("select * from public.player_preferences")).rows, []);
    assert.equal((await db.query("update public.player_preferences set locale='ko' where player_id=$1 returning *", [A])).rows.length, 0);
    await db.query("insert into public.player_preferences(player_id) values($1)", [B]);
  });
  await db.query("delete from auth.users where id=$1", [A]);
  assert.deepEqual((await db.query("select * from public.player_preferences where player_id=$1", [A])).rows, []);
  await as("authenticated", A, async () => {
    await assert.rejects(db.query("insert into public.player_preferences(player_id) values($1)", [A]), /foreign key constraint/);
  });
});

test("legacy account and guest bindings upgrade without losing saved keys or locale", () => {
  const old = { up: "Digit3", down: "KeyK", left: "KeyJ", right: "KeyL", xblock: "Digit1", hardblock: "Digit2" };
  for (const [bindings, expectedKeys] of [
    [old, { up: "Digit3", down: "KeyK", left: "KeyJ", right: "KeyL", ability: "Digit1" }],
    [{ ...old, up: "Digit1", xblock: "KeyX", ability: "Digit3" }, { up: "Digit1", down: "KeyK", left: "KeyJ", right: "KeyL", ability: "Digit2" }],
    [{ ...old, ability: "KeyF" }, { up: "Digit3", down: "KeyK", left: "KeyJ", right: "KeyL", ability: "KeyF" }],
  ]) {
    const saved = { ...defaults(), locale: "en" as const, keybindings: bindings, customShortcuts: false };
    const expected = { ...saved, keybindings: expectedKeys };
    assert.deepEqual(parseGuestSettings(encodeURIComponent(JSON.stringify(saved))), expected);
    assert.deepEqual(settingsFromRow({ ...settingsToRow(defaults()), locale: "en", keybindings: bindings, custom_shortcuts: false }), expected);
    assert.equal(isSettingsPatch({ keybindings: bindings }), false);
  }
  assert.throws(() => settingsFromRow({ ...settingsToRow(defaults()), keybindings: { ...old, ability: null } }), /Invalid saved settings/);
});

test("manual ability migration preserves old rows and validates five-key settings", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const old = { up: "Digit3", down: "KeyK", left: "KeyJ", right: "KeyL", xblock: "Digit1", hardblock: "Digit2" };
  await db.exec("create schema private; create role anon; create role authenticated; create role service_role; create table public.player_preferences(id int primary key, keybindings jsonb not null);");
  await db.query("insert into public.player_preferences values (1,$1::jsonb)", [JSON.stringify(old)]);
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261016175755_ability_keybinding.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../../../supabase/migrations/20261017060000_manual_ability_key.sql", import.meta.url), "utf8"));
  assert.deepEqual((await db.query("select keybindings from public.player_preferences where id=1")).rows, [{ keybindings: old }]);
  await db.exec("insert into public.player_preferences(id) values (2)");
  assert.deepEqual((await db.query("select keybindings from public.player_preferences where id=2")).rows, [{ keybindings: DEFAULT_SETTINGS.keybindings }]);
  for (const value of [old, DEFAULT_SETTINGS.keybindings, { ...old, ability: "KeyF" }]) {
    assert.deepEqual((await db.query("select private.valid_player_keybindings($1::jsonb) as valid", [JSON.stringify(value)])).rows, [{ valid: true }]);
  }
  for (const value of [null, [], {}, { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", xblock: "Digit1" }, { ...old, extra: "KeyF" }, { ...old, ability: "Digit3" }, { ...old, ability: null }, { ...old, ability: "Enter" }, { ...DEFAULT_SETTINGS.keybindings, extra: "KeyF" }]) {
    assert.deepEqual((await db.query("select private.valid_player_keybindings($1::jsonb) as valid", [JSON.stringify(value)])).rows, [{ valid: false }]);
  }
});
