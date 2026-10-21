import { createServer } from "node:http";
import type { createGameServer } from "./server";

// Only the machine's SSH/exec operator can reach this loopback listener.
export function deploymentControl(
  game: Pick<ReturnType<typeof createGameServer>, "setDraining" | "deploymentStatus">,
) {
  let owner: string | undefined;
  return createServer((req, res) => {
    if (req.method === "POST" && (req.url === "/drain" || req.url === "/resume")) {
      const caller = req.headers["x-deployment-id"];
      if (typeof caller !== "string" || !caller || caller.length > 100) {
        res.writeHead(400);
        res.end();
        return;
      }
      if (
        (req.url === "/drain" && game.deploymentStatus().draining) ||
        (req.url === "/resume" && owner && owner !== caller)
      ) {
        res.writeHead(409);
        res.end();
        return;
      }
      owner = req.url === "/drain" ? caller : undefined;
      game.setDraining(req.url === "/drain");
    } else if (req.method !== "GET" || req.url !== "/status") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(game.deploymentStatus()));
  });
}
