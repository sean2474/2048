import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameServer } from "./src/server";
import { createSupabaseServices } from "./src/supabase";
import { ResultStore } from "./src/result-store";
import { validateDeploymentConfig } from "./src/deployment-config";
const directory = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(directory, ".env") });
// Reuse the public web config locally; privileged keys only belong in socket/.env.
config({ path: resolve(directory, "../web/.env.local") });
async function main() {
  validateDeploymentConfig();
  const services = createSupabaseServices();
  const store = services.writeMatch ? new ResultStore(process.env.RESULT_OUTBOX_DIR || resolve(directory, ".data/results"), services.writeMatch) : undefined;
  if (store) await store.start();
  else console.warn("Match history storage is disabled: set SUPABASE_SECRET_KEY on the socket server.");
  const server = createGameServer({ checkAdmin: services.checkAdmin, readStore: store ? () => store.diagnostics() : undefined, resolveAccount: services.resolveAccount, readRating: services.readRating, readSuspensions: services.readSuspensions, deleteAccount: services.deleteAccount, writeFeedback: services.writeFeedback, writeMatch: store ? record => store.save(record) : undefined, hasPendingRanked: store ? userId => store.hasPendingRanked(userId) : undefined, hasPendingAccount: store ? userId => store.hasPendingAccount(userId) : undefined });
  const port = Number(process.env.PORT) || 4000;
  server.httpServer.listen(port, () => console.log(`Game server listening on :${port}`));
  for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, async () => { await server.close(); await store?.close(); process.exit(0); });
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Server startup failed"); process.exit(1); });
