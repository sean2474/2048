import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CatalogImagePathSchema } from "schema/catalog";

const bucket = "catalog-assets";
const projects = { staging: "nwdjucplpyorwiwshxtf", production: "rbfujqjvkfdgaofztrdq" } as const;
type Asset = { path: string; bytes: Buffer; sha256: string };
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export function validateSeedSvg(bytes: Buffer): void {
  const svg = bytes.toString("utf8").trim();
  // Only the repository's static SVG subset is accepted; this is not an upload sanitizer.
  if (!bytes.length || bytes.length > 256_000 || !/^<svg\s/.test(svg) || !svg.endsWith("</svg>")
    || !svg.includes('xmlns="http://www.w3.org/2000/svg"') || /[\u0000-\u0008\u000b\u000c\u000e-\u001f&\\]/.test(svg)
    || /<(?!\/?(?:svg|g|defs|clipPath|linearGradient|radialGradient|stop|rect|circle|ellipse|path|polygon|polyline|line)\b)/.test(svg)
    || /\s(?:on[a-z]+|[a-z-]*:?href|style|xml:base)\s*=/i.test(svg)
    || [...svg.matchAll(/url\s*\([^)]*\)/gi)].some(([reference]) => !/^url\(#[a-zA-Z][a-zA-Z0-9_-]*\)$/.test(reference))) {
    throw new Error("Seed SVG must contain only static shapes and internal references");
  }
}

export async function catalogAssetPlan(): Promise<Asset[]> {
  const directory = new URL("../../web/public/profile-icons/", import.meta.url);
  const files = (await readdir(directory, { withFileTypes: true })).filter(file => file.name.endsWith(".svg")).sort((a, b) => a.name.localeCompare(b.name));
  if (!files.length) throw new Error("No catalog seed assets found");
  return Promise.all(files.map(async file => {
    const path = CatalogImagePathSchema.parse(`profile-icons/${file.name}`);
    if (!file.isFile()) throw new Error(`Seed asset is not a regular file: ${path}`);
    const bytes = await readFile(new URL(file.name, directory));
    validateSeedSvg(bytes);
    return { path, bytes, sha256: checksum(bytes) };
  }));
}

export function catalogTarget(target: unknown, env: NodeJS.ProcessEnv) {
  if (target !== "staging" && target !== "production") throw new Error("Specify --target staging or --target production");
  const url = `https://${projects[target]}.supabase.co`;
  if (env.SUPABASE_URL !== url) throw new Error("SUPABASE_URL does not match the explicit target");
  if (!env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is required");
  return { url, key: env.SUPABASE_SECRET_KEY };
}

export async function uploadCatalogAssets(client: SupabaseClient, assets: readonly Asset[]) {
  const storage = client.storage.from(bucket);
  let uploaded = 0, unchanged = 0;
  for (const asset of assets) {
    const { error } = await storage.upload(asset.path, asset.bytes, { contentType: "image/svg+xml", cacheControl: "31536000", upsert: false });
    if (error && !("statusCode" in error && String(error.statusCode) === "409") && error.message !== "The resource already exists") {
      throw new Error(`Catalog asset upload failed: ${asset.path}`);
    }
    const stored = await storage.download(asset.path);
    if (stored.error || !stored.data) throw new Error(`Catalog asset verification failed: ${asset.path}`);
    if (checksum(new Uint8Array(await stored.data.arrayBuffer())) !== asset.sha256) {
      throw new Error(`Catalog asset differs from the repository; no overwrite performed: ${asset.path}`);
    }
    if (error) unchanged++; else uploaded++;
  }
  return { uploaded, unchanged };
}

async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" }, target: { type: "string" } }, strict: true });
  const assets = await catalogAssetPlan();
  if (values["dry-run"]) {
    console.log(JSON.stringify({ bucket, assets: assets.map(({ path, bytes, sha256 }) => ({ path, bytes: bytes.length, sha256 })) }, null, 2));
    return;
  }
  const { url, key } = catalogTarget(values.target, process.env);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
  } });
  const result = await uploadCatalogAssets(client, assets);
  console.log(JSON.stringify({ target: values.target, bucket, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(error => { console.error(error instanceof Error ? error.message : "Catalog asset seed failed"); process.exitCode = 1; });
}
