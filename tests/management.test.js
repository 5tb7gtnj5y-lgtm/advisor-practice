import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { ManagementRegistry } from "../src/management.js";
import { memoryContext, testEnvironment, request } from "./helpers.js";
import { validateAssessment } from "../src/assessment.js";
function fixture(run) {
  const env = testEnvironment(run),
    ctx = memoryContext();
  env.MANAGER_SETUP_KEY = "local-test-bootstrap-key";
  const instance = new ManagementRegistry(ctx, env);
  env.MANAGEMENT = { idFromName: (n) => n, get: () => instance };
  return { env, ctx, instance };
}
async function call(f, path, method = "GET", data, auth) {
  const req = request(
    "/api/management/" + path,
    method,
    method === "GET" ? undefined : data,
  );
  if (auth) {
    req.headers.set("Cookie", auth.cookie);
    req.headers.set("X-CSRF-Token", auth.csrf);
  }
  const r = await worker.fetch(req, f.env);
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("Set-Cookie"),
  };
}
async function setup(f) {
  const r = await call(f, "setup", "POST", {
    username: "admin",
    password: "test-password-long-enough",
    setupKey: f.env.MANAGER_SETUP_KEY,
  });
  assert.equal(r.status, 200);
  return { ...r.data, cookie: r.cookie };
}
async function scenario(f, auth, extra = {}) {
  const list = await call(f, "scenarios", "GET", null, auth);
  const source = list.data[0];
  const d = {
    ...source,
    title: "Fuel complaint",
    facts: "SECRET-FACT-FUEL",
    hiddenInformation: "SECRET-HIDDEN-FUEL",
    personality: "PRIVATE-PERSONALITY",
    minutes: 7,
    level: "advanced",
    outcomes: [
      {
        title: "Listening",
        description: "Ask relevant questions.",
        weight: 100,
        essential: true,
        minScore: 3,
      },
    ],
    ...extra,
  };
  delete d.id;
  delete d.version;
  return (await call(f, "scenarios", "POST", d, auth)).data;
}
test("management requires authentication; setup is single-use and cookies are secure", async () => {
  const f = fixture();
  assert.equal((await call(f, "scenarios")).status, 401);
  assert.equal(
    (await call(f, "setup", "POST", { setupKey: "wrong" })).status,
    403,
  );
  const auth = await setup(f);
  assert.match(auth.cookie, /HttpOnly; Secure; SameSite=Strict/);
  const again = await call(f, "setup", "POST", {
    setupKey: f.env.MANAGER_SETUP_KEY,
  });
  assert.equal(again.status, 409);
  assert.equal((await call(f, "scenarios", "GET", null, auth)).status, 200);
});
test("server rejects CSRF, missing Origin and cross-site manager writes", async () => {
  const f = fixture(),
    auth = await setup(f);
  assert.equal(
    (await call(f, "logout", "POST", {}, { ...auth, csrf: "bad" })).status,
    403,
  );
  const req = request("/api/management/logout", "POST", {});
  req.headers.set("Cookie", auth.cookie);
  req.headers.set("X-CSRF-Token", auth.csrf);
  req.headers.delete("Origin");
  assert.equal((await worker.fetch(req, f.env)).status, 403);
});
test("manager cannot administer accounts; disabling account revokes active cookies", async () => {
  const f = fixture(),
    admin = await setup(f);
  assert.equal(
    (
      await call(
        f,
        "accounts",
        "POST",
        { username: "manager", password: "manager-password-long" },
        admin,
      )
    ).status,
    200,
  );
  const login = await call(f, "login", "POST", {
      username: "manager",
      password: "manager-password-long",
    }),
    auth = { ...login.data, cookie: login.cookie };
  assert.equal((await call(f, "accounts", "GET", null, auth)).status, 403);
  assert.equal(
    (await call(f, "settings", "POST", { retentionDays: 5 }, auth)).status,
    403,
  );
  assert.equal((await call(f, "scenarios", "GET", null, auth)).status, 200);
  await call(
    f,
    "accounts",
    "POST",
    { username: "manager", disabled: true },
    admin,
  );
  assert.equal((await call(f, "scenarios", "GET", null, auth)).status, 401);
});
test("passwords are hashed; failed sign-ins lock out and logout revokes cookies", async () => {
  const f = fixture(),
    auth = await setup(f);
  const user = await f.ctx.storage.get("user:admin");
  assert.notEqual(user.hash, "test-password-long-enough");
  assert.ok(user.salt);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await call(f, "login", "POST", { username: "admin", password: "wrong" }))
        .status,
      401,
    );
  assert.equal(
    (
      await call(f, "login", "POST", {
        username: "admin",
        password: "test-password-long-enough",
      })
    ).status,
    429,
  );
  await call(f, "logout", "POST", {}, auth);
  assert.equal((await call(f, "me", "GET", null, auth)).status, 401);
});
test("draft and hidden customer fields are excluded from catalog; publication is immediate", async () => {
  const f = fixture(),
    auth = await setup(f),
    s = await scenario(f, auth, { status: "draft" });
  let catalog = await (
    await worker.fetch(request("/api/catalog"), f.env)
  ).json();
  assert.ok(!catalog.scenarios.some((x) => x.id === s.id));
  const pub = await call(
    f,
    "scenarios",
    "POST",
    { ...s, status: "published", enabled: true },
    auth,
  );
  assert.equal(pub.status, 200);
  catalog = await (await worker.fetch(request("/api/catalog"), f.env)).json();
  assert.ok(catalog.scenarios.some((x) => x.id === s.id));
  assert.ok(!JSON.stringify(catalog).includes("SECRET"));
  assert.ok(!JSON.stringify(catalog).includes("PRIVATE-PERSONALITY"));
});
test("trainee overrides cannot change managed scenario, rubric, level or timer", async () => {
  const f = fixture(),
    auth = await setup(f),
    s = await scenario(f, auth, { status: "published", enabled: true });
  const r = await worker.fetch(
    request("/api/sessions", "POST", {
      scenarioId: s.id,
      minutes: 0,
      level: "foundation",
      passMark: 1,
      outcomes: [],
      customScenario: { title: "cheat" },
    }),
    f.env,
  );
  assert.equal(r.status, 201);
  const session = await r.json();
  assert.equal(session.config.minutes, 7);
  assert.equal(session.config.level, "advanced");
  assert.equal(session.config.outcomes[0].minScore, 3);
  assert.ok(!JSON.stringify(session).includes("SECRET"));
  assert.ok(!JSON.stringify(session).includes("PRIVATE-PERSONALITY"));
  assert.equal(session.reviewFacts, null);
});
test("new attempts reject disabled scenarios while existing snapshots survive edits", async () => {
  const f = fixture(),
    auth = await setup(f),
    s = await scenario(f, auth, { status: "published", enabled: true });
  const session = await (
    await worker.fetch(
      request("/api/sessions", "POST", { scenarioId: s.id }),
      f.env,
    )
  ).json();
  const updated = await call(
    f,
    "scenarios",
    "POST",
    { ...s, title: "Updated", enabled: false },
    auth,
  );
  assert.equal(updated.status, 200);
  assert.equal(
    (
      await worker.fetch(
        request("/api/sessions", "POST", { scenarioId: s.id }),
        f.env,
      )
    ).status,
    409,
  );
  const saved = await (
    await worker.fetch(request("/api/sessions/" + session.id), f.env)
  ).json();
  assert.equal(saved.config.scenario.title, "Fuel complaint");
  assert.equal(
    (await call(f, "scenarios", "POST", { ...s, title: "Stale" }, auth)).status,
    409,
  );
});
test("completed result includes immutable snapshot and transcript; trainer review preserves AI marks", async () => {
  const f = fixture(),
    auth = await setup(f),
    s = await scenario(f, auth, { status: "published", enabled: true });
  const session = await (
    await worker.fetch(
      request("/api/sessions", "POST", {
        scenarioId: s.id,
        advisor: "Trainee",
      }),
      f.env,
    )
  ).json();
  await worker.fetch(
    request("/api/sessions/" + session.id + "/assess", "POST", {}),
    f.env,
  );
  const list = await call(f, "results", "GET", null, auth);
  assert.equal(list.data.total, 1);
  const result = await call(f, "results/" + session.id, "GET", null, auth);
  assert.equal(result.data.messages.length, 1);
  assert.equal(result.data.config.scenario.facts, "SECRET-FACT-FUEL");
  assert.equal(result.data.report.percent, 0);
  assert.equal((await call(f, "results/" + session.id)).status, 401);
  const review = await call(
    f,
    "results/" + session.id,
    "POST",
    {
      decision: "Needs more practice",
      notes: "Listening needs practice.",
      scores: [{ id: "outcome1", score: 2 }],
    },
    auth,
  );
  assert.equal(review.status, 200);
  assert.equal(review.data.review.percent, 50);
  assert.equal(review.data.report.percent, 0);
  assert.equal(review.data.review.reviewer, "admin");
  await worker.fetch(request("/api/sessions/" + session.id, "DELETE"), f.env);
  assert.equal(
    (await call(f, "results/" + session.id, "GET", null, auth)).status,
    404,
  );
});
test("manager tests use drafts and are excluded from ordinary result lists", async () => {
  const f = fixture(),
    auth = await setup(f),
    s = await scenario(f, auth);
  const attempt = await call(f, "test", "POST", s, auth);
  assert.equal(attempt.status, 201);
  assert.equal(attempt.data.config.isTest, true);
  await worker.fetch(
    request("/api/sessions/" + attempt.data.id + "/assess", "POST", {}),
    f.env,
  );
  assert.equal((await call(f, "results", "GET", null, auth)).data.total, 0);
  assert.equal(
    (await call(f, "results?tests=1", "GET", null, auth)).data.total,
    1,
  );
});
test("retention is persisted across registry reconstruction and expired data is purged", async () => {
  const f = fixture(),
    auth = await setup(f);
  await call(f, "settings", "POST", { retentionDays: 14 }, auth);
  const second = new ManagementRegistry(f.ctx, f.env);
  const list = await second.fetch(new Request("https://registry/catalog"));
  assert.equal((await list.json()).retentionDays, 14);
  await f.ctx.storage.put("result:expired", {
    id: "expired",
    expiresAt: Date.now() - 1,
  });
  await f.ctx.storage.put("transcript:expired", ["private"]);
  await second.alarm();
  assert.equal(await f.ctx.storage.get("result:expired"), undefined);
  assert.equal(await f.ctx.storage.get("transcript:expired"), undefined);
});
test("AI generator stores a draft and never publishes generated content automatically", async () => {
  const f = fixture(async () => ({
      response: {
        title: "Generated fuel scenario",
        brief: "Ask about a bill.",
        customer: "Alex",
        opening: "My bill is high.",
        guidance: "Fictional guidance: check readings.",
        facts: "SECRET generated fact",
        hiddenInformation: "Reveal previous contacts if asked.",
        level: "advanced",
        minutes: 10,
        passMark: 70,
        outcomes: [
          { title: "Questioning", description: "Ask questions", weight: 100 },
        ],
      },
    })),
    auth = await setup(f);
  const generated = await call(
    f,
    "generate",
    "POST",
    { description: "Fuel complaint" },
    auth,
  );
  assert.equal(generated.status, 200);
  assert.equal(generated.data.status, "draft");
  assert.equal(generated.data.enabled, false);
  const saved = await f.ctx.storage.get("scenario:" + generated.data.id);
  assert.ok(saved);
  const catalog = await (
    await worker.fetch(request("/api/catalog"), f.env)
  ).json();
  assert.ok(!catalog.scenarios.some((x) => x.id === saved.id));
});
test("recovery uses a rotated, single-use owner secret and revokes old admin sessions", async () => {
  const f = fixture(),
    auth = await setup(f);
  f.env.MANAGER_RECOVERY_KEY = "new-recovery-key";
  const payload = {
    username: "admin",
    password: "replacement-password-long",
    recoveryKey: "new-recovery-key",
  };
  assert.equal((await call(f, "recover", "POST", payload)).status, 200);
  assert.equal((await call(f, "me", "GET", null, auth)).status, 401);
  assert.equal((await call(f, "recover", "POST", payload)).status, 409);
});
test("essential minimum configured by manager blocks pass independently of total", () => {
  const session = {
    config: {
      outcomes: [
        { id: "a", title: "A", weight: 100, essential: true, minScore: 4 },
      ],
      passMark: 70,
    },
    messages: [{ turn: 1, role: "user", content: "Hello customer" }],
  };
  const r = validateAssessment(
    {
      outcomes: [
        {
          id: "a",
          score: 3,
          evidence: [{ turn: 1, quote: "Hello customer" }],
          feedback: "Good",
        },
      ],
    },
    session,
  );
  assert.equal(r.percent, 75);
  assert.equal(r.decision, "Needs more practice");
});
