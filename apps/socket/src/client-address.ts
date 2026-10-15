import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";

export function clientAddress(request: IncomingMessage): string {
  const forwarded = request.headers["fly-client-ip"];
  // Fly's HTTP ingress supplies this header; direct deployments must use the socket peer.
  if (process.env.FLY_APP_NAME && typeof forwarded === "string" && isIP(forwarded)) return forwarded;
  return request.socket.remoteAddress ?? "unknown";
}
