"use strict";
const $ = (id) => document.getElementById(id);
let catalog,
  session = null,
  busy = false,
  clockOffset = 0,
  pending = null,
  autoAttempt = false,
  ready = false;
const storage = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
  remove(k) {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function notify(text, error = false) {
  $("notice").textContent = text;
  $("notice").className = "notice" + (error ? " error" : "");
  $("notice").hidden = !text;
}
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
      signal: AbortSignal.timeout(120000),
    });
  } catch {
    throw new Error(
      "The connection was interrupted. Try again. Your saved session and transcript are still available.",
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      "The server returned an unexpected response. Check that the Cloudflare Worker is deployed.",
    );
  }
  if (!res.ok)
    throw new Error(data.error || "The request could not be completed.");
  return data;
}
const post = (path, data = {}) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
const sessionPath = (suffix) =>
  "/api/sessions/" + session.id + (suffix ? "/" + suffix : "");
const voice = window.AdvisorPracticeVoice?.createControls({
  document,
  messageInput: $("message"),
  sendButton: $("send"),
});
function show(view) {
  for (const id of ["setup", "session", "report"]) $(id).hidden = id !== view;
  document.body.dataset.view = view;
  for (const [id, stage] of [["stepSetup", "setup"], ["stepSession", "session"], ["stepReport", "report"]]) {
    if (stage === view) $(id).setAttribute("aria-current", "step");
    else $(id).removeAttribute("aria-current");
  }
}
function setInteractionMode(mode) {
  if (mode === "text") {
    if ($("voiceMute").getAttribute("aria-pressed") === "true") $("voiceMute").click();
    voice?.stop();
  }
  document.body.dataset.mode = mode;
  $("voiceControls").hidden = mode !== "voice";
  $("textMode").setAttribute("aria-pressed", String(mode === "text"));
  $("voiceMode").setAttribute("aria-pressed", String(mode === "voice"));
  $("message").placeholder = mode === "voice"
    ? "Your spoken words appear here. Check them before sending…"
    : "Type your response to the customer…";
}
function renderScenarioLibrary() {
  if (!catalog) return;
  const query = $("scenarioSearch").value.trim().toLocaleLowerCase("en-GB");
  const category = $("scenarioCategory").value;
  const matching = catalog.scenarios.filter(s => (!category || s.category === category)
    && [s.title, s.brief, s.category, s.customer].join(" ").toLocaleLowerCase("en-GB").includes(query));
  $("scenarioCount").textContent = matching.length + (matching.length === 1 ? " scenario" : " scenarios");
  $("scenarioEmpty").hidden = matching.length > 0;
  const focusedId = document.activeElement?.dataset.scenarioId;
  $("scenarioCards").replaceChildren();
  for (const s of matching) {
    const card = el("button", undefined, "scenario-card");
    card.type = "button";
    card.dataset.scenarioId = s.id;
    card.setAttribute("aria-label", s.title);
    card.setAttribute("aria-pressed", String(s.id === $("scenario").value));
    card.append(el("span", s.category || "Customer practice", "card-category"),
      el("strong", s.title), el("span", s.brief, "card-description"),
      el("span", s.id === $("scenario").value ? "Selected · view briefing" : "Choose scenario →", "card-action"));
    card.addEventListener("click", () => {
      $("scenario").value = s.id;
      scenarioSelected();
      $("scenarioLibrary").open = false;
      $("scenarioTitle").tabIndex = -1;
      $("scenarioTitle").focus();
    });
    $("scenarioCards").append(card);
    if (focusedId === s.id) card.focus({ preventScroll: true });
  }
}
function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0] || "")
    .join("")
    .toUpperCase();
}
function scenarioSelected() {
  if (!catalog) return;
  const s = catalog.scenarios.find((x) => x.id === $("scenario").value) || {
    title: $("customTitle").value || "Your custom scenario",
    brief:
      $("customBrief").value ||
      "Complete the custom scenario in Trainer settings below.",
    customer: $("customCustomer").value || "Customer",
    opening:
      $("customOpening").value || "Your opening message will appear here.",
    guidance:
      $("customGuidance").value || "Add your fictional training guidance.",
    category: "CUSTOM TRAINING",
  };
  for (const [id, key] of [
    ["scenarioTitle", "title"],
    ["scenarioBrief", "brief"],
    ["customerName", "customer"],
    ["opening", "opening"],
    ["previewGuidance", "guidance"],
    ["category", "category"],
  ])
    $(id).textContent = s[key];
  if (catalog.managed && s.id) {
    $("level").value = s.level;
    if (![...$("minutes").options].some((o) => Number(o.value) === s.minutes)) {
      const opt = el("option", s.minutes + " minutes");
      opt.value = s.minutes;
      $("minutes").append(opt);
    }
    $("minutes").value = s.minutes;
    $("passMark").value = s.passMark;
    rubricEditor(s.outcomes || catalog.outcomes);
  }
  $("previewInitials").textContent = initials(s.customer);
  renderScenarioLibrary();
}
function rubricValues() {
  return [...$("rubricEditor").children].map((row) => ({
    title: row.querySelector('[data-field="title"]').value,
    description: row.querySelector('[data-field="description"]').value,
    weight: Number(row.querySelector('[data-field="weight"]').value),
    essential: row.querySelector('[data-field="essential"]').checked,
    minScore: Number(row.dataset.minScore ?? 2),
  }));
}
function previewOutcomes() {
  const list = rubricValues();
  $("outcomesPreview").replaceChildren();
  list.forEach((o, i) => {
    const row = el("div", undefined, "outcome-item");
    row.append(el("span", i + 1, "outcome-number"));
    const label = el("div", o.title || "Untitled outcome");
    label.append(
      el("small", o.weight + " weight" + (o.essential ? " · Essential" : "")),
    );
    row.append(label);
    $("outcomesPreview").append(row);
  });
}
function rubricEditor(items) {
  $("rubricEditor").replaceChildren();
  items.forEach((o) => addOutcome(o));
  previewOutcomes();
}
function addOutcome(
  o = { title: "", description: "", weight: 10, essential: false },
) {
  if ($("rubricEditor").children.length >= 10) {
    notify("You can use up to 10 outcomes.", true);
    return;
  }
  const row = el("div", undefined, "rubric-row");
  row.dataset.minScore = o.minScore ?? 2;
  for (const [field, title, type] of [
    ["title", "Outcome title", "text"],
    ["weight", "Weight", "number"],
    ["description", "What does success look like?", "textarea"],
  ]) {
    const lab = el(
      "label",
      title,
      field === "description" ? "description" : undefined,
    );
    const input = el(type === "textarea" ? "textarea" : "input");
    input.dataset.field = field;
    input.value = o[field];
    if (type !== "textarea") input.type = type;
    else {
      input.rows = 2;
      input.maxLength = 1000;
    }
    if (field === "weight") {
      input.min = 1;
      input.max = 100;
    }
    if (field === "title") input.maxLength = 120;
    input.addEventListener("input", previewOutcomes);
    lab.append(input);
    row.append(lab);
  }
  const lab = el("label", undefined, "check");
  const check = el("input");
  check.type = "checkbox";
  check.dataset.field = "essential";
  check.checked = o.essential;
  check.addEventListener("change", previewOutcomes);
  lab.append(check, document.createTextNode("Essential"));
  row.append(lab);
  const del = el("button", "Remove", "quiet danger");
  del.type = "button";
  del.addEventListener("click", () => {
    if ($("rubricEditor").children.length === 1) {
      notify("Keep at least one outcome.", true);
      return;
    }
    row.remove();
    previewOutcomes();
  });
  row.append(del);
  $("rubricEditor").append(row);
}
const customMap = {
  title: "customTitle",
  customer: "customCustomer",
  brief: "customBrief",
  opening: "customOpening",
  guidance: "customGuidance",
  facts: "customFacts",
};
function settings() {
  const config = {
    advisor: $("advisor").value,
    scenarioId: $("scenario").value,
    level: $("level").value,
    minutes: Number($("minutes").value),
    passMark: Number($("passMark").value),
    outcomes: rubricValues(),
  };
  if (config.scenarioId === "custom")
    config.customScenario = Object.fromEntries(
      Object.entries(customMap).map(([k, id]) => [k, $(id).value]),
    );
  return config;
}
function validateSettings(s) {
  if (
    !s.outcomes.length ||
    s.outcomes.some(
      (o) =>
        !o.title.trim() ||
        !o.description.trim() ||
        o.weight < 1 ||
        o.weight > 100 ||
        !Number.isFinite(o.weight),
    )
  )
    throw new Error(
      "Complete each outcome’s title, success description and weight (1–100).",
    );
  if (
    s.customScenario &&
    ["title", "brief", "opening", "guidance", "facts"].some(
      (k) => !s.customScenario[k].trim(),
    )
  )
    throw new Error(
      "Complete the custom scenario fields under Trainer settings.",
    );
}
function download(name, content, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function applyProfile(p) {
  if (
    !p ||
    p.kind !== "advisor-practice-profile" ||
    !p.settings ||
    !Array.isArray(p.settings.outcomes) ||
    p.settings.outcomes.length < 1 ||
    p.settings.outcomes.length > 10
  )
    throw new Error("This is not a valid Advisor Practice training profile.");
  const s = p.settings;
  validateSettings(s);
  $("scenario").value = catalog.scenarios.some((x) => x.id === s.scenarioId)
    ? s.scenarioId
    : "custom";
  $("level").value = ["foundation", "intermediate", "advanced"].includes(
    s.level,
  )
    ? s.level
    : "foundation";
  $("minutes").value = [0, 5, 10, 15, 20, 30, 60].includes(Number(s.minutes))
    ? s.minutes
    : 10;
  $("passMark").value = Math.min(100, Math.max(1, Number(s.passMark) || 70));
  rubricEditor(s.outcomes);
  const c = p.customScenario || s.customScenario || {};
  for (const [k, id] of Object.entries(customMap))
    $(id).value = String(c[k] || "");
  scenarioSelected();
}
function setBusy(value, label = "") {
  busy = value;
  $("start").disabled = value || !ready;
  $("start").textContent = value && !session ? "Starting conversation…" : "Start conversation";
  $("chooseAnother").disabled = value;
  $("tryAgain").disabled = value;
  $("send").disabled = value;
  $("message").disabled = value || session?.phase !== "active";
  $("finish").disabled = value;
  $("retryAssessment").disabled = value;
  $("chatStatus").textContent = label;
  voice?.setBusy(value);
}
function renderMessage(m, target) {
  const item = el(
    "div",
    undefined,
    "message" + (m.role === "user" ? " advisor" : ""),
  );
  item.append(
    el(
      "span",
      (m.role === "user" ? "Advisor" : "Customer") + " · turn " + m.turn,
      "message-label",
    ),
    el("div", m.content, "bubble"),
  );
  target.append(item);
}
function adopt(s) {
  const changed = !session || session.id !== s.id;
  session = s;
  voice?.updateSession(s);
  clockOffset = s.serverNow - Date.now();
  storage.set("advisorPracticeSession", s.id);
  if (changed) {
    autoAttempt = false;
    $("messages").replaceChildren();
  }
  if (s.phase === "assessed") {
    renderReport();
    show("report");
    return;
  }
  show("session");
  $("sessionLevel").textContent =
    s.config.level.toUpperCase() +
    " · " +
    (s.config.minutes ? s.config.minutes + " MINUTES" : "UNTIMED");
  $("sessionTitle").textContent = s.config.scenario.title;
  $("chatName").textContent = s.config.scenario.customer;
  $("chatInitials").textContent = initials(s.config.scenario.customer);
  $("customerPortrait").textContent = initials(s.config.scenario.customer);
  $("customerProfileName").textContent = s.config.scenario.customer;
  $("activeBrief").textContent = s.config.scenario.brief;
  $("activeGuidance").textContent = s.config.scenario.guidance;
  $("activeOutcomes").replaceChildren(
    ...s.config.outcomes.map((o) =>
      el("li", o.title + (o.essential ? " (essential)" : "")),
    ),
  );
  if ($("messages").children.length > s.messages.length)
    $("messages").replaceChildren();
  for (let i = $("messages").children.length; i < s.messages.length; i++)
    renderMessage(s.messages[i], $("messages"));
  $("messages").scrollTop = $("messages").scrollHeight;
  const ended = s.phase !== "active";
  $("phaseTag").textContent = ended ? "Conversation ended" : "In progress";
  $("messageForm").hidden = ended;
  $("sessionEnded").hidden = !ended;
  $("finish").hidden = ended;
  $("endExplanation").textContent =
    (s.endReason || "Conversation ended") +
    ". Your transcript is saved; get your assessment below.";
  setBusy(busy);
  tick();
}
function tick() {
  if (!session || session.phase === "assessed") return;
  const left = session.deadline
    ? Math.max(0, session.deadline - Date.now() - clockOffset)
    : null;
  $("timer").textContent =
    left === null
      ? "Untimed"
      : Math.floor(left / 60000)
          .toString()
          .padStart(2, "0") +
        ":" +
        Math.floor((left % 60000) / 1000)
          .toString()
          .padStart(2, "0");
  $("timer").parentElement.classList.toggle(
    "urgent",
    left !== null && left < 60000,
  );
  $("timerLabel").textContent =
    session.phase === "active" ? "Time remaining" : "Session ended";
  if (
    (session.phase === "active" && left === 0) ||
    (session.phase === "ended" &&
      ["Time limit reached", "30-message limit reached"].includes(
        session.endReason,
      ))
  ) {
    $("send").disabled = true;
    $("message").disabled = true;
    if (!busy && !autoAttempt) {
      autoAttempt = true;
      assess();
    }
  }
}
async function assess() {
  if (!session || busy) return;
  voice?.stop();
  notify("");
  setBusy(true, "Assessing the conversation… This may take a minute.");
  try {
    adopt(await post(sessionPath("assess")));
    notify("");
  } catch (e) {
    notify(e.message, true);
    try {
      adopt(await api(sessionPath()));
    } catch {}
  } finally {
    setBusy(false);
    tick();
  }
}
function renderReport() {
  const s = session,
    r = s.report;
  $("reportSubtitle").textContent =
    s.config.advisor +
    " · " +
    s.config.scenario.title +
    " · " +
    s.config.level +
    " · " +
    new Date(s.startedAt).toLocaleString("en-GB");
  $("score").textContent = r.percent + "%";
  $("decision").textContent = r.decision;
  $("reportSummary").textContent = r.summary;
  const strengths = r.outcomes.filter(o => o.score >= 3);
  const development = r.outcomes.filter(o => o.score < 3);
  $("strengthsList").replaceChildren(...(strengths.length
    ? strengths.map(o => el("li", o.title))
    : [el("li", "Keep practising; no outcomes reached 3 out of 4 in this attempt.")]));
  $("developmentList").replaceChildren(...(development.length
    ? development.map(o => el("li", o.title))
    : [el("li", "Build consistency by trying a more challenging conversation.")]));
  $("passRule").textContent =
    "Pass mark: " +
    r.passMark +
    "%. Essential outcomes must meet their configured minimum. Scores are weighted and calculated by the server.";
  $("essentialGaps").hidden = !r.essentialGaps.length;
  $("essentialGaps").textContent =
    "Essential outcomes to improve: " + r.essentialGaps.join("; ");
  $("reportOutcomes").replaceChildren();
  r.outcomes.forEach((o) => {
    const card = el("article", undefined, "panel assessment-card");
    const heading = el("div", undefined, "section-heading");
    heading.append(
      el("h2", o.title + (o.essential ? " · Essential" : "")),
      el("span", o.score + " / 4 · weight " + o.weight, "score-pill"),
    );
    card.append(
      heading,
      el("p", o.description, "small-note"),
    );
    const meter = el("div", undefined, "skill-meter");
    meter.setAttribute("role", "meter");
    meter.setAttribute("aria-label", o.title + " score");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "4");
    meter.setAttribute("aria-valuenow", String(o.score));
    const fill = el("span");
    fill.style.width = (o.score / 4 * 100) + "%";
    meter.append(fill);
    const detail = el("details");
    detail.append(el("summary", "Feedback and evidence"), el("p", o.feedback));
    card.append(meter, detail);
    if (!o.evidence.length)
      detail.append(el("p", "No credited advisor evidence.", "small-note"));
    for (const e of o.evidence) {
      const q = el("blockquote", "“" + e.quote + "”");
      q.append(el("cite", "Advisor · turn " + e.turn));
      detail.append(q);
    }
    if (o.improvement)
      detail.append(el("p", "Next time: " + o.improvement, "improvement"));
    $("reportOutcomes").append(card);
  });
  $("nextSteps").replaceChildren(...r.nextSteps.map((x) => el("li", x)));
  $("reportTranscript").replaceChildren();
  s.messages.forEach((m) => renderMessage(m, $("reportTranscript")));
  $("reviewFacts").textContent =
    "Fictional customer profile: " + (s.reviewFacts || "Not available");
  $("reviewGuidance").textContent =
    "Training guidance: " + s.config.scenario.guidance;
}
function transcriptText() {
  if (!session) return "";
  return (
    "ADVISOR PRACTICE — FICTIONAL TRAINING\nAdvisor: " +
    session.config.advisor +
    "\nScenario: " +
    session.config.scenario.title +
    "\nDifficulty: " +
    session.config.level +
    "\nStarted: " +
    new Date(session.startedAt).toISOString() +
    "\nEnded: " +
    (session.endedAt
      ? new Date(session.endedAt).toISOString()
      : "In progress") +
    "\nEnd reason: " +
    (session.endReason || "—") +
    "\nPass mark: " +
    session.config.passMark +
    "%\n\n" +
    session.messages
      .map(
        (m) =>
          "Turn " +
          m.turn +
          " — " +
          (m.role === "user" ? "ADVISOR" : "CUSTOMER") +
          "\n" +
          m.content,
      )
      .join("\n\n")
  );
}
function reportText() {
  const r = session.report;
  let t =
    "TRAINING ASSESSMENT — AI SCORES REQUIRE TRAINER REVIEW\n\n" +
    r.decision +
    " — " +
    r.percent +
    "%\nPass mark: " +
    r.passMark +
    "%\nEssential outcomes must meet their configured minimum\n\n" +
    r.summary +
    "\n";
  for (const o of r.outcomes)
    t +=
      "\n" +
      o.title +
      " — " +
      o.score +
      "/4, weight " +
      o.weight +
      (o.essential ? ", essential" : "") +
      "\nSuccess: " +
      o.description +
      "\nFeedback: " +
      o.feedback +
      "\nEvidence: " +
      (o.evidence.map((e) => "Turn " + e.turn + ": " + e.quote).join("\n") ||
        "None credited") +
      "\nNext time: " +
      o.improvement +
      "\n";
  t +=
    "\nNEXT STEPS\n" +
    r.nextSteps.join("\n") +
    "\n\nTRAINER REVIEW\nReviewer: " +
    $("reviewer").value +
    "\nDecision: " +
    $("reviewDecision").value +
    "\nNotes: " +
    $("reviewNotes").value +
    "\n\n" +
    transcriptText() +
    "\n\nTRAINING GUIDANCE\n" +
    session.config.scenario.guidance +
    "\n\nFICTIONAL CUSTOMER PROFILE\n" +
    session.reviewFacts +
    "\n\nAI model: " +
    r.model +
    "\nGenerated: " +
    new Date(r.generatedAt).toISOString() +
    "\nSession ID: " +
    session.id;
  return t;
}
$("setupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  try {
    const config = settings();
    validateSettings(config);
    notify("");
    setBusy(true);
    const s = await post("/api/sessions", config);
    $("reviewer").value = "";
    $("reviewNotes").value = "";
    $("reviewDecision").value = "Awaiting review";
    pending = null;
    adopt(s);
  } catch (err) {
    notify(err.message, true);
  } finally {
    setBusy(false);
    if (session?.phase === "active") $("message").focus();
  }
});
$("messageForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy || !session || session.phase !== "active") return;
  if (voice?.isListening()) {
    notify("Stop listening, check your words, then press Send reply.");
    return;
  }
  const content = $("message").value.trim();
  if (!content) return;
  if (session.deadline && Date.now() + clockOffset >= session.deadline) {
    assess();
    return;
  }
  if (!pending || pending.content !== content)
    pending = { content, requestId: crypto.randomUUID() };
  notify("");
  setBusy(true, "The customer is replying…");
  try {
    adopt(await post(sessionPath("message"), pending));
    $("message").value = "";
    pending = null;
  } catch (err) {
    notify(err.message, true);
    try {
      adopt(await api(sessionPath()));
    } catch {}
  } finally {
    setBusy(false);
    tick();
    if (session.phase === "active") $("message").focus();
  }
});
$("message").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("messageForm").requestSubmit();
  }
});
$("finish").addEventListener("click", assess);
$("retryAssessment").addEventListener("click", assess);
$("scenario").addEventListener("change", scenarioSelected);
$("scenarioSearch").addEventListener("input", renderScenarioLibrary);
$("scenarioCategory").addEventListener("change", renderScenarioLibrary);
$("textMode").addEventListener("click", () => setInteractionMode("text"));
$("voiceMode").addEventListener("click", () => setInteractionMode("voice"));
$("chooseAnother").addEventListener("click", () => {
  if (busy) return;
  if (session?.phase === "active" && !confirm("Leave this practice and choose another scenario? This will not assess it. Download the transcript first if you need it.")) return;
  $("newSession").click();
  $("scenarioLibrary").open = true;
  $("scenarioSearch").focus();
});
$("tryAgain").addEventListener("click", () => {
  if (busy || !session) return;
  const previous = session.config;
  $("newSession").click();
  if ([...$("scenario").options].some(o => o.value === previous.scenario.id)) {
    $("scenario").value = previous.scenario.id;
    scenarioSelected();
    $("level").value = previous.level;
    $("minutes").value = previous.minutes;
  }
  $("scenarioLibrary").open = false;
  $("start").focus();
});
for (const id of Object.values(customMap))
  $(id).addEventListener("input", () => {
    if ($("scenario").value === "custom") scenarioSelected();
  });
