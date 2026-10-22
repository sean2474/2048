import { spawn } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_PROJECT,
  REPOSITORY,
  VERCEL_TEAM,
  deploymentEnvironment,
  localMigrations,
  pendingMigrations,
  releaseConfig,
  validateProject,
  verifiedStagingRun,
  verifyDeployment,
} from "./release-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const environment = process.env.RELEASE_ENVIRONMENT;
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length !== 2 && !checkOnly)
  throw Error("Usage: node scripts/release.mjs [--check]");
const config = releaseConfig(environment, process.env.GITHUB_REF, process.env.GITHUB_REPOSITORY);
const evidence = {
  environment,
  runId: process.env.GITHUB_RUN_ID,
  startedAt: new Date().toISOString(),
  stages: [],
};
const evidencePath = process.env.RUNNER_TEMP && join(process.env.RUNNER_TEMP, "2048-release.json");
let activeChild;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    interrupted = true;
    activeChild?.kill(signal);
  });

async function saveEvidence() {
  if (evidencePath) await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
}

async function stage(name, action) {
  if (interrupted) throw Error("Release interrupted; inspect the last recorded deployment stage.");
  console.log(`\n${name}`);
  const entry = { name, startedAt: new Date().toISOString(), status: "running" };
  evidence.stages.push(entry);
  await saveEvidence();
  try {
    const result = await action();
    entry.status = "success";
    return result;
  } catch (error) {
    entry.status = "failure";
    throw error;
  } finally {
    entry.finishedAt = new Date().toISOString();
    await saveEvidence();
  }
}

function command(binary, args, extraEnv = {}, capture = false) {
  if (interrupted) throw Error("Release interrupted.");
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: root,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    activeChild = child;
    let output = "";
    if (capture) child.stdout.on("data", (data) => (output += data));
    child.on("error", () => reject(Error(`Could not start ${binary}.`)));
    child.on("close", (code) => {
      activeChild = undefined;
      // Never put CLI arguments (which may contain credentials) into an error.
      if (code !== 0) reject(Error(`${binary} failed with exit code ${code}; release stopped.`));
      else resolve(output.trim());
    });
  });
}

