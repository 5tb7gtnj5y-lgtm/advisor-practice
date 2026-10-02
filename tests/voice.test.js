import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import worker from "../src/worker.js";
import { request, testEnvironment } from "./helpers.js";

const source = readFileSync(new URL("../public/voice.js", import.meta.url), "utf8");
function fixture({ input = true, output = true, secure = true, prefixed = false } = {}) {
  const captures = [], spoken = [], timers = new Map(), drafts = [], notices = [], states = [];
  let nextTimer = 0, cancelCount = 0;
  class Recognition {
    constructor() { captures.push(this); this.starts = this.stops = this.aborts = 0; }
    start() { this.starts++; }
    stop() { this.stops++; }
    abort() { this.aborts++; }
    result(...words) {
      this.onresult({ results: words.map(text => [{ transcript: text }]) });
    }
    error(error) { this.onerror({ error }); }
    end() { this.onend(); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const voices = [{ voiceURI: "british", lang: "en-GB", name: "UK voice" },
    { voiceURI: "american", lang: "en-US", name: "US voice" }];
  const host = {
    isSecureContext: secure,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    ...(input ? { [prefixed ? "webkitSpeechRecognition" : "SpeechRecognition"]: Recognition } : {}),
    ...(output ? {
      SpeechSynthesisUtterance: Utterance,
      speechSynthesis: {
        getVoices: () => voices,
        cancel() { cancelCount++; },
        speak(utterance) { spoken.push(utterance); },
        addEventListener() {},
      },
    } : {}),
  };
  vm.runInNewContext(source, { window: host });
  const controller = new host.AdvisorPracticeVoice.Controller({
    onDraft: text => drafts.push(text),
    onNotice: (text, error) => notices.push({ text, error }),
    onState: state => states.push(state),
  });
  controller.setContext(true);
  return {
    host, controller, captures, spoken, drafts, notices, states, timers, voices,
    cancelCount: () => cancelCount,
    runTimer(ms) {
      const match = [...timers].find(([, timer]) => timer.ms === ms);
      assert.ok(match, "timer exists: " + ms);
      timers.delete(match[0]);
      match[1].fn();
    },
  };
}
test("voice is opt-in: construction never opens the microphone or speaks", () => {
  const f = fixture();
  assert.equal(f.captures.length, 0);
  assert.equal(f.spoken.length, 0);
  assert.equal(f.controller.snapshot().spoken, false);
});
test("standard and Safari-prefixed speech recognition transcribe one reviewed turn", () => {
  for (const prefixed of [false, true]) {
    const f = fixture({ prefixed });
    assert.equal(f.controller.startListening("Hello."), true);
    const r = f.captures[0];
    assert.equal(r.starts, 1);
    assert.equal(r.lang, "en-GB");
    assert.equal(r.continuous, false);
    r.result("I understand");
    r.result("I understand", "your concern.");
    assert.equal(f.drafts.at(-1), "Hello. I understand your concern.");
    r.end();
    assert.equal(f.controller.snapshot().listening, false);
    assert.match(f.notices.at(-1).text, /Check the words/);
    assert.equal(f.spoken.length, 0);
  }
});
test("stop waits for the final words and never submits a reply", () => {
  const f = fixture();
  f.controller.startListening();
  const r = f.captures[0];
  r.result("Could you");
  f.controller.stopListening();
  assert.equal(r.stops, 1);
  assert.equal(f.controller.snapshot().stopping, true);
  r.result("Could you explain the letter?");
  r.end();
  assert.equal(f.drafts.at(-1), "Could you explain the letter?");
  assert.equal(f.timers.size, 0);
});
test("a stuck stop releases the mic and retains the visible transcription", () => {
  const f = fixture();
  f.controller.startListening();
  const r = f.captures[0];
  r.result("Please tell me more.");
  f.controller.stopListening();
  f.runTimer(2500);
  assert.equal(r.aborts, 1);
  assert.equal(f.controller.snapshot().listening, false);
  r.result("late words");
  assert.equal(f.drafts.at(-1), "Please tell me more.");
});
test("microphone capture has a sixty-second limit without auto-restart", () => {
  const f = fixture();
  f.controller.startListening();
  f.runTimer(60000);
  assert.equal(f.captures[0].stops, 1);
  f.captures[0].end();
  assert.equal(f.captures.length, 1);
});
test("permission, network, no-speech and missing-mic errors preserve the draft and allow retry", () => {
  for (const error of ["not-allowed", "service-not-allowed", "network", "no-speech", "audio-capture", "language-not-supported"]) {
    const f = fixture();
    f.controller.startListening("Typed reply");
    f.captures[0].error(error);
    assert.equal(f.controller.snapshot().listening, false);
    assert.equal(f.notices.at(-1).error, true);
    assert.equal(f.drafts.length, 0);
    assert.equal(f.controller.startListening("Typed reply"), true);
  }
});
test("unsupported or insecure input does not prevent spoken output or typing", () => {
  for (const options of [{ input: false }, { secure: false }]) {
    const f = fixture(options);
    assert.equal(f.controller.startListening("typed"), false);
    assert.equal(f.drafts.length, 0);
    assert.match(f.notices.at(-1).text, /Type your reply/);
    f.controller.setSpoken(true);
    assert.equal(f.controller.speak("Hello."), true);
  }
});
test("unsupported speech output leaves dictation available", () => {
  const f = fixture({ output: false });
  f.controller.setSpoken(true);
  assert.equal(f.controller.snapshot().spoken, false);
  assert.equal(f.controller.speak("Hello."), false);
  assert.equal(f.controller.startListening(), true);
});
test("dictation cannot exceed the existing one-thousand-character reply limit", () => {
  const f = fixture();
  assert.equal(f.controller.startListening("x".repeat(1000)), false);
  f.controller.startListening("Existing reply");
  f.captures[0].result("x".repeat(1200));
  assert.equal(f.drafts.at(-1).length, 1000);
  assert.equal(f.captures[0].stops, 1);
});
test("sending, assessment, reset and leaving the page invalidate late recognition callbacks", () => {
  for (const finish of [c => c.setContext(true, true), c => c.setContext(false), c => c.reset(), c => c.cancelListening()]) {
    const f = fixture();
    f.controller.startListening();
    const r = f.captures[0];
    r.result("Existing words");
    finish(f.controller);
    r.result("Words from the old attempt");
    r.end();
    assert.equal(f.drafts.at(-1), "Existing words");
    assert.equal(f.controller.snapshot().listening, false);
    assert.equal(f.timers.size, 0);
  }
});
test("muting stops playback and ignores callbacks from cancelled speech", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.speak("Long reply. ".repeat(60));
  assert.equal(f.spoken.length, 1);
  f.controller.setSpoken(false);
  f.spoken[0].onend();
  assert.equal(f.spoken.length, 1);
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.controller.speak("More"), false);
});
test("speech chunks retain the exact words and play sequentially with a British default voice", () => {
  const f = fixture();
  const text = "I understand your concern and want to help. ".repeat(15).trim();
  const chunks = f.host.AdvisorPracticeVoice.speechChunks(text);
  assert.equal(chunks.join(" "), text);
  f.controller.setSpoken(true);
  f.controller.speak(text);
  for (let i = 0; i < chunks.length; i++) {
    assert.equal(f.spoken[i].text, chunks[i]);
    assert.equal(f.spoken[i].voice.voiceURI, "british");
    f.spoken[i].onend();
  }
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.timers.size, 0);
});
test("voice selection, replay and interruptions cancel old audio before microphone input", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.selectVoice("american");
  f.controller.speak("First reply.");
  assert.equal(f.spoken[0].voice.voiceURI, "american");
  f.controller.speak("Replay.");
  f.spoken[0].onend();
  assert.equal(f.spoken.length, 2);
  f.controller.startListening();
  assert.equal(f.controller.snapshot().speaking, false);
  assert.equal(f.controller.snapshot().listening, true);
  const r = f.captures[0];
  f.controller.speak("A customer reply.");
  assert.equal(r.aborts, 1);
  r.result("Customer's own voice must not become an advisor reply");
  assert.equal(f.drafts.length, 0);
});
test("autoplay errors and stuck speech show a replay fallback without affecting text", () => {
  const f = fixture();
  f.controller.setSpoken(true);
  f.controller.speak("Customer reply");
  f.spoken[0].onerror({ error: "not-allowed" });
  assert.match(f.notices.at(-1).text, /tap to play audio/);
  f.controller.speak("Customer reply");
  f.runTimer(30000);
  assert.equal(f.controller.snapshot().speaking, false);
  assert.match(f.notices.at(-1).text, /replay/);
});

