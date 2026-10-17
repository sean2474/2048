import { createGameServer } from "../../socket/src/server";

// Isolated in-memory accounts and game server; never connects to Supabase.
process.env.CORS_ORIGINS = "http://[::1]:3001";
const ids = ["10000000-0000-4000-8000-000000000097", "10000000-0000-4000-8000-000000000098"];
const server = createGameServer({
  resolveAccount: async token => {
    const id = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
    if (!token.endsWith(".fixture") || !ids.includes(id)) throw Error("Unknown fixture account");
    return { id, name: id === ids[0] ? "Rune Knight" : "Classic Rival", iconId: "fox", skinId: id === ids[0] ? "arcanist" : "classic" };
  },
  readSuspensions: async () => [],
});
server.httpServer.listen(0, "127.0.0.1", () => {
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  console.log(JSON.stringify({ port: address.port }));
});
process.once("SIGTERM", async () => { await server.close(); process.exit(0); });
