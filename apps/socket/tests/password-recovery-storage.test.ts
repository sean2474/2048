import assert from "node:assert/strict";
import test from "node:test";
import { createRecoveryStorage } from "../../web/src/lib/supabase/password-recovery";

function disk() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("recovery storage persists only the PKCE verifier across tabs", () => {
  const persistent = disk(), firstTab = createRecoveryStorage(persistent), secondTab = createRecoveryStorage(persistent);
  firstTab.setItem("duo-password-recovery-code-verifier", "verifier/PASSWORD_RECOVERY");
  firstTab.setItem("duo-password-recovery", '{"access_token":"recovery-token"}');
  firstTab.setItem("duo-password-recovery-user", '{"id":"recovered-user"}');
  assert.equal(secondTab.getItem("duo-password-recovery-code-verifier"), "verifier/PASSWORD_RECOVERY");
  assert.equal(firstTab.getItem("duo-password-recovery"), '{"access_token":"recovery-token"}');
  assert.equal(secondTab.getItem("duo-password-recovery"), null);
  assert.equal(secondTab.getItem("duo-password-recovery-user"), null);
  assert.deepEqual([...persistent.values.keys()], ["duo-password-recovery-code-verifier"]);
  secondTab.removeItem("duo-password-recovery-code-verifier");
  firstTab.removeItem("duo-password-recovery");
  assert.equal(firstTab.getItem("duo-password-recovery-code-verifier"), null);
  assert.equal(firstTab.getItem("duo-password-recovery"), null);
});

test("recovery cleanup never touches a main account's persisted session", () => {
  const persistent = disk();
  persistent.setItem("sb-project-auth-token", "main-account-B");
  const recovery = createRecoveryStorage(persistent);
  recovery.setItem("duo-password-recovery", "account-A");
  recovery.removeItem("duo-password-recovery");
  recovery.removeItem("sb-project-auth-token");
  assert.equal(persistent.getItem("sb-project-auth-token"), "main-account-B");
});

test("blocked browser storage fails explicitly before a recovery link can be requested", () => {
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const recovery = createRecoveryStorage(blocked);
  recovery.setItem("duo-password-recovery", "memory-only");
  assert.equal(recovery.getItem("duo-password-recovery"), "memory-only");
  assert.throws(() => recovery.setItem("duo-password-recovery-code-verifier", "verifier"), /blocked/);
  assert.throws(() => recovery.getItem("duo-password-recovery-code-verifier"), /blocked/);
  assert.doesNotThrow(() => recovery.removeItem("duo-password-recovery-code-verifier"));
});

test("an older flow cannot consume or clean up a newer flow's verifier", () => {
  const persistent = disk(), older = createRecoveryStorage(persistent), newer = createRecoveryStorage(persistent);
  const key = "duo-password-recovery-code-verifier";
  older.setItem(key, "older/PASSWORD_RECOVERY");
  assert.equal(older.getItem(key), "older/PASSWORD_RECOVERY");
  newer.setItem(key, "newer/PASSWORD_RECOVERY");
  older.removeItem(key);
  assert.equal(newer.getItem(key), "newer/PASSWORD_RECOVERY");
  newer.removeItem(key);
  newer.setItem(key, "latest/PASSWORD_RECOVERY");
  older.removeItem(key);
  assert.equal(newer.getItem(key), "latest/PASSWORD_RECOVERY");
});
