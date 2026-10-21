import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = resolve(import.meta.dirname, "../../..");
const id = "11111111-1111-4111-8111-111111111111";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR4nGMQMgn7D8IMMAYANAwGbdbSwQUAAAAASUVORK5CYII=",
  "base64",
);

test(
  "admin catalog creates, uploads, publishes and edits without overwriting newer versions",
  { timeout: 180000 },
  async (t) => {
    const state = { admin: true, conflict: false, readsFail: false, uploads: 0, writes: 0 };
    const catalog = { skins: [], profileIcons: [], achievements: [] };
    const user = {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "catalog-fixture@example.invalid",
      is_anonymous: false,
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    const backend = createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.headers["access-control-request-headers"] ??
          "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
      );
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const send = (data, status = 200) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };
      const url = new URL(req.url, "http://fixture.invalid");
      if (url.pathname.startsWith("/auth/v1/user")) return send(user);
      if (url.pathname.startsWith("/storage/v1/object/public/catalog-assets/")) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(png);
        return;
      }
      if (url.pathname.startsWith("/storage/v1/object/catalog-assets/")) {
        if (!state.admin) return send({ message: "Access denied" }, 403);
        state.uploads++;
        assert.match(url.pathname, /uploads\/[a-f0-9-]+\.png$/);
        return send({ Key: url.pathname.replace("/storage/v1/object/", "") });
      }
      const name = url.pathname.split("/").at(-1);
      if (name === "is_game_admin") return send(state.admin);
      if (!state.admin) return send({ code: "42501", message: "Admin access required" }, 403);
      if (name === "admin_content_catalog")
        return state.readsFail ? send({ message: "Offline" }, 503) : send(catalog);
      if (name === "admin_save_cosmetic" || name === "admin_save_achievement") {
        const args = JSON.parse(raw.toString());
        if (state.conflict) return send({ code: "40001", message: "Changed" }, 409);
        const item = { ...args.p_item };
        delete item.kind;
        const entries =
          name === "admin_save_achievement"
            ? catalog.achievements
            : args.p_kind === "skin"
              ? catalog.skins
              : catalog.profileIcons;
        const previous = entries.find((row) => row.id === item.id);
        assert.equal(args.p_expected_revision, previous?.revision ?? 0);
        const saved = {
          ...item,
          revision: (previous?.revision ?? 0) + 1,
          publishedOnce: previous?.publishedOnce || item.status === "published",
          updatedAt: new Date().toISOString(),
        };
        if (previous) entries[entries.indexOf(previous)] = saved;
        else entries.push(saved);
        state.writes++;
        return send(saved);
      }
      return send(null);
    });
    await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      backend.closeAllConnections();
      return new Promise((resolve) => backend.close(resolve));
    });
    const backendUrl = `http://127.0.0.1:${backend.address().port}`;
    const directory = await mkdtemp(join(tmpdir(), "2048-catalog-admin-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const app = join(directory, "apps/admin");
    await mkdir(app, { recursive: true });
    await mkdir(join(directory, "packages"));
    for (const name of [
      "src",
      "next.config.ts",
      "tsconfig.json",
      "package.json",
      "postcss.config.mjs",
    ])
      await cp(join(root, "apps/admin", name), join(app, name), { recursive: true });
    await symlink(join(root, "apps/admin/node_modules"), join(app, "node_modules"));
    for (const name of ["ui", "schema"])
      await symlink(join(root, "packages", name), join(directory, "packages", name));
    const portProbe = createServer();
    await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const port = portProbe.address().port;
    await new Promise((resolve) => portProbe.close(resolve));
    const child = spawn(
      process.execPath,
      [
        join(root, "apps/admin/node_modules/next/dist/bin/next"),
        "dev",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: app,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: backendUrl,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-key",
          NEXT_TELEMETRY_DISABLED: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    child.stdout.on("data", (chunk) => {
      logs += chunk;
    });
    child.stderr.on("data", (chunk) => {
      logs += chunk;
    });
    t.after(async () => {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    });
    const origin = `http://127.0.0.1:${port}`;
    for (let attempt = 0; ; attempt++) {
      try {
        if ((await fetch(`${origin}/login`)).ok) break;
      } catch {}
      if (attempt >= 100) throw Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    t.after(() => browser.close());
    const context = await browser.newContext({
      locale: "en-US",
      viewport: { width: 1440, height: 1000 },
    });
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const jwt = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: expires, role: "authenticated", aal: "aal2" })).toString("base64url")}.fixture`;
    const session = {
      access_token: jwt,
      refresh_token: "fixture",
      expires_at: expires,
      expires_in: 3600,
      token_type: "bearer",
      user,
    };
    await context.addCookies([
      {
        name: "sb-2048-admin-auth",
        value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
        url: origin,
      },
      { name: "duo.locale", value: "en", url: origin },
    ]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/catalog`);
    await page.getByRole("heading", { name: "Content catalog", exact: true }).waitFor();
    const save = async () => {
      await page.getByRole("button", { name: "Save content", exact: true }).click();
      await page.getByText("Content saved.", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Save content", exact: true })
        .waitFor({ state: "visible" });
    };
    await page.getByLabel("Content ID", { exact: true }).fill("editor-board");
    await page.getByLabel("English name", { exact: true }).fill("Editor Board");
    await page.getByLabel("Korean name", { exact: true }).fill("관리자 보드");
    await page.getByLabel("Board color or gradient", { exact: true }).fill("#123456");
    await page
      .getByLabel("Board image", { exact: true })
      .setInputFiles({ name: "board.png", mimeType: "image/png", buffer: png });
    await page
      .getByRole("button", { name: "Remove image", exact: true })
      .waitFor({ timeout: 10000 })
      .catch(async () => {
        throw Error(`${await page.locator("main").innerText()}\n${logs.slice(-4000)}`);
      });
    assert.equal(state.uploads, 1);
    await save();
    assert.equal(catalog.skins[0].status, "draft");
    await page.getByLabel("Publication status", { exact: true }).selectOption("published");
    await save();
    assert.equal(
      await page.getByLabel("How players obtain it", { exact: true }).isDisabled(),
      true,
    );
    assert.equal(await page.getByLabel("Content ID", { exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Profile icons", exact: true }).click();
    await page.getByLabel("Content ID", { exact: true }).fill("editor-icon");
    await page.getByLabel("English name", { exact: true }).fill("Editor Icon");
    await page.getByLabel("How players obtain it", { exact: true }).selectOption("coins");
    await page.getByLabel("Coin price", { exact: true }).fill("150");
    await page
      .getByLabel("Profile image", { exact: true })
      .setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "Remove image", exact: true }).waitFor();
    await page.getByLabel("Publication status", { exact: true }).selectOption("published");
    await save();
    await page.getByLabel("Coin price", { exact: true }).fill("225");
    await save();
    assert.equal(catalog.profileIcons[0].price, 225);
    await page.getByRole("button", { name: "Achievements", exact: true }).click();
    await page.getByLabel("Content ID", { exact: true }).fill("editor-achievement");
    await page.getByLabel("English name", { exact: true }).fill("Editor Achievement");
    await page.getByLabel("Reward type", { exact: true }).selectOption("skin");
    await page.getByLabel("Reward board", { exact: true }).selectOption("editor-board");
    await page.getByLabel("Target", { exact: true }).fill("100");
    await page.getByLabel("Publication status", { exact: true }).selectOption("published");
    await save();
    assert.equal(catalog.achievements[0].target, 100);
    assert.equal(await page.getByLabel("Reward board", { exact: true }).isDisabled(), true);
    state.conflict = true;
    await page.getByLabel("Target", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Save content", exact: true }).click();
    await page
      .getByText("Someone changed this item. Reload the catalog and select it again before saving.")
      .waitFor();
    assert.equal(catalog.achievements[0].target, 100);
    state.conflict = false;
    await page.reload();
    await page.getByRole("button", { name: "Achievements", exact: true }).click();
    await page.getByRole("button", { name: /Editor Achievement/ }).click();
    assert.equal(await page.getByLabel("Target", { exact: true }).inputValue(), "100");
    await page.getByLabel("Publication status", { exact: true }).selectOption("archived");
    await save();
    assert.equal(catalog.achievements[0].status, "archived");
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `overflow at ${width}`,
      );
    }
    const upload = (body) =>
      context.request.post(`${origin}/api/catalog-assets`, {
        headers: { Origin: origin },
        multipart: { file: body },
      });
    assert.equal(
      (
        await upload({
          name: "bad.svg",
          mimeType: "image/svg+xml",
          buffer: Buffer.from('<svg onload="alert(1)"/>'),
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await upload({
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("not an image"),
        })
      ).status(),
      400,
    );
    assert.equal(
      (
        await upload({
          name: "large.png",
          mimeType: "image/png",
          buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
        })
      ).status(),
      413,
    );
    assert.equal(
      (
        await context.request.post(`${origin}/api/catalog-assets`, {
          headers: { Origin: "https://other.invalid" },
        })
      ).status(),
      403,
    );
    state.admin = false;
    assert.equal(
      (await upload({ name: "unauthorized.png", mimeType: "image/png", buffer: png })).status(),
      403,
    );
    state.admin = true;
    assert.equal(state.uploads, 2);
    state.readsFail = true;
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page.getByText("Catalog could not be loaded. Refresh to try again.").waitFor();
    assert.equal(
      await page.getByRole("button", { name: "Save content", exact: true }).isDisabled(),
      true,
    );
    assert.deepEqual(errors, []);
  },
);
