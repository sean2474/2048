import { isAbsolute } from "node:path";

function publicHttpsOrigin(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/\.$/, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/"
      && !value.includes("*") && host !== "localhost" && !host.endsWith(".localhost") && !/^127\./.test(host) && host !== "0.0.0.0" && host !== "[::1]";
  } catch { return false; }
}

function validKey(value: string, kind: "publishable" | "secret") {
  if (new RegExp(`^sb_${kind}_[A-Za-z0-9_-]+$`).test(value)) return true;
  try {
    const parts = value.split(".");
    return parts.length === 3 && JSON.parse(Buffer.from(parts[1], "base64url").toString()).role === (kind === "publishable" ? "anon" : "service_role");
  } catch { return false; }
}

export function validateDeploymentConfig(env: NodeJS.ProcessEnv = process.env) {
  if (!env.APP_ENV || env.APP_ENV === "development") return;
  if (env.APP_ENV !== "production" && env.APP_ENV !== "staging") throw new Error("APP_ENV must be production, staging, or development");
  for (const name of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "CORS_ORIGINS", "RESULT_OUTBOX_DIR"]) {
    if (!env[name]?.trim()) throw new Error(`${name} is required in ${env.APP_ENV}`);
  }
  if (!publicHttpsOrigin(env.SUPABASE_URL!)) throw new Error("SUPABASE_URL must be a public HTTPS origin");
  if (!validKey(env.SUPABASE_PUBLISHABLE_KEY!, "publishable")) throw new Error("SUPABASE_PUBLISHABLE_KEY must be a publishable or anon key");
  if (!validKey(env.SUPABASE_SECRET_KEY!, "secret")) throw new Error("SUPABASE_SECRET_KEY must be a secret or service_role key");
  const origins = env.CORS_ORIGINS!.split(",").map(value => value.trim());
  if (origins.some(origin => !publicHttpsOrigin(origin) || new URL(origin).origin !== origin)) throw new Error("CORS_ORIGINS must contain exact public HTTPS origins");
  if (!isAbsolute(env.RESULT_OUTBOX_DIR!)) throw new Error("RESULT_OUTBOX_DIR must be an absolute path on a persistent volume");
  const port = Number(env.PORT || 4000);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535");
}
