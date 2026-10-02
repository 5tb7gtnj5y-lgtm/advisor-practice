// Real Cloudflare runtime smoke test. No live AI inference.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(new URL("../package.json", import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = require("miniflare");
const mf = new Miniflare(
  (convertV4MiniflareOptions || ((value) => value))({
    cf: false,
    workers: [
      {
        name: "advisor-practice",
        modules: true,
        script: require("node:fs").readFileSync(
          new URL("../.wrangler/runtime-test/worker.js", import.meta.url),
          "utf8",
        ),
        scriptPath: "worker.js",
        bindings: {
          AI: { configured: true },
          MANAGER_SETUP_KEY: "local-runtime-bootstrap",
          AI_MODEL: "mock-unused",
        },
        durableObjects: {
          SESSIONS: { className: "TrainingSession", useSQLite: true },
          MANAGEMENT: { className: "ManagementRegistry", useSQLite: true },
        },
      },
    ],
  }),
);
let cookie = "",
  csrf = "";
async function call(path, method = "GET", data) {
  const r = await mf.dispatchFetch("https://practice.test" + path, {
    method,
    headers: {
      Origin: "https://practice.test",
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const d = await r.json();
  if (r.headers.has("set-cookie")) cookie = r.headers.get("set-cookie");
  return { status: r.status, data: d };
}
try {
  const setup = await call("/api/management/setup", "POST", {
    username: "runtime-admin",
    password: "local-runtime-test-password",
    setupKey: "local-runtime-bootstrap",
  });
  assert.equal(setup.status, 200, JSON.stringify(setup));
  csrf = setup.data.csrf;
  const list = await call("/api/management/scenarios");
  assert.equal(list.status, 200);
  let scenario = {
    ...list.data[0],
    title: "Runtime fuel complaint",
    facts: "PRIVATE-RUNTIME-FACT",
    status: "published",
    enabled: true,
    minutes: 9,
    level: "advanced",
    passMark: 75,
  };
  delete scenario.id;
  delete scenario.version;
  scenario = (await call("/api/management/scenarios", "POST", scenario)).data;
  assert.ok(scenario.id);
  const catalog = await call("/api/catalog");
  assert.ok(catalog.data.scenarios.some((s) => s.id === scenario.id));
  assert.ok(!JSON.stringify(catalog).includes("PRIVATE-RUNTIME-FACT"));
  const attempt = await call("/api/sessions", "POST", {
    scenarioId: scenario.id,
    advisor: "Runtime trainee",
    minutes: 0,
    level: "foundation",
    passMark: 1,
  });
  assert.equal(attempt.status, 201, JSON.stringify(attempt));
  assert.equal(attempt.data.config.minutes, 0);
  assert.equal(attempt.data.deadline, null);
  assert.equal(attempt.data.config.level, "foundation");
  assert.equal(attempt.data.config.passMark, 75);
  const assessed = await call(
    "/api/sessions/" + attempt.data.id + "/assess",
    "POST",
    {},
  );
  assert.equal(assessed.status, 200, JSON.stringify(assessed));
  const results = await call("/api/management/results");
  assert.equal(results.data.total, 1, JSON.stringify(results));
  const detail = await call("/api/management/results/" + attempt.data.id);
  assert.equal(detail.data.messages.length, 1);
  assert.equal(detail.data.config.scenario.facts, "PRIVATE-RUNTIME-FACT");
  console.log(
    "PASS: real workerd crypto, SQLite registry, manager setup, publish, catalog filtering, session snapshot, empty assessment, atomic result/transcript persistence. AI was not invoked.",
  );
} finally {
  await mf.dispose();
}
