import "server-only";
import { headers } from "next/headers";

// Middleware overwrites this presentation hint after verifying the session.
// Use it only for placeholders. Real pages/actions still authenticate themselves.
export async function getLoadingAccountHint() {
  return (await headers()).get("x-2048-loading-member") === "1";
}
