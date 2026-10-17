import { createClient } from "@supabase/supabase-js";
import { supabasePublicKey } from "./config";

const storageKey = "duo-password-recovery";

export function createRecoveryStorage(persistent: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const session = new Map<string, string>();
  const verifierKey = `${storageKey}-code-verifier`;
  let ownedVerifier: string | null = null;
  return {
    getItem(key: string) {
      if (key !== verifierKey) return session.get(key) ?? null;
      ownedVerifier = persistent.getItem(key);
      return ownedVerifier;
    },
    setItem(key: string, value: string) {
      if (key === verifierKey) { persistent.setItem(key, value); ownedVerifier = value; }
      else session.set(key, value);
    },
    removeItem(key: string) {
      if (key === verifierKey) {
        // Completing an older reset must not erase a newer request made in another tab.
        if (ownedVerifier !== null && persistent.getItem(key) === ownedVerifier) persistent.removeItem(key);
        ownedVerifier = null;
      }
      else session.delete(key);
    },
  };
}

export function createRecoveryClient() {
  // Only the PKCE verifier survives navigation; recovery sessions never touch the main login's cookies.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabasePublicKey()!, {
    auth: {
      storageKey, flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: createRecoveryStorage(window.localStorage),
    },
  });
}