async function api(base, path, token) {
  const response = await fetch(base + path, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw Error(`${new URL(base).hostname}: API request failed (${response.status}).`);
  return response.json();
}

const github = (path) => api("https://api.github.com", path, process.env.GH_TOKEN);
const vercel = (path, token) =>
  api(
    "https://api.vercel.com",
    `${path}${path.includes("?") ? "&" : "?"}teamId=${VERCEL_TEAM}`,
    token,
  );
const history = () =>
  api(
    "https://api.supabase.com",
    `/v1/projects/${config.database}/database/migrations`,
    process.env.SUPABASE_ACCESS_TOKEN,
  );

async function stagingProof(tree) {
  // Compare trees, not merge commit SHAs: a main merge can contain the identical
  // staged code under a different commit. Unsuccessful/PR runs never qualify.
  const result = await github(
    `/repos/${REPOSITORY}/actions/workflows/deploy-staging.yml/runs?branch=staging&status=success&per_page=100`,
  );
  for (const run of result.workflow_runs) {
    const commit = await github(`/repos/${REPOSITORY}/git/commits/${run.head_sha}`);
    if (verifiedStagingRun(run, commit.tree.sha, tree)) {
      const artifacts = await github(`/repos/${REPOSITORY}/actions/runs/${run.id}/artifacts`);
      if (!artifacts.artifacts.some((a) => a.name === "release-staging" && !a.expired)) continue;
      return { runId: run.id, sourceSha: run.head_sha, url: run.html_url };
    }
  }
  throw Error(
    "No successful staging release with retained evidence matches this source tree. Deploy staging first.",
  );
}

async function projectSettings(app, id, token, target) {
  const project = await vercel(`/v9/projects/${id}`, token);
  const { envs } = await vercel(`/v10/projects/${id}/env`, token);
  // The list endpoint can return ciphertext even with decrypt=true. Read each
  // relevant value through the dedicated endpoint; never log its response.
  const decrypted = await Promise.all(
    envs
      .filter(
        (entry) =>
          entry.target?.includes(target) &&
          (!entry.gitBranch || entry.gitBranch === config.branch) &&
          (entry.key.startsWith("NEXT_PUBLIC_") || entry.key === "ADMIN_SOCKET_URL"),
      )
      .map(async (entry) => ({
        ...entry,
        value: (await vercel(`/v1/projects/${id}/env/${entry.id}`, token)).value,
      })),
  );
  const values = deploymentEnvironment(decrypted, target, config.branch);
  validateProject(project, values, config, app, environment);
  return { id, token, target, values, previousDeployment: project.targets?.production?.id };
}

function vercelCommand(project, args, capture = false) {
  return command(
    "vercel",
    ["--scope", VERCEL_TEAM, "--token", project.token, ...args],
    { VERCEL_ORG_ID: VERCEL_TEAM, VERCEL_PROJECT_ID: project.id },
    capture,
  );
}

async function prepare(project, sha) {
  const args = [
    "deploy",
    "--yes",
    "--meta",
    `releaseCommit=${sha}`,
    "--meta",
    `releaseEnvironment=${environment}`,
  ];
  if (project.target === "production") args.push("--prod", "--skip-domain");
  const output = await vercelCommand(project, args, true);
  const url = output
    .split(/\s+/)
    .findLast((part) => /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(part));
  if (!url) throw Error("Vercel did not return a deployment URL.");
  const deployment = await vercel(`/v13/deployments/${new URL(url).hostname}`, project.token);
  verifyDeployment(deployment, project.id, sha, project.target);
  return { ...project, deploymentId: deployment.id, url };
}

async function probeDeployment(project, path, expected) {
  const output = await vercelCommand(
    project,
    [
      "curl",
      path,
      "--deployment",
      project.url,
      "--",
      "-sS",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      "30",
    ],
    true,
  );
  if (Number(output.match(/(\d{3})$/)?.[1]) !== expected)
    throw Error(`Prepared deployment failed its ${path} HTTP check.`);
}

async function publicPage(origin, path, expected, location) {
  const response = await fetch(new URL(path, origin), {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  await response.body?.cancel();
  if (response.status !== expected || (location && response.headers.get("location") !== location))
    throw Error(`Public ${new URL(origin).hostname}${path} check failed.`);
}

async function assertAlias(origin, project) {
  const alias = await vercel(`/v4/aliases/${new URL(origin).hostname}`, project.token);
  if (alias.deployment?.id !== project.deploymentId)
    throw Error("The service domain does not point to the verified deployment.");
}

async function main() {
  const required = [
    "GH_TOKEN",
    "VERCEL_WEB_TOKEN",
    "VERCEL_ADMIN_TOKEN",
    "FLY_API_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
  ];
  if (environment === "staging") required.push("SUPABASE_SECRET_KEY");
  for (const key of required)
    if (!process.env[key]) throw Error(`Missing GitHub environment secret: ${key}`);
  const sha = await command("git", ["rev-parse", "HEAD"], {}, true);
  const tree = await command("git", ["rev-parse", "HEAD^{tree}"], {}, true);
  evidence.sourceSha = sha;
  evidence.sourceTree = tree;
  if (!checkOnly) {
    if (sha !== process.env.GITHUB_SHA) throw Error("Checkout does not match the workflow commit.");
    if (await command("git", ["status", "--porcelain"], {}, true))
      throw Error("Release checkout must be clean.");
    if (environment === "production")
      evidence.staging = await stage("Verify successful staging release", () => stagingProof(tree));
  }

  const local = localMigrations(await readdir(join(root, "supabase/migrations")));
  const [webSettings, adminSettings] = await stage(
    "Validate environment separation and migration history",
    async () => {
      const web = await projectSettings(
        "web",
        config.webProject,
        process.env.VERCEL_WEB_TOKEN,
        "production",
      );
      const admin = await projectSettings(
        "admin",
        ADMIN_PROJECT,
        process.env.VERCEL_ADMIN_TOKEN,
        config.adminTarget,
      );
      const pending = pendingMigrations(local, await history());
      evidence.pendingMigrations = pending.map((m) => m.version);
      evidence.previousWeb = web.previousDeployment;
      evidence.previousAdmin = environment === "production" ? admin.previousDeployment : undefined;
      console.log(`Environment settings verified; ${pending.length} pending migration(s).`);
      return [web, admin];
    },
  );
  if (checkOnly) return;

  const web = await stage("Prepare web without changing its service domain", () =>
    prepare(webSettings, sha),
  );
  evidence.web = { id: web.deploymentId, url: web.url };
  const admin = await stage("Prepare admin deployment", () => prepare(adminSettings, sha));
  evidence.admin = { id: admin.deploymentId, url: admin.url };
  await stage("Check prepared pages", async () => {
    await probeDeployment(web, "/", 200);
    await probeDeployment(admin, "/login", 200);
  });
  await stage("Reject a superseded branch before changing the backend", async () => {
    const head = await github(`/repos/${REPOSITORY}/git/ref/heads/${config.branch}`);
    if (head.object.sha !== sha)
      throw Error("Branch advanced during preparation; deploy its newer commit instead.");
  });
  await stage("Apply append-only database migrations and verify history", async () => {
    const pending = pendingMigrations(local, await history());
    if (pending.length)
      await command("supabase", [
        "db",
        "push",
        "--project-ref",
        config.database,
        "--yes",
        "--skip-vault",
      ]);
    if (pendingMigrations(local, await history()).length)
      throw Error("Database migrations are incomplete.");
    evidence.migrations = local.map((m) => m.version);
  });
  await stage("Drain existing games and deploy the socket server", () =>
    command("node", ["scripts/deploy-socket.mjs", environment]),
  );
  evidence.socketImage = `registry.fly.io/${environment === "production" ? "2048-socket" : "2048-socket-staging"}:safe-${sha}`;
  await stage("Verify the deployed backend", async () => {
    const response = await fetch(`${config.socket}/health`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || (await response.json()).ok !== true)
      throw Error("Socket health check failed.");
    if (environment === "staging")
      await command(
        "pnpm",
        ["--filter", "socket", "exec", "tsx", "--test", "tests/deployed-smoke.ts"],
        {
          APP_ENV: "staging",
          SOCKET_TEST_URL: config.socket,
          TEST_WEB_ORIGIN: config.web,
          SUPABASE_URL: `https://${config.database}.supabase.co`,
          SUPABASE_PUBLISHABLE_KEY:
            web.values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
            web.values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
      );
  });
  await stage("Publish verified web and admin deployments", async () => {
    // Both builds exist before either domain changes. Cross-project promotion
    // is not atomic; backward-compatible migrations/protocols remain required.
    for (const project of [admin, web]) {
      const deployment = await vercel(`/v13/deployments/${project.deploymentId}`, project.token);
      verifyDeployment(deployment, project.id, sha, project.target);
      if (project.target === "production")
        await vercelCommand(project, ["promote", project.deploymentId, "--yes"]);
    }
  });
  await stage("Verify public domains and protected admin preview", async () => {
    await assertAlias(config.web, web);
    await publicPage(config.web, "/", 200);
    await publicPage(config.web, "/login", 200);
    if (environment === "production") {
      await assertAlias(config.admin, admin);
      await publicPage(config.admin, "/", 307, "/login");
      await publicPage(config.admin, "/login", 200);
    } else await probeDeployment(admin, "/login", 200);
  });
  evidence.status = "success";
  evidence.finishedAt = new Date().toISOString();
  await saveEvidence();
  if (process.env.GITHUB_STEP_SUMMARY)
    await writeFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Released **${environment}** at \`${sha}\`.\n\n- Web: ${config.web}\n- Admin: ${config.admin ?? admin.url}\n- Migration versions: ${local.length}\n- Release evidence is attached to this run.\n`,
    );
}

try {
  await main();
} catch (error) {
  evidence.status = "failure";
  evidence.finishedAt = new Date().toISOString();
  // Evidence contains identifiers and status only, never environment values.
  await saveEvidence();
  console.error(error.message);
  console.error(
    "No automatic DB rollback or forced game-server restart was attempted. Inspect release evidence before retrying.",
  );
  process.exitCode = 1;
}
