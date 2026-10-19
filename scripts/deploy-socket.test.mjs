import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const mode of ["success", "interrupt", "replace-error"]) test(`safe socket deployment: ${mode}`, { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), "socket-deploy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  await copyFile(new URL("./deploy-socket.mjs", import.meta.url), join(root, "scripts/deploy-socket.mjs"));
  await writeFile(join(root, "git"), `#!${process.execPath}\nif(process.argv.includes("rev-parse")) console.log("abcdef");\n`, { mode: 0o700 });
  await writeFile(join(root, "fly"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2), log = process.env.DEPLOY_TEST_LOG;
const lines = fs.existsSync(log) ? fs.readFileSync(log,"utf8") : "";
let action;
if(args[0]==="machine" && args[1]==="list") { console.log(JSON.stringify([{id:"machine",state:"started"}])); process.exit(); }
if(args[0]==="deploy") action=args.includes("--build-only")?"build":"replace";
else action=args[3].match(/4001\\/(status|drain|resume)/)[1];
fs.appendFileSync(log,action+"\\n");
if(action==="replace" && process.env.DEPLOY_TEST_MODE==="replace-error") process.exit(1);
if(["status","drain","resume"].includes(action)) {
 const draining=action==="drain" || (action==="status" && lines.includes("drain\\n") && !lines.includes("replace\\n"));
 console.log(JSON.stringify({stdout:JSON.stringify({draining,ready:draining && process.env.DEPLOY_TEST_MODE!=="interrupt"})}));
}
`, { mode: 0o700 });
  const log = join(root, "commands");
  const child = spawn(process.execPath, [join(root, "scripts/deploy-socket.mjs"), "staging"], {
    env: { ...process.env, PATH: `${root}:${process.env.PATH}`, DEPLOY_TEST_LOG: log, DEPLOY_TEST_MODE: mode }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let output = "", signalled = false;
  child.stdout.on("data", data => {
    output += data;
    if (mode === "interrupt" && !signalled && output.includes('"draining":true')) { signalled = true; child.kill("SIGTERM"); }
  });
  child.stderr.on("data", data => { output += data; });
  const [code] = await once(child, "exit");
  const actions = (await readFile(log, "utf8")).trim().split("\n");
  assert.ok(actions.indexOf("build") < actions.indexOf("drain"));
  if (mode === "success") { assert.equal(code, 0, output); assert.deepEqual(actions, ["status", "build", "drain", "status", "replace", "status", "resume"]); }
  if (mode === "interrupt") { assert.equal(code, 1, output); assert.equal(actions.includes("replace"), false); assert.equal(actions.at(-1), "resume"); }
  if (mode === "replace-error") { assert.equal(code, 1, output); assert.equal(actions.at(-1), "replace", "uncertain replacement must not reopen admission"); }
});
