import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json" },
  transpilePackages: ["schema", "game-core", "ui"],
  async headers() {
    const development = process.env.NODE_ENV === "development";
    const origin = (value: string | undefined) => {
      if (!value) return "";
      const url = new URL(value);
      if (
        (url.protocol !== "https:" && !(development && url.protocol === "http:")) ||
        url.username ||
        url.password
      )
        throw new Error(
          "CSP service URLs must use HTTPS without credentials (HTTP is development-only).",
        );
      return url.origin;
    };
    const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const socket = origin(
      process.env.NEXT_PUBLIC_SOCKET_URL || (development ? "http://localhost:4000" : undefined),
    );
    const connections = [supabase, socket]
      .filter(Boolean)
      .flatMap((url) => [url, url.replace(/^http/, "ws")]);
    // shortcut: Next's static/streamed hydration and style attributes need unsafe-inline; use per-request nonces before claiming strict XSS protection.
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase}`,
      "font-src 'self' data:",
      `connect-src 'self' ${connections.join(" ")} https://vitals.vercel-insights.com${development ? " ws: wss:" : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: policy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
