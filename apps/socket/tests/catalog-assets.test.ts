import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { catalogAssetPlan, catalogTarget, uploadCatalogAssets, validateSeedSvg } from "../scripts/seed-catalog-assets";

test("asset plan validates every initial portrait and dry-run needs no credentials", async () => {
  const plan = await catalogAssetPlan();
  assert.equal(plan.length, 15);
  assert.equal(new Set(plan.map(asset => asset.path)).size, plan.length);
  assert.ok(plan.some(asset => asset.path === "profile-icons/attendance-king-v2.svg"));
  assert.ok(!plan.some(asset => asset.path === "profile-icons/attendance-king.svg"));
  for (const asset of plan) {
    assert.match(asset.path, /^profile-icons\/[a-z][a-z0-9-]+\.svg$/);
    assert.equal(asset.sha256, createHash("sha256").update(asset.bytes).digest("hex"));
  }
  const output = execFileSync(process.execPath, ["--import", fileURLToPath(new URL("../node_modules/tsx/dist/loader.mjs", import.meta.url)), fileURLToPath(new URL("../scripts/seed-catalog-assets.ts", import.meta.url)), "--dry-run"], {
    encoding: "utf8", env: { ...process.env, SUPABASE_URL: "", SUPABASE_SECRET_KEY: "" }, stdio: ["ignore", "pipe", "pipe"],
  });
  assert.deepEqual(JSON.parse(output).assets.map((asset: { path: string }) => asset.path), plan.map(asset => asset.path));
});

test("seed rejects active SVG content, external references and oversized files", () => {
  const wrap = (body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
  validateSeedSvg(wrap('<defs><linearGradient id="bg"/></defs><path fill="url(#bg)"/>'));
  for (const body of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/a.png"/>', '<path onload="alert(1)"/>', '<path fill="url(https://example.com/a.svg)"/>', '<path style="fill:red"/>', '<path xml:base="https://example.com/" fill="url(#bg)"/>', '<path fill="\\75rl(https://example.com/)"/>', '<!DOCTYPE svg>', '<path fill="&#106;avascript:x"/>']) {
    assert.throws(() => validateSeedSvg(wrap(body)), /static shapes/);
  }
  assert.throws(() => validateSeedSvg(Buffer.alloc(256_001)), /static shapes/);
});

test("uploads require an explicit environment whose URL matches", () => {
  const staging = { SUPABASE_URL: "https://nwdjucplpyorwiwshxtf.supabase.co", SUPABASE_SECRET_KEY: "test-secret" };
  assert.deepEqual(catalogTarget("staging", staging), { url: staging.SUPABASE_URL, key: staging.SUPABASE_SECRET_KEY });
  assert.throws(() => catalogTarget(undefined, staging), /Specify/);
  assert.throws(() => catalogTarget("production", staging), /does not match/);
  assert.throws(() => catalogTarget("staging", { ...staging, SUPABASE_SECRET_KEY: "" }), /required/);
  assert.throws(() => catalogTarget("staging", { ...staging, SUPABASE_URL: `${staging.SUPABASE_URL}/` }), /does not match/);
});

test("uploads are idempotent, verify bytes and never replace different existing assets", async () => {
  const [asset] = await catalogAssetPlan();
  let saved: Uint8Array | undefined;
  let posts = 0;
  const client = createClient("https://example.supabase.co", "test-secret", { global: {
    fetch: async (_input, init) => {
      if (init?.method === "POST") {
        posts++;
        assert.equal(new Headers(init.headers).get("x-upsert"), "false");
        if (saved) return new Response(JSON.stringify({ statusCode: "409", error: "Duplicate", message: "The resource already exists" }), { status: 409 });
        saved = new Uint8Array(init.body as ArrayBuffer);
        return new Response(JSON.stringify({ Key: asset.path }), { status: 200 });
      }
      return new Response(saved ? new Uint8Array(saved).buffer : undefined, { status: saved ? 200 : 404, headers: { "Content-Type": "image/svg+xml" } });
    },
  } });
  assert.deepEqual(await uploadCatalogAssets(client, [asset]), { uploaded: 1, unchanged: 0 });
  assert.deepEqual(await uploadCatalogAssets(client, [asset]), { uploaded: 0, unchanged: 1 });
  saved = Buffer.from("different");
  await assert.rejects(uploadCatalogAssets(client, [asset]), /no overwrite performed/);
  assert.equal(Buffer.from(saved).toString(), "different");
  assert.equal(posts, 3);
});

test("storage errors stop seeding instead of reporting assets as uploaded", async () => {
  const [asset] = await catalogAssetPlan();
  const client = createClient("https://example.supabase.co", "test-secret", { global: {
    fetch: async () => new Response(JSON.stringify({ statusCode: "403", message: "Access denied" }), { status: 403 }),
  } });
  await assert.rejects(uploadCatalogAssets(client, [asset]), /upload failed/);
});
