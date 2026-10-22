export const REPOSITORY = "sean2474/2048";
export const VERCEL_TEAM = "team_oqJ9iAkMTMWLA7dKG5bZZYx7";
export const ADMIN_PROJECT = "prj_FclS4PxE3PDDwTXjReLCX3WYDShe";
export const RELEASES = {
  staging: {
    branch: "staging",
    database: "nwdjucplpyorwiwshxtf",
    socket: "https://2048-socket-staging.fly.dev",
    web: "https://2048-web-staging.vercel.app",
    webProject: "prj_0T04hsesw9AS1txzuHbFEwyYYwPd",
    adminTarget: "preview",
  },
  production: {
    branch: "main",
    database: "rbfujqjvkfdgaofztrdq",
    socket: "https://2048-socket.fly.dev",
    web: "https://www.2048duo.io",
    admin: "https://admin.2048duo.io",
    webProject: "prj_E9esvGL3YL6owbufFoC6HAYl6WKZ",
    adminTarget: "production",
  },
};

export function releaseConfig(environment, ref, repository) {
  const config = RELEASES[environment];
  if (!config || ref !== `refs/heads/${config.branch}` || repository !== REPOSITORY)
    throw Error("Release environment, branch and repository must match the deployment policy.");
  return config;
}

export function localMigrations(names) {
  const migrations = names
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d{14})_(.+)\.sql$/.exec(name);
      if (!match) throw Error(`Invalid migration filename: ${name}`);
      return { version: match[1], name: match[2] };
    })
    .sort((a, b) => a.version.localeCompare(b.version));
  if (new Set(migrations.map((m) => m.version)).size !== migrations.length)
    throw Error("Duplicate migration timestamps.");
  return migrations;
}

export function pendingMigrations(local, remote) {
  if (!Array.isArray(remote)) throw Error("Invalid remote migration history.");
  const versions = remote.map((m) => m.version).sort();
  if (versions.some((version, index) => version !== local[index]?.version))
    throw Error("Remote migration history diverges from this commit; do not repair automatically.");
  return local.slice(versions.length);
}

export function isPublicKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (key.startsWith("sb_publishable_")) return true;
  try {
    return JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon";
  } catch {
    return false;
  }
}

export function deploymentEnvironment(entries, target, branch) {
  const applicable = entries.filter(
    (entry) => entry.target?.includes(target) && (!entry.gitBranch || entry.gitBranch === branch),
  );
  applicable.sort((a, b) => Number(Boolean(a.gitBranch)) - Number(Boolean(b.gitBranch)));
  return Object.fromEntries(applicable.map((entry) => [entry.key, entry.value]));
}

export function validateProject(project, values, config, app, environment) {
  const expectedId = app === "web" ? config.webProject : ADMIN_PROJECT;
  if (project.id !== expectedId || project.rootDirectory !== `apps/${app}`)
    throw Error(`${app}: wrong Vercel project or root directory.`);
  if (project.nodeVersion !== "24.x") throw Error(`${app}: Vercel must use Node 24.x.`);
  if (values.NEXT_PUBLIC_SUPABASE_URL !== `https://${config.database}.supabase.co`)
    throw Error(`${app}: Supabase URL does not match the release environment.`);
  if (
    !isPublicKey(
      values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    )
  )
    throw Error(`${app}: a valid public Supabase key is required.`);
  const socketKey = app === "web" ? "NEXT_PUBLIC_SOCKET_URL" : "ADMIN_SOCKET_URL";
  if (values[socketKey] !== config.socket)
    throw Error(`${app}: socket URL does not match the release environment.`);
  if (app === "web" && values.NEXT_PUBLIC_APP_ENV !== environment)
    throw Error("web: NEXT_PUBLIC_APP_ENV does not match the release environment.");
  if (app === "web" && !project.autoExposeSystemEnvs)
    throw Error("web: expose Vercel system environment variables for analytics isolation.");
  for (const [name, value] of Object.entries(values)) {
    if (name.startsWith("NEXT_PUBLIC_") && typeof value === "string") {
      let serviceRole = false;
      try {
        serviceRole =
          JSON.parse(Buffer.from(value.split(".")[1], "base64url")).role === "service_role";
      } catch {
        // Non-JWT public values are expected.
      }
      if (value.startsWith("sb_secret_") || serviceRole)
        throw Error(`${app}: ${name} must never contain a Supabase server key.`);
    }
  }
}

export function verifiedStagingRun(run, sourceTree, candidateTree) {
  return (
    run.conclusion === "success" &&
    run.head_branch === "staging" &&
    ["push", "workflow_dispatch"].includes(run.event) &&
    run.head_repository?.full_name === REPOSITORY &&
    run.path === ".github/workflows/deploy-staging.yml" &&
    sourceTree === candidateTree
  );
}

export function verifyDeployment(deployment, projectId, sha, target) {
  if (
    deployment.projectId !== projectId ||
    deployment.meta?.releaseCommit !== sha ||
    deployment.gitSource?.sha !== sha ||
    deployment.readyState !== "READY" ||
    deployment.aliasError ||
    (deployment.target ?? "preview") !== target
  )
    throw Error(
      "Vercel deployment is not a READY build of the intended project, commit and target.",
    );
}
