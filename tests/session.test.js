import test from "node:test";
import assert from "node:assert/strict";
import worker, { TrainingSession, cleanConfig } from "../src/worker.js";
import { memoryContext, testEnvironment, request } from "./helpers.js";
import { outcomes } from "../src/catalog.js";
import { validateAssessment, parseAssessment } from "../src/assessment.js";
async function start(env, config = {}) {
  const r = await worker.fetch(request("/api/sessions", "POST", config), env);
  assert.equal(r.status, 201);
  return r.json();
}
const msg = (
  content = "Hello. I’m your advisor.",
  requestId = "message-0001",
) => ({ content, requestId });
test("health reports configured bindings without claiming live inference", async () => {
  const env = testEnvironment();
  const r = await worker.fetch(request("/api/health"), env);
  const data = await r.json();
  assert.equal(data.status, "ready");
  assert.equal(data.liveInferenceTested, false);
});
test("selected scenario, level and time are stored; hidden facts are withheld", async () => {
  const s = await start(testEnvironment(), {
    scenarioId: "online",
    level: "advanced",
    minutes: 15,
  });
  assert.equal(s.config.scenario.id, "online");
  assert.equal(s.config.level, "advanced");
  assert.equal(s.deadline - s.startedAt, 900000);
  assert.equal(s.config.scenario.facts, undefined);
  assert.equal(s.reviewFacts, null);
  assert.match(s.id, /^[0-9a-f]{64}$/);
});
test("custom scenario and outcomes persist", async () => {
  const s = await start(testEnvironment(), {
    scenarioId: "custom",
    customScenario: {
      title: "A custom call",
      customer: "Jo",
      brief: "Help Jo",
      guidance: "Ask a question.",
      facts: "Fictional Jo is concerned.",
      opening: "Hello there.",
    },
    outcomes: [
      {
        title: "Listen",
        description: "Ask what is wrong.",
        weight: 20,
        essential: true,
      },
    ],
  });
  assert.equal(s.config.scenario.id, "custom");
  assert.equal(s.config.scenario.customer, "Jo");
  assert.equal(s.config.outcomes.length, 1);
});
test("message invokes actual AI binding with customer role; retry is idempotent", async () => {
  let calls = 0,
    input;
  const env = testEnvironment(async (model, options) => {
    calls++;
    input = options;
    return { response: "Thank you. I need help with my letter." };
  });
  const s = await start(env);
  const path = "/api/sessions/" + s.id + "/message";
  const first = await worker.fetch(request(path, "POST", msg()), env);
  assert.equal(first.status, 200);
  const second = await worker.fetch(request(path, "POST", msg()), env);
  assert.equal((await second.json()).messages.length, 3);
  assert.equal(calls, 1);
  assert.match(input.messages[0].content, /CUSTOMER/);
  assert.equal(input.messages.at(-1).role, "user");
});
test("concurrent requests with same ID create one turn", async () => {
  let calls = 0;
  const env = testEnvironment(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return { response: "Hello again." };
  });
  const s = await start(env);
  const path = "/api/sessions/" + s.id + "/message";
  await Promise.all([
    worker.fetch(request(path, "POST", msg()), env),
    worker.fetch(request(path, "POST", msg()), env),
  ]);
  assert.equal(calls, 1);
});
test("chat completion output produces a customer reply", async () => {
  const env = testEnvironment(async () => ({ choices: [{ message: { content: "The amount on the letter worries me." } }] }));
  const s = await start(env);
  const r = await worker.fetch(request(`/api/sessions/${s.id}/message`, "POST", msg()), env);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).messages.at(-1).content, "The amount on the letter worries me.");
});
test("unavailable model identifies the provider code and retains the session", async () => {
  const env = testEnvironment(async () => { throw Error("5007: No such model"); });
  const s = await start(env);
  const r = await worker.fetch(request(`/api/sessions/${s.id}/message`, "POST", msg()), env);
  assert.equal(r.status, 503);
  const error = await r.json();
  assert.equal(error.providerCode, "5007");
  assert.match(error.error, /no longer available/);
  const state = await worker.fetch(request(`/api/sessions/${s.id}`), env);
  assert.equal((await state.json()).messages.length, 1);
});
test("assessment does not retry a provider quota failure", async () => {
  let calls = 0;
  const env = testEnvironment(async (model, input) => {
    if (input.response_format) { calls++; throw Error("3036: daily neuron quota exceeded"); }
    return { response: "Please explain the letter." };
  });
  const s = await start(env);
  await worker.fetch(request(`/api/sessions/${s.id}/message`, "POST", msg()), env);
  const r = await worker.fetch(request(`/api/sessions/${s.id}/assess`, "POST", {}), env);
  assert.equal(r.status, 503);
  assert.equal(calls, 1);
});
test("quota error retains transcript and permits retry without duplicating advisor message", async () => {
  let fail = true;
  const env = testEnvironment(async () => {
    if (fail) throw Error("daily neuron quota exceeded");
    return { response: "I understand." };
  });
  const s = await start(env);
  const path = "/api/sessions/" + s.id + "/message";
  let r = await worker.fetch(request(path, "POST", msg()), env);
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /free AI allowance/);
  r = await worker.fetch(request("/api/sessions/" + s.id), env);
  assert.equal((await r.json()).messages.length, 1);
  fail = false;
  r = await worker.fetch(request(path, "POST", msg()), env);
  assert.equal((await r.json()).messages.length, 3);
});
test("server deadline prevents new advisor messages", async () => {
  const ctx = memoryContext();
  const env = testEnvironment();
  const object = new TrainingSession(ctx, env);
  const config = cleanConfig({ minutes: 5 });
  await object.fetch(request("/create", "POST", { id: "test", config }));
  let s = await ctx.storage.get("session");
  s.deadline = Date.now() - 1;
  await ctx.storage.put("session", s);
  const r = await object.fetch(request("/message", "POST", msg()));
  assert.equal(r.status, 409);
  s = await ctx.storage.get("session");
  assert.equal(s.phase, "ended");
  assert.equal(s.messages.length, 1);
  assert.equal(s.endReason, "Time limit reached");
});
test("timers are restored from storage after a new object instance", async () => {
  const ctx = memoryContext(),
    env = testEnvironment();
  let object = new TrainingSession(ctx, env);
  const a = await (
    await object.fetch(
      request("/create", "POST", {
        id: "restore",
        config: cleanConfig({ minutes: 5 }),
      }),
    )
  ).json();
  object = new TrainingSession(ctx, env);
  const b = await (await object.fetch(request("/state"))).json();
  assert.equal(a.deadline, b.deadline);
});
test("empty attempt yields Not attempted and no inference", async () => {
  let calls = 0;
  const env = testEnvironment(async () => {
    calls++;
    throw Error("should not call");
  });
  const s = await start(env);
  const r = await worker.fetch(
    request("/api/sessions/" + s.id + "/assess", "POST", {}),
    env,
  );
  const result = await r.json();
  assert.equal(result.report.decision, "Not attempted");
  assert.equal(result.report.percent, 0);
  assert.equal(calls, 0);
  assert.ok(result.reviewFacts);
});
const evidenceSession = {
  config: { passMark: 70, outcomes },
  messages: [
    { turn: 0, role: "assistant", content: "Hello customer" },
    { turn: 1, role: "user", content: "Hello. I can help you today." },
  ],
  model: "test",
};
const rawAssessment = () => ({
  summary: "Feedback",
  nextSteps: ["Practise"],
  outcomes: outcomes.map((o) => ({
    id: o.id,
    score: 4,
    evidence: [{ turn: 1, quote: "I can help you today." }],
    feedback: "Test feedback",
    improvement: "Test improvement",
  })),
});
test("weighted percentage is calculated independently of any model total", () => {
  const raw = rawAssessment();
  raw.percent = 999;
  raw.outcomes[0].score = 0;
  const r = validateAssessment(raw, evidenceSession);
  assert.equal(r.percent, 90);
  assert.equal(r.decision, "Provisional pass");
});
test("essential gap blocks pass even with high total", () => {
  const raw = rawAssessment();
  raw.outcomes.find((x) => x.id === "privacy").score = 1;
  const r = validateAssessment(raw, evidenceSession);
  assert.ok(r.percent >= 70);
  assert.equal(r.decision, "Needs more practice");
  assert.equal(r.essentialGaps.length, 1);
});
test("fabricated quotations and customer quotations earn no credit", () => {
  const raw = rawAssessment();
  raw.outcomes[0].evidence = [{ turn: 1, quote: "Invented words" }];
  raw.outcomes[1].evidence = [{ turn: 0, quote: "Hello customer" }];
  const r = validateAssessment(raw, evidenceSession);
  assert.equal(r.outcomes[0].score, 0);
  assert.equal(r.outcomes[1].score, 0);
  assert.equal(r.outcomes[0].verificationIssue, true);
});
test("missing or duplicated outcome makes assessment invalid", () => {
  const raw = rawAssessment();
  raw.outcomes.pop();
  assert.throws(() => validateAssessment(raw, evidenceSession));
  const other = rawAssessment();
  other.outcomes[0].id = "privacy";
  assert.throws(() => validateAssessment(other, evidenceSession));
});
test("assessment JSON may have a code fence", () => {
  assert.deepEqual(parseAssessment('```json\n{"outcomes":[]}\n```'), {
    outcomes: [],
  });
  assert.throws(() => parseAssessment("Not JSON"));
});
test("failed assessment locks conversation but retains transcript and supports retry", async () => {
  let assessFail = true;
  const env = testEnvironment(async (model, input) => {
    if (input.messages[0].content.includes("training assessor")) {
      if (assessFail) return { response: "invalid" };
      const prompt = input.messages[1].content;
      const rubric = JSON.parse(
        prompt.split("RUBRIC: ")[1].split("\nTRANSCRIPT")[0],
      );
      return {
        response: JSON.stringify({
          summary: "Review",
          nextSteps: ["Improve"],
          outcomes: rubric.map((o) => ({
            id: o.id,
            score: 1,
            evidence: [{ turn: 1, quote: "Hello. I’m your advisor." }],
            feedback: "Limited evidence",
            improvement: "Develop this.",
          })),
        }),
      };
    }
    return { response: "Please help me." };
  });
  const s = await start(env);
  const path = "/api/sessions/" + s.id;
  await worker.fetch(request(path + "/message", "POST", msg()), env);
  let r = await worker.fetch(request(path + "/assess", "POST", {}), env);
  assert.equal(r.status, 503);
  let state = await (await worker.fetch(request(path), env)).json();
  assert.equal(state.phase, "ended");
  assert.equal(state.messages.length, 3);
  assessFail = false;
  r = await worker.fetch(request(path + "/assess", "POST", {}), env);
  state = await r.json();
  assert.equal(state.phase, "assessed");
  assert.equal(state.report.outcomes.length, 7);
  const again = await (
    await worker.fetch(request(path + "/assess", "POST", {}), env)
  ).json();
  assert.equal(state.report.generatedAt, again.report.generatedAt);
});
test("delete and 24-hour expiry remove access", async () => {
  const env = testEnvironment(),
    s = await start(env);
  let r = await worker.fetch(request("/api/sessions/" + s.id, "DELETE"), env);
  assert.equal(r.status, 200);
  r = await worker.fetch(request("/api/sessions/" + s.id), env);
  assert.equal(r.status, 404);
  const ctx = memoryContext();
  const object = new TrainingSession(ctx, env);
  await object.fetch(
    request("/create", "POST", { id: "expired", config: cleanConfig() }),
  );
  let saved = await ctx.storage.get("session");
  saved.expiresAt = Date.now() - 1;
  await ctx.storage.put("session", saved);
  r = await object.fetch(request("/state"));
  assert.equal(r.status, 404);
  await object.alarm();
  assert.equal(await ctx.storage.get("session"), undefined);
});
test("cross-origin requests are refused", async () => {
  const r = await worker.fetch(
    new Request("https://practice.test/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.test",
      },
      body: "{}",
    }),
    testEnvironment(),
  );
  assert.equal(r.status, 403);
});
test("rate limiting gives a useful error", async () => {
  const env = testEnvironment();
  env.LIMITER.limit = async () => ({ success: false });
  const r = await worker.fetch(request("/api/sessions", "POST", {}), env);
  assert.equal(r.status, 429);
});
test("invalid session settings are rejected", () => {
  for (const config of [
    null,
    { minutes: -1 },
    { minutes: 61 },
    { passMark: 0 },
    { outcomes: [] },
    { customScenario: { title: "Incomplete" } },
  ])
    assert.throws(() => cleanConfig(config));
});
