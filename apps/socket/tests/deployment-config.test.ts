import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeploymentConfig } from "../src/deployment-config";

const hosted = {
  APP_ENV: "production",
  PORT: "4000",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture123",
  SUPABASE_SECRET_KEY: "sb_secret_fixture456",
  CORS_ORIGINS: "https://2048duo.io,https://www.2048duo.io",
  RESULT_OUTBOX_DIR: "/data/results",
};

test("development remains optional while both hosted environments require complete config", () => {
  assert.doesNotThrow(() => validateDeploymentConfig({}));
  assert.doesNotThrow(() => validateDeploymentConfig({ APP_ENV: "development" }));
  for (const APP_ENV of ["production", "staging"]) {
    assert.doesNotThrow(() => validateDeploymentConfig({ ...hosted, APP_ENV }));
    for (const name of [
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "CORS_ORIGINS",
      "RESULT_OUTBOX_DIR",
    ]) {
      assert.throws(
        () => validateDeploymentConfig({ ...hosted, APP_ENV, [name]: "" }),
        new RegExp(name),
      );
    }
  }
  assert.throws(() => validateDeploymentConfig({ APP_ENV: "prod" }), /APP_ENV/);
});

test("hosted origins must be exact public HTTPS origins", () => {
  for (const origin of [
    "*",
    "https://*.vercel.app",
    "http://2048duo.io",
    "https://localhost",
    "https://test.localhost",
    "https://127.0.0.1",
    "https://127.1",
    "https://[::1]",
    "https://user:password@2048duo.io",
    "https://2048duo.io/path",
    "https://2048duo.io/",
    "https://2048duo.io?code=secret",
    "https://2048duo.io#fragment",
    "https://2048duo.io,",
  ]) {
    assert.throws(
      () => validateDeploymentConfig({ ...hosted, CORS_ORIGINS: origin }),
      /CORS_ORIGINS/,
    );
  }
  assert.doesNotThrow(() =>
    validateDeploymentConfig({
      ...hosted,
      CORS_ORIGINS: " https://stage.2048duo.io , https://stage-project.vercel.app ",
    }),
  );
  for (const SUPABASE_URL of [
    "http://project.supabase.co",
    "https://localhost",
    "https://project.supabase.co/rest/v1",
    "https://user:password@project.supabase.co",
  ]) {
    assert.throws(() => validateDeploymentConfig({ ...hosted, SUPABASE_URL }), /SUPABASE_URL/);
  }
});

test("hosted Supabase key roles cannot be swapped and legacy JWT roles remain supported", () => {
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.doesNotThrow(() =>
    validateDeploymentConfig({
      ...hosted,
      SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
      SUPABASE_SECRET_KEY: jwt("service_role"),
    }),
  );
  for (const SUPABASE_PUBLISHABLE_KEY of [
    " ",
    "public-test-key",
    hosted.SUPABASE_SECRET_KEY,
    jwt("service_role"),
    "eyJ.invalid.signature",
  ]) {
    assert.throws(
      () => validateDeploymentConfig({ ...hosted, SUPABASE_PUBLISHABLE_KEY }),
      /SUPABASE_PUBLISHABLE_KEY/,
    );
  }
  for (const SUPABASE_SECRET_KEY of [
    " ",
    "secret-test-key",
    hosted.SUPABASE_PUBLISHABLE_KEY,
    jwt("anon"),
  ]) {
    assert.throws(
      () => validateDeploymentConfig({ ...hosted, SUPABASE_SECRET_KEY }),
      /SUPABASE_SECRET_KEY/,
    );
  }
});

test("hosted storage and port fail before serving traffic", () => {
  for (const RESULT_OUTBOX_DIR of [".data/results", "data/results", " "]) {
    assert.throws(
      () => validateDeploymentConfig({ ...hosted, RESULT_OUTBOX_DIR }),
      /RESULT_OUTBOX_DIR/,
    );
  }
  for (const PORT of ["0", "-1", "65536", "4000.5", "nope"]) {
    assert.throws(() => validateDeploymentConfig({ ...hosted, PORT }), /PORT/);
  }
  assert.doesNotThrow(() => validateDeploymentConfig({ ...hosted, PORT: undefined }));
});
