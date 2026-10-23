import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: { tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json" },
  transpilePackages: ["schema", "ui"],
  async headers() {
    const development = process.env.NODE_ENV === "development";
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : null;
    if (
      url &&
      ((url.protocol !== "https:" && !(development && url.protocol === "http:")) ||
        url.username ||
        url.password)
    )
      throw new Error(
        "CSP service URLs must use HTTPS without credentials (HTTP is development-only).",
      );
    const supabase = url?.origin || "";
    // shortcut: Next's static/streamed hydration and style attributes need unsafe-inline; use per-request nonces before claiming strict XSS protection.
    const policy = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${supabase}`,
      "font-src 'self' data:",
      `connect-src 'self' ${supabase} ${supabase.replace(/^http/, "ws")}${development ? " ws: wss:" : ""}`,
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
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
    ];
  },
};
export default nextConfig;