$("addOutcome").addEventListener("click", () => {
  addOutcome();
  previewOutcomes();
});
$("restoreDefaults").addEventListener("click", () =>
  rubricEditor(catalog.outcomes),
);
$("saveProfile").addEventListener("click", () => {
  try {
    const s = settings();
    validateSettings(s);
    const customScenario = Object.fromEntries(
      Object.entries(customMap).map(([k, id]) => [k, $(id).value]),
    );
    download(
      "advisor-training-profile.json",
      JSON.stringify(
        {
          kind: "advisor-practice-profile",
          version: 1,
          settings: { ...s, advisor: "" },
          customScenario,
        },
        null,
        2,
      ),
      "application/json",
    );
  } catch (e) {
    notify(e.message, true);
  }
});
$("loadProfile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 30000)
      throw new Error("The training profile is too large.");
    applyProfile(JSON.parse(await file.text()));
    notify("Training profile loaded.");
  } catch (err) {
    notify(err.message || "Could not load this training profile.", true);
  } finally {
    e.target.value = "";
  }
});
$("downloadTranscript").addEventListener("click", () =>
  download("advisor-transcript.txt", transcriptText()),
);
$("downloadReport").addEventListener("click", () =>
  download("advisor-assessment.txt", reportText()),
);
$("printReport").addEventListener("click", () => {
  const details = [...$("report").querySelectorAll("details")];
  const was = details.map((d) => d.open);
  details.forEach((d) => (d.open = true));
  const restore = () => {
    details.forEach((d, i) => (d.open = was[i]));
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
});
$("newSession").addEventListener("click", () => {
  voice?.reset();
  setInteractionMode("text");
  $("message").value = "";
  storage.remove("advisorPracticeSession");
  session = null;
  autoAttempt = false;
  pending = null;
  show("setup");
  notify("");
  $("main").focus();
  window.scrollTo(0, 0);
});
$("deleteSession").addEventListener("click", async () => {
  if (
    !confirm(
      "Delete this attempt and its saved transcript? Download your report first if you need it.",
    )
  )
    return;
  try {
    await api(sessionPath(), { method: "DELETE" });
    $("newSession").click();
    notify("Attempt deleted.");
  } catch (e) {
    notify(e.message, true);
  }
});
$("helpButton").addEventListener("click", () => $("help").showModal());
$("closeHelp").addEventListener("click", () => $("help").close());
async function init() {
  try {
    const [c, health] = await Promise.all([
      api("/api/catalog"),
      api("/api/health"),
    ]);
    catalog = c;
    const categories = [...new Set(c.scenarios.map(s => s.category).filter(Boolean))].sort();
    for (const category of categories) {
      const opt = el("option", category);
      opt.value = category;
      $("scenarioCategory").append(opt);
    }
    for (const s of c.scenarios) {
      const opt = el("option", s.title);
      opt.value = s.id;
      $("scenario").append(opt);
    }
    if (!c.managed) {
      const opt = el("option", "Custom scenario");
      opt.value = "custom";
      $("scenario").append(opt);
    } else {
      document.querySelector(".trainer").hidden = true;
      $("passMark").readOnly = true;
      $("passMarkNote").replaceChildren(
        document.createTextNode("Pass mark and essential outcomes are set by the manager. To change them, "),
      );
      const managementLink = el("a", "open the Management Area");
      managementLink.href = "/management";
      $("passMarkNote").append(managementLink, document.createTextNode(" and edit this scenario."));
      document.getElementById("retentionNotice").textContent =
        `Use fictional details only. Unfinished attempts expire after 24 hours. Completed assessments and transcripts are available to managers for ${c.retentionDays} days. Names are self-entered and unverified. Your messages are sent to Cloudflare AI.`;
    }
    rubricEditor(c.outcomes);
    scenarioSelected();
    ready = health.status === "ready" && c.scenarios.length > 0;
    $("connection").textContent = !c.scenarios.length
      ? "No available scenarios"
      : ready
        ? "AI configured · free allowance"
        : "Cloudflare setup needed";
    setBusy(false);
    if (!c.scenarios.length) {
      $("scenarioTitle").textContent = "No practice scenarios are available";
      $("scenarioBrief").textContent =
        "A manager needs to publish and switch on a scenario. Refresh this page afterwards.";
    }
    if (!ready)
      notify(
        !c.scenarios.length
          ? "A manager needs to publish an available scenario before you can start."
          : "Deploy the app to Cloudflare with the supplied configuration to enable the AI.",
        true,
      );
    const previous = storage.get("advisorPracticeSession");
    if (previous && /^[0-9a-f]{64}$/.test(previous)) {
      try {
        adopt(await api("/api/sessions/" + previous));
        notify("Your saved attempt has been restored.");
      } catch (e) {
        storage.remove("advisorPracticeSession");
        notify(e.message, true);
      }
    }
  } catch (e) {
    $("connection").textContent = "Service unavailable";
    notify(e.message, true);
  }
}
setInterval(tick, 1000);
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) voice?.stop();
  if (!document.hidden && session && !busy && session.phase !== "assessed") {
    try {
      adopt(await api(sessionPath()));
    } catch (e) {
      notify(e.message, true);
    }
  }
});
window.addEventListener("pagehide", () => voice?.stop());
init();
