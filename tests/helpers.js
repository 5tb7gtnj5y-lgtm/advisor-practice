import { TrainingSession } from "../src/worker.js";
export function memoryContext() {
  const values = new Map();
  return {
    storage: {
      async get(k) {
        return structuredClone(values.get(k));
      },
      async put(k, v) {
        values.set(k, structuredClone(v));
      },
      async deleteAll() {
        values.clear();
      },
      async setAlarm(v) {
        this.alarm = v;
      },
      async deleteAlarm() {
        this.alarm = null;
      },
    },
  };
}
export function testEnvironment(
  run = async () => ({
    response: "Thank you. Can you explain what I need to do next?",
  }),
) {
  const sessions = new Map();
  const env = {
    AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    AI: { run },
    LIMITER: { limit: async () => ({ success: true }) },
    SESSIONS: {
      idFromName: (n) => n,
      get(id) {
        if (!sessions.has(id))
          sessions.set(id, new TrainingSession(memoryContext(), env));
        return sessions.get(id);
      },
    },
  };
  return env;
}
export function request(path, method = "GET", data) {
  return new Request("https://practice.test" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://practice.test",
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}