class Element {
  constructor() {
    this.value = ""; this.textContent = ""; this.children = []; this.handlers = {};
    this.attributes = {}; this.disabled = false; this.readOnly = false;
    this.classList = { toggle() {} };
  }
  get options() { return this.children; }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, fn) { this.handlers[key] = fn; }
  click() { if (!this.disabled) this.handlers.click?.(); }
}
function controlsFixture() {
  const f = fixture();
  const elements = Object.fromEntries(["voiceTalk", "voiceMute", "voiceReplay", "voiceStop", "voiceChoice", "voiceStatus"].map(id => [id, new Element()]));
  const document = { hidden: false, getElementById: id => elements[id], createElement: () => new Element() };
  const input = new Element(), send = new Element();
  const ui = f.host.AdvisorPracticeVoice.createControls({ document, messageInput: input, sendButton: send });
  return { ...f, elements, document, input, send, ui };
}
const session = (messages = [{ role: "assistant", turn: 0, content: "Hello, I need help with my bill." }]) => ({ id: "attempt-1", phase: "active", messages });
test("voice buttons update textarea without sending and restore Send after stopping", () => {
  const f = controlsFixture();
  f.ui.updateSession(session());
  f.elements.voiceTalk.click();
  assert.equal(f.send.disabled, true);
  assert.equal(f.input.readOnly, true);
  f.captures[0].result("I can help you with that.");
  assert.equal(f.input.value, "I can help you with that.");
  f.elements.voiceTalk.click();
  f.captures[0].end();
  assert.equal(f.send.disabled, false);
  assert.equal(f.input.readOnly, false);
  assert.equal(f.elements.voiceTalk.textContent, "Talk");
});
test("spoken replies wait for request completion and do not replay on session refresh", () => {
  const f = controlsFixture();
  f.ui.updateSession(session());
  f.elements.voiceMute.click();
  assert.equal(f.spoken.length, 1);
  f.ui.setBusy(true);
  const next = session([...session().messages, { role: "user", turn: 2, content: "Hello" }, { role: "assistant", turn: 3, content: "Can you explain?" }]);
  f.ui.updateSession(next);
  assert.equal(f.spoken.length, 1);
  f.ui.setBusy(false);
  assert.equal(f.spoken.length, 2);
  assert.equal(f.spoken[1].text, "Can you explain?");
  f.ui.updateSession(next);
  assert.equal(f.spoken.length, 2);
  f.ui.updateSession({ ...next, phase: "ended" });
  assert.equal(f.elements.voiceTalk.disabled, true);
  assert.equal(f.elements.voiceReplay.disabled, true);
});
test("hidden pages and manual mute stop audio; new attempts cannot get old callbacks", () => {
  const f = controlsFixture();
  f.ui.updateSession(session());
  f.elements.voiceMute.click();
  f.ui.stop();
  f.document.hidden = true;
  f.ui.setBusy(true);
  f.ui.updateSession(session([{ role: "assistant", turn: 3, content: "new" }]));
  f.ui.setBusy(false);
  assert.equal(f.spoken.length, 1);
  f.ui.reset();
  f.ui.setBusy(false);
  assert.equal(f.elements.voiceTalk.disabled, true);
});
test("a new attempt reads its opening turn zero when spoken replies are already enabled", () => {
  const f = controlsFixture();
  f.ui.updateSession(session());
  f.elements.voiceMute.click();
  assert.equal(f.spoken.length, 1);
  f.ui.reset();
  f.ui.setBusy(true);
  f.ui.updateSession({ ...session(), id: "attempt-2" });
  assert.equal(f.spoken.length, 1);
  f.ui.setBusy(false);
  assert.equal(f.spoken.length, 2);
  assert.equal(f.spoken.at(-1).text, session().messages[0].content);
});
test("dictated text follows the existing customer API and normal evidence transcript", async () => {
  const f = controlsFixture();
  const env = testEnvironment(async () => ({ response: "Thank you. My bill increased this month." }));
  const started = await (await worker.fetch(request("/api/sessions", "POST", { minutes: 5 }), env)).json();
  f.ui.updateSession(started);
  f.elements.voiceMute.click();
  f.elements.voiceTalk.click();
  f.captures[0].result("I understand your concern. Could you tell me what changed?");
  f.captures[0].end();
  const content = f.input.value;
  f.ui.setBusy(true);
  const response = await worker.fetch(request("/api/sessions/" + started.id + "/message", "POST", { content, requestId: "voice-test-0001" }), env);
  assert.equal(response.status, 200);
  const answered = await response.json();
  f.ui.updateSession(answered);
  f.ui.setBusy(false);
  assert.equal(answered.messages[1].content, content);
  assert.equal(answered.messages[2].content, f.spoken.at(-1).text);
  assert.equal(answered.messages[1].role, "user");
  assert.equal(answered.config.minutes, 5);
  assert.equal(answered.config.scenario.facts, undefined);
});
