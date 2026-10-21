import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

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
const machines = JSON.parse(await fly("machine", "list", "-a", app, "--json"));
if (machines.length !== 1 || machines[0].state !== "started")
  throw Error("Expected exactly one running game machine; resolve topology before deploying.");
const id = machines[0].id;
const deploymentId = randomUUID();
const control = async (path, method = "GET", timeout) => {
  const source = `fetch("http://127.0.0.1:4001/${path}",{method:"${method}",headers:{"x-deployment-id":"${deploymentId}"}}).then(async r=>{if(!r.ok)throw Error("Control HTTP "+r.status);console.log(JSON.stringify(await r.json()))}).catch(e=>{console.error(e.message);process.exit(1)})`;
  const output = JSON.parse(
    await runFly(
      timeout,
      "machine",
      "exec",
      id,
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
  drained = true;
  console.log(`Drain owner: ${deploymentId}`);
  await control("drain", "POST");
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
  // Fly can return before the replacement VM accepts exec requests. Keep the
  // outcome uncertain until the expected image and its control endpoint respond.
  const startupDeadline = Date.now() + 120_000;
  const remainingStartupTime = () => {
    const remaining = startupDeadline - Date.now();
    if (remaining <= 0) throw Error("Replacement startup verification timed out.");
    return remaining;
  };
  let status;
  while (true) {
    try {
      const current = JSON.parse(
        await runFly(remainingStartupTime(), "machine", "list", "-a", app, "--json"),
      );
      if (
        current.length !== 1 ||
        current[0].id !== id ||
        current[0].state !== "started" ||
        current[0].config?.image !== image
      ) {
        throw Error("The expected replacement image is not running yet.");
      }
      status = await control("status", "GET", remainingStartupTime());
      break;
    } catch (error) {
      if (Date.now() >= startupDeadline)
        throw Error("Replacement startup could not be verified within two minutes.", {
          cause: error,
        });
      console.log("Waiting for the replacement machine and control endpoint to start.");
      await setTimeout(Math.min(2000, remainingStartupTime()));
    }
  }
  if (status.draining || status.storageError)
    throw Error("Replacement did not start a healthy fresh server.");
  replacing = false;
  console.log(`Deployed ${revision} to ${app}; new games are enabled.`);
} finally {
  if (drained && !replacing)
    await control("resume", "POST").catch((error) => {
      console.error(
        "Could not resume admission; check the machine before retrying:",
        error.message,
      );
      process.exitCode = 1;
    });
  if (replacing)
    console.error(
      "Fly replacement outcome is uncertain. Admission was not reopened; inspect the machine before resuming.",
    );
}
