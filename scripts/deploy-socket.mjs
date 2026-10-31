import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const exec = promisify(execFile);
const cwd = fileURLToPath(new URL("../", import.meta.url));
const environment = process.argv[2];
if (!["staging", "production"].includes(environment) || process.argv.length !== 3)
  throw Error("Usage: node scripts/deploy-socket.mjs staging|production");
const app = environment === "production" ? "2048-socket" : "2048-socket-staging";
const config = environment === "production" ? "fly.toml" : "fly.staging.toml";
const runFly = async (timeout, ...args) =>
  (await exec("fly", args, { cwd, detached: true, timeout, maxBuffer: 16 * 1024 * 1024 })).stdout;
const fly = (...args) => runFly(undefined, ...args);
const revision = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
if ((await exec("git", ["status", "--porcelain"], { cwd })).stdout.trim())
  throw Error("Commit the intended changes before deploying.");
const list = async (timeout) =>
  JSON.parse(await runFly(timeout, "machine", "list", "-a", app, "--json"));
const topology = (machines) => {
  const message =
    "Unsafe game topology: expected one Tokyo app machine and at most one unmanaged standby with separate /data volumes.";
  assert(Array.isArray(machines) && machines.length >= 1 && machines.length <= 2, message);
  for (const machine of machines) {
    assert(machine?.id && machine.region === "nrt", message);
    assert(
      machine.config?.services === undefined || Array.isArray(machine.config.services),
      message,
    );
    assert(
      machine.config?.mounts?.length === 1 &&
        machine.config.mounts[0].path === "/data" &&
        typeof machine.config.mounts[0].volume === "string" &&
        machine.config.mounts[0].volume,
      message,
    );
  }
  const active = machines.filter((machine) => machine.config.services?.length);
  assert(active.length === 1, message);
  assert(
    active[0].config.metadata?.fly_platform_version === "v2" &&
      active[0].config.metadata?.fly_process_group === "app" &&
      active[0].config.env?.FLY_PROCESS_GROUP === "app",
    message,
  );
  const standby = machines.find((machine) => machine !== active[0]);
  if (standby) {
    assert(
      standby.config.metadata?.game_role === "standby" &&
        !standby.config.metadata?.fly_process_group &&
        !standby.config.metadata?.fly_platform_version &&
        standby.config.env?.FLY_PROCESS_GROUP === "standby",
      message,
    );
    assert(
      standby.id !== active[0].id &&
        standby.config.mounts[0].volume !== active[0].config.mounts[0].volume,
      message,
    );
  }
  return [active[0], ...(standby ? [standby] : [])];
};
const machines = topology(await list());
const identity = (current) =>
  current.map((machine) => [machine.id, machine.config.mounts[0].volume]);
const unchanged = async (timeout) => {
  const current = topology(await list(timeout));
  assert.deepEqual(
    identity(current),
    identity(machines),
    "Game topology changed during deployment; refusing to continue.",
  );
  return current;
};
const running = (current) => {
  if (current.some((machine) => machine.state !== "started"))
    throw Error("Every game machine must be running before deployment can continue.");
};
running(machines);
const [active, standby] = machines;
const id = active.id;
const deploymentId = randomUUID();
const control = async (path, method = "GET", timeout, machineId = id) => {
  const source = `fetch("http://127.0.0.1:4001/${path}",{method:"${method}",headers:{"x-deployment-id":"${deploymentId}"}}).then(async r=>{if(!r.ok)throw Error("Control HTTP "+r.status);console.log(JSON.stringify(await r.json()))}).catch(e=>{console.error(e.message);process.exit(1)})`;
  const output = JSON.parse(
    await runFly(
      timeout,
      "machine",
      "exec",
      machineId,
      `node -e '${source}'`,
      "-a",
      app,
      "--json",
      "--timeout",
      "15",
    ),
  );
  if (
    (output.exit_code !== undefined && output.exit_code !== 0) ||
    typeof output.stdout !== "string"
  )
    throw Error("Deployment control failed; refusing to replace the server.");
  return JSON.parse(output.stdout.trim());
};
const standbyHealthy = (status) => {
  if (
    status.draining ||
    status.storageError ||
    status.matches !== 0 ||
    status.solo !== 0 ||
    status.writes !== 0
  )
    throw Error("Standby must be healthy and idle before deployment can continue.");
};
const imageMatches = (machine) =>
  typeof machine.config.image === "string" &&
  machine.config.image.replace(/@sha256:[a-f0-9]{64}$/, "") === image;
