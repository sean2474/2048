import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rejected = [
  "empty",
  "two-public",
  "stopped-spare",
  "shared-volume",
  "missing-volume",
  "wrong-region",
  "wrong-group",
  "unmanaged-active",
  "managed-spare",
  "managed-platform",
  "extra-machine",
  "malformed",
];
const modes = [
  "success",
  "production-success",
  "resume-error",
  "already-draining",
  "interrupt",
  "interrupt-final-check",
  "replace-error",
  "startup-delay",
  "still-draining",
  "standby-success",
  "standby-digest-success",
  "standby-exposed",
  "standby-image-drift",
  "standby-digest-mismatch",
  "missing-image-digest",
  "drain-lost",
  "standby-update-error",
  "standby-unhealthy",
  "standby-busy",
  "drift-before-drain",
  "drift-before-replace",
  "drift-after-replace",
  "drain-conflict",
  ...rejected,
];
for (const mode of modes)
  test(`safe socket deployment: ${mode}`, { timeout: 15000 }, async (t) => {
    const root = await mkdtemp(join(tmpdir(), "socket-deploy-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await writeFile(
      join(root, "git"),
      `#!${process.execPath}\nif(process.argv.includes("rev-parse")) console.log("abcdef");\n`,
      { mode: 0o700 },
    );
    await writeFile(
      join(root, "fly"),
      `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2), log = process.env.DEPLOY_TEST_LOG, mode = process.env.DEPLOY_TEST_MODE;
const entries = fs.existsSync(log) ? fs.readFileSync(log,"utf8").trim().split("\\n").map(JSON.parse) : [];
const actions = entries.map(entry=>entry.action);
let action;
if(args[0]==="machine" && args[1]==="list") action="list";
else if(args[0]==="machine" && args[1]==="update") action="update-standby";
else if(args[0]==="deploy") action=args.includes("--build-only")?"build":"replace";
else action=(args[2]==="spare"?"standby-":"")+args[3].match(/4001\\/(status|drain|resume)/)[1];
fs.appendFileSync(log,JSON.stringify({action,args})+"\\n");
if(action==="list") {
  const active={id:"machine",state:"started",region:"nrt",config:{image:"registry.fly.io/"+args[args.indexOf("-a")+1]+":safe-abcdef",env:{FLY_PROCESS_GROUP:"app"},metadata:{fly_platform_version:"v2",fly_process_group:"app"},mounts:[{volume:"vol_active",path:"/data"}],services:[{protocol:"tcp",internal_port:4000,ports:[{port:80},{port:443}]}]}};
  const spare={id:"spare",state:"started",region:"nrt",config:{image:actions.includes("update-standby")?active.config.image:"registry.fly.io/2048-socket-staging:safe-old",env:{FLY_PROCESS_GROUP:"standby"},metadata:{game_role:"standby"},mounts:[{volume:"vol_spare",path:"/data"}],guest:{cpus:1,memory_mb:1024},restart:{policy:"on-failure",max_retries:10}}};
  active.image_ref={digest:"sha256:"+"a".repeat(64)};
  spare.image_ref={digest:mode==="standby-digest-mismatch"?"sha256:"+"b".repeat(64):active.image_ref.digest};
  if(mode==="missing-image-digest") delete active.image_ref;
  let machines=[active,spare];
  if(["success","production-success","resume-error","already-draining","interrupt","interrupt-final-check","replace-error","startup-delay","still-draining","drain-conflict"].includes(mode)) machines=[active];
  if(mode==="empty") machines=[];
  if(mode==="two-public") spare.config.services=active.config.services;
  if(mode==="stopped-spare") spare.state="stopped";
  if(mode==="shared-volume") spare.config.mounts=active.config.mounts;
  if(mode==="missing-volume") delete spare.config.mounts;
  if(mode==="wrong-region") spare.region="iad";
  if(mode==="wrong-group") active.config.metadata.fly_process_group="other";
  if(mode==="unmanaged-active") delete active.config.metadata.fly_platform_version;
  if(mode==="managed-spare") spare.config.metadata.fly_process_group="standby";
  if(mode==="managed-platform") spare.config.metadata.fly_platform_version="v2";
  if(mode==="standby-digest-success" && actions.includes("update-standby")) spare.config.image+="@sha256:"+"a".repeat(64);
  if(mode==="standby-exposed" && actions.includes("update-standby")) spare.config.services=active.config.services;
  if(mode==="standby-image-drift" && actions.includes("replace")) spare.config.image="registry.fly.io/2048-socket-staging:safe-other";
  if(mode==="extra-machine") machines.push({...spare,id:"extra"});
  if(mode==="malformed") machines=null;
  if((mode==="drift-before-drain" && actions.includes("build")) || (mode==="drift-before-replace" && actions.includes("update-standby")) || (mode==="drift-after-replace" && actions.includes("replace"))) spare.config.mounts[0].volume="vol_changed";
  console.log(JSON.stringify(machines)); process.exit();
}
if(action==="update-standby" && mode==="standby-update-error") process.exit(1);
if(action==="replace" && mode==="replace-error") process.exit(1);
if(action==="resume" && mode==="resume-error") process.exit(1);
if(action==="drain" && mode==="drain-conflict") process.exit(1);
if(action==="status" && mode==="startup-delay" && actions.at(-1)==="list" && actions.at(-2)==="replace") process.exit(1);
if(action==="status" && mode==="interrupt-final-check" && actions.filter(action=>action==="status").length===2) {
 process.kill(process.ppid,"SIGTERM");
 setTimeout(()=>{},100);
}
if(["status","drain","resume","standby-status"].includes(action)) {
 const standby=action==="standby-status";
 const draining=!standby && !(mode==="drain-lost" && actions.includes("update-standby")) && (mode==="already-draining" || action==="drain" || (action==="status" && actions.includes("drain") && (!actions.includes("replace") || mode==="still-draining")));
 console.log(JSON.stringify({stdout:JSON.stringify({draining,ready:draining && mode!=="interrupt",matches:standby && mode==="standby-busy"?1:0,solo:0,writes:0,storageError:standby && mode==="standby-unhealthy" && actions.includes("update-standby")})}));
}
`,
      { mode: 0o700 },
    );
    const log = join(root, "commands");
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("./deploy-socket.mjs", import.meta.url)),
        mode === "production-success" ? "production" : "staging",
      ],
      {
        env: {
          ...process.env,
          PATH: `${root}:${process.env.PATH}`,
          DEPLOY_TEST_LOG: log,
          DEPLOY_TEST_MODE: mode,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    });
    let output = "",
      signalled = false;
    child.stdout.on("data", (data) => {
      output += data;
      if (mode === "interrupt" && !signalled && output.includes('"draining":true')) {
        signalled = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    const [code] = await once(child, "exit");
    const entries = (await readFile(log, "utf8")).trim().split("\n").map(JSON.parse);
    const actions = entries.map((entry) => entry.action).filter((action) => action !== "list");
    if (rejected.includes(mode)) {
      assert.equal(code, 1, output);
      assert.deepEqual(actions, [], "unsafe topology must not build, drain, or mutate machines");
      return;
    }
    if (
      [
        "success",
        "production-success",
        "startup-delay",
        "standby-success",
        "standby-digest-success",
      ].includes(mode)
    )
      assert.equal(code, 0, output);
    else assert.equal(code, 1, output);
    if (mode === "already-draining") assert.deepEqual(actions, ["status"]);
    if (mode === "resume-error") {
      assert.ok(actions.includes("replace"));
      assert.equal(actions.at(-1), "resume");
      assert.match(output, /Could not safely resume admission/);
    }
    if (mode === "production-success") {
      const replacement = entries.find((entry) => entry.action === "replace").args;
      assert.equal(
        replacement[replacement.indexOf("--image") + 1],
        "registry.fly.io/2048-socket:safe-abcdef",
      );
    }
    if (mode === "success")
      assert.deepEqual(actions, [
        "status",
        "build",
        "drain",
        "status",
        "status",
        "replace",
        "status",
        "resume",
      ]);
    if (["standby-success", "standby-digest-success"].includes(mode)) {
      assert.ok(actions.indexOf("build") < actions.indexOf("drain"));
      assert.ok(actions.indexOf("drain") < actions.indexOf("update-standby"));
      assert.ok(
        actions.indexOf("standby-status", actions.indexOf("update-standby")) <
          actions.indexOf("replace"),
      );
      assert.equal(actions.at(-1), "resume");
      const update = entries.find((entry) => entry.action === "update-standby").args;
      assert.equal(update[2], "spare");
      assert.equal(update.includes("--config"), false, "never apply fly.toml services to standby");
      assert.equal(
        update[update.indexOf("--image") + 1],
        "registry.fly.io/2048-socket-staging:safe-abcdef",
      );
      const config = JSON.parse(update[update.indexOf("--machine-config") + 1]);
      assert.deepEqual(config.services, []);
      assert.deepEqual(config.mounts, [{ volume: "vol_spare", path: "/data" }]);
      assert.deepEqual(config.env, { FLY_PROCESS_GROUP: "standby" });
      assert.deepEqual(config.metadata, { game_role: "standby" });
      assert.deepEqual(config.guest, { cpus: 1, memory_mb: 1024 });
      assert.deepEqual(config.restart, { policy: "on-failure", max_retries: 10 });
      const replacement = entries.find((entry) => entry.action === "replace").args;
      assert.equal(replacement[replacement.indexOf("--only-machines") + 1], "machine");
    }
    if (mode === "startup-delay")
      assert.deepEqual(actions.slice(-4), ["replace", "status", "status", "resume"]);
    if (
      [
        "still-draining",
        "replace-error",
        "drift-after-replace",
        "standby-image-drift",
        "standby-digest-mismatch",
        "missing-image-digest",
      ].includes(mode)
    ) {
      assert.ok(actions.includes("replace"));
      assert.equal(
        actions.includes("resume"),
        false,
        "uncertain replacement must not reopen admission",
      );
    }
    if (
      [
        "interrupt",
        "interrupt-final-check",
        "standby-update-error",
        "drain-lost",
        "standby-unhealthy",
        "standby-busy",
        "drain-conflict",
      ].includes(mode)
    ) {
      assert.equal(actions.includes("replace"), false);
      assert.equal(actions.at(-1), "resume", "original active admission must be restored");
    }
    if (["standby-exposed", "drift-before-replace"].includes(mode)) {
      assert.equal(actions.includes("replace"), false);
      assert.equal(
        actions.includes("resume"),
        false,
        "unsafe topology must keep original admission closed",
      );
      assert.match(output, /Could not safely resume admission/);
    }
    if (["drift-before-drain", "drain-conflict", "standby-busy"].includes(mode))
      assert.equal(actions.includes("update-standby"), false);
    if (mode === "drift-before-drain") assert.equal(actions.includes("drain"), false);
  });
