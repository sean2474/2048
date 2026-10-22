import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_PROJECT,
  RELEASES,
  REPOSITORY,
  deploymentEnvironment,
  localMigrations,
  pendingMigrations,
  releaseConfig,
  validateProject,
  verifiedStagingRun,
  verifyDeployment,
} from "./release-policy.mjs";

test("production is restricted to this repository's main branch", () => {
  assert.equal(releaseConfig("production", "refs/heads/main", REPOSITORY), RELEASES.production);
  for (const args of [
    ["production", "refs/heads/staging", REPOSITORY],
    ["staging", "refs/heads/main", REPOSITORY],
    ["unknown", "refs/heads/main", REPOSITORY],
    ["production", "refs/heads/main", "fork/2048"],
  ])
    assert.throws(() => releaseConfig(...args));
});

test("migrations only append to an exact, ordered remote history", () => {
  const local = localMigrations(["20261022020000_second.sql", "20261022010000_first.sql"]);
  assert.equal(pendingMigrations(local, []).length, 2);
  assert.deepEqual(pendingMigrations(local, [local[0]]), [local[1]]);
  assert.deepEqual(pendingMigrations(local, local), []);
  for (const remote of [[local[1]], [local[0], local[0]], [{ version: "20261023010000" }], null])
    assert.throws(() => pendingMigrations(local, remote));
  assert.throws(() => localMigrations(["20261022010000_one.sql", "20261022010000_two.sql"]));
  assert.throws(() => localMigrations(["wrong.sql"]));
});

test("branch-specific preview variables override only their own branch", () => {
  const entries = [
    { key: "URL", value: "base", target: ["preview"] },
    { key: "URL", value: "staging", target: ["preview"], gitBranch: "staging" },
    { key: "URL", value: "other", target: ["preview"], gitBranch: "feature/other" },
    { key: "URL", value: "production", target: ["production"] },
  ];
  assert.equal(deploymentEnvironment(entries, "preview", "staging").URL, "staging");
  assert.equal(deploymentEnvironment(entries, "preview", "feature/new").URL, "base");
  assert.equal(deploymentEnvironment(entries, "production", "main").URL, "production");
});

test("preflight rejects mixed environments and public server keys", () => {
  const config = RELEASES.staging;
  const project = {
    id: config.webProject,
    rootDirectory: "apps/web",
    nodeVersion: "24.x",
    autoExposeSystemEnvs: true,
  };
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: `https://${config.database}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    NEXT_PUBLIC_SOCKET_URL: config.socket,
    NEXT_PUBLIC_APP_ENV: "staging",
  };
  validateProject(project, values, config, "web", "staging");
  for (const change of [
    { NEXT_PUBLIC_SOCKET_URL: RELEASES.production.socket },
    { NEXT_PUBLIC_SOCKET_URL: "http://localhost:4000" },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${RELEASES.production.database}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" },
    { NEXT_PUBLIC_APP_ENV: "production" },
    { NEXT_PUBLIC_OTHER: "sb_secret_fixture" },
  ])
    assert.throws(() =>
      validateProject(project, { ...values, ...change }, config, "web", "staging"),
    );
  assert.throws(() =>
    validateProject({ ...project, id: ADMIN_PROJECT }, values, config, "web", "staging"),
  );
});

test("production requires a successful staging run of the identical source tree", () => {
  const run = {
    conclusion: "success",
    head_branch: "staging",
    event: "push",
    head_repository: { full_name: REPOSITORY },
    path: ".github/workflows/deploy-staging.yml",
  };
  assert.equal(verifiedStagingRun(run, "same-tree", "same-tree"), true);
  assert.equal(verifiedStagingRun(run, "old-tree", "new-tree"), false);
  for (const change of [
    { conclusion: "failure" },
    { head_branch: "feature/unverified" },
    { event: "pull_request" },
    { path: ".github/workflows/ci.yml" },
    { head_repository: { full_name: "fork/2048" } },
  ])
    assert.equal(verifiedStagingRun({ ...run, ...change }, "same", "same"), false);
});

test("a successful build from the wrong project or commit cannot be promoted", () => {
  const deployment = {
    projectId: "expected",
    meta: { releaseCommit: "commit" },
    readyState: "READY",
    target: "production",
  };
  verifyDeployment(deployment, "expected", "commit", "production");
  for (const change of [
    { projectId: "wrong" },
    { meta: { releaseCommit: "old" } },
    { readyState: "ERROR" },
    { aliasError: { code: "failure" } },
    { target: null },
  ])
    assert.throws(() =>
      verifyDeployment({ ...deployment, ...change }, "expected", "commit", "production"),
    );
});