const verifyStartup = async (machineId) => {
  const deadline = Date.now() + 120_000;
  const remaining = () => {
    const time = deadline - Date.now();
    if (time <= 0) throw Error("Replacement startup verification timed out.");
    return time;
  };
  while (true) {
    try {
      const current = await unchanged(remaining());
      running(current);
      if (!imageMatches(current.find((machine) => machine.id === machineId)))
        throw Error("The expected replacement image is not running yet.");
      if (machineId === id && standby) {
        assert(imageMatches(current[1]), "Standby image changed during deployment.");
        assert.match(
          current[0].image_ref?.digest ?? "",
          /^sha256:[a-f0-9]{64}$/,
          "Active image digest is missing or invalid.",
        );
        assert.equal(
          current[1].image_ref?.digest,
          current[0].image_ref.digest,
          "Active and standby must run the same image digest.",
        );
      }
      return await control("status", "GET", remaining(), machineId);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
      if (Date.now() >= deadline)
        throw Error("Replacement startup could not be verified within two minutes.", {
          cause: error,
        });
      console.log("Waiting for the replacement machine and control endpoint to start.");
      await setTimeout(Math.min(2000, remaining()));
    }
  }
};
// Fail closed on old servers: bootstrap drain support once with the documented idle-server procedure.
const initial = await control("status");
if (initial.draining)
  throw Error(
    "Another deployment is draining this machine. Resume or finish it before starting another.",
  );
const image = `registry.fly.io/${app}:safe-${revision}`;
let interrupted = false,
  replacing = false;
const interrupt = () => {
  interrupted = true;
  console.error(
    replacing
      ? "Replacement is running; waiting for Fly to finish before restoring admission."
      : "Cancelling deployment and restoring admission.",
  );
};
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);
console.log(`Building ${revision} for ${app}; games continue during the build.`);
console.log(
  await fly(
    "deploy",
    "--config",
    config,
    "--depot=false",
    "--remote-only",
    "--build-only",
    "--push",
    "--image-label",
    `safe-${revision}`,
  ),
);
let drained = false;
try {
  if (interrupted) throw Error("Deployment interrupted before draining.");
  running(await unchanged());
  drained = true;
  console.log(`Drain owner: ${deploymentId}`);
  await control("drain", "POST");
  const current = await unchanged();
  running(current);
  if (standby) {
    standbyHealthy(await control("status", "GET", undefined, standby.id));
    if (interrupted) throw Error("Deployment interrupted; no games were stopped.");
    console.log(
      await fly(
        "machine",
        "update",
        standby.id,
        "-a",
        app,
        "--image",
        image,
        "--machine-config",
        JSON.stringify({ ...current[1].config, services: [] }),
        "--yes",
      ),
    );
    standbyHealthy(await verifyStartup(standby.id));
  }
  const deadline = Date.now() + 15 * 60_000;
  while (true) {
    if (interrupted) throw Error("Deployment interrupted; no games were stopped.");
    const status = await control("status");
    console.log(JSON.stringify(status));
    if (!status.draining) throw Error("Drain was cancelled; refusing to replace the server.");
    if (status.ready) break;
    if (Date.now() >= deadline)
      throw Error(
        "Games or pending saves remain after 15 minutes. Deployment cancelled; no games were stopped.",
      );
    await setTimeout(5000);
  }
  if (interrupted) throw Error("Deployment interrupted; no games were stopped.");
  running(await unchanged());
  const finalDrain = await control("status");
  if (!finalDrain.draining || !finalDrain.ready)
    throw Error("Drain readiness changed; refusing to replace the server.");
  if (interrupted) throw Error("Deployment interrupted; no games were stopped.");
  replacing = true;
  console.log(
    await fly(
      "deploy",
      "--config",
      config,
      "--image",
      image,
      "--ha=false",
      "--strategy",
      "immediate",
      "--only-machines",
      id,
      "--yes",
    ),
  );
  // Fly can return before exec is ready; keep replacement uncertain until verified.
  const status = await verifyStartup(id);
  if (status.draining || status.storageError)
    throw Error("Replacement did not start a healthy fresh server.");
  if (standby) standbyHealthy(await control("status", "GET", undefined, standby.id));
  replacing = false;
  console.log(`Deployed ${revision} to ${app}; new games are enabled.`);
} finally {
  if (drained && !replacing)
    await unchanged()
      .then(() => control("resume", "POST"))
      .catch((error) => {
        console.error(
          "Could not safely resume admission; inspect the topology and machine before retrying:",
          error.message,
        );
        process.exitCode = 1;
      });
  if (replacing)
    console.error(
      "Fly replacement outcome is uncertain. Admission was not reopened; inspect the machine before resuming.",
    );
}
