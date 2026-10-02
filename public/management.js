const $ = (id) => document.getElementById(id);
let csrf = "",
  user = null,
  setup = false,
  scenarios = [],
  editing = null,
  offset = 0,
  result = null,
  working = false,
  defaults = [];
function node(tag, value) {
  const n = document.createElement(tag);
  if (value !== undefined) n.textContent = value;
  return n;
}
function notice(message, error = false) {
  $("status").hidden = !message;
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
async function api(path, method = "GET", value) {
  const r = await fetch("/api/management/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401 && user) {
      user = null;
      $("workspace").hidden = true;
      $("signin").hidden = false;
      $("logout").hidden = true;
    }
    throw new Error(d.error || "Request failed.");
  }
  return d;
}
async function action(fn) {
  if (working) return;
  working = true;
  document.body.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (e) {
    notice(e.message, true);
  } finally {
    working = false;
    document.body.removeAttribute("aria-busy");
  }
}
function button(label, fn) {
  const b = node("button", label);
  b.type = "button";
  b.onclick = () => action(fn);
  return b;
}
function tab(id) {
  for (const name of ["library", "results", "admin", "audit"])
    $(name).hidden = name !== id;
  $("editor").hidden = true;
}
const fields = [
  ["title", "Scenario title", 100],
  ["customer", "Fictional customer name", 60],
  ["category", "Category", 100],
  ["brief", "Advisor briefing (visible to trainee)", 1400],
  ["opening", "Opening message (visible to trainee)", 800],
  ["guidance", "Approved training guidance (visible to trainee)", 5000],
  ["background", "Customer background", 2500],
  ["personality", "Personality", 2500],
  ["emotionalState", "Initial emotional state", 2500],
  ["facts", "Important customer facts", 2500],
  ["hiddenInformation", "Hidden facts and when to reveal each", 2500],
  ["concerns", "Customer concerns", 2500],
  ["complications", "Possible complications", 2500],
  ["desiredOutcome", "Customer’s desired outcome", 2500],
];
for (const [id, label, max] of fields) {
  const l = node("label", label),
    input = node(max <= 100 ? "input" : "textarea");
  input.id = "field_" + id;
  input.maxLength = max;
  if (input.tagName === "TEXTAREA") input.rows = 3;
  input.required = ["title", "brief", "opening", "guidance", "facts"].includes(
    id,
  );
  l.append(input);
  $("fields").append(l);
}
function criterion(
  o = { title: "", description: "", weight: 10, essential: false, minScore: 2 },
) {
  const row = node("div");
  row.className = "outcome-editor";
  for (const [key, label, type] of [
    ["title", "Criterion", "text"],
    ["description", "What good performance looks like", "textarea"],
    ["weight", "Weight", "number"],
    ["minScore", "Essential minimum (0–4)", "number"],
  ]) {
    const l = node("label", label),
      input = node(type === "textarea" ? "textarea" : "input");
    input.dataset.key = key;
    input.value = o[key] ?? 2;
    input.required = true;
    if (type !== "textarea") input.type = type;
    if (type === "number") {
      input.min = key === "weight" ? 1 : 0;
      input.max = key === "weight" ? 100 : 4;
    } else input.maxLength = key === "title" ? 120 : 1000;
    l.append(input);
    row.append(l);
  }
  const l = node("label", "Essential"),
    c = node("input");
  c.type = "checkbox";
  c.dataset.key = "essential";
  c.checked = !!o.essential;
  l.append(c);
  row.append(
    l,
    button("Remove", async () => {
      if ($("criteria").children.length < 2)
        throw new Error("Keep one criterion.");
      row.remove();
    }),
  );
  $("criteria").append(row);
}
function rubric() {
  return [...$("criteria").children].map((row) =>
    Object.fromEntries(
      [...row.querySelectorAll("[data-key]")].map((i) => [
        i.dataset.key,
        i.type === "checkbox"
          ? i.checked
          : i.type === "number"
            ? Number(i.value)
            : i.value,
      ]),
    ),
  );
}
function formValue() {
  return {
    ...(editing || {}),
    ...Object.fromEntries(fields.map(([id]) => [id, $("field_" + id).value])),
    level: $("editLevel").value,
    minutes: Number($("editMinutes").value),
    passMark: Number($("editPass").value),
    outcomes: rubric(),
  };
}
function edit(s = {}) {
  editing = s.id ? s : null;
  for (const [id] of fields) $("field_" + id).value = s[id] || "";
  $("editLevel").value = s.level || "foundation";
  $("editMinutes").value = s.minutes ?? 10;
  $("editPass").value = s.passMark ?? 70;
  $("criteria").replaceChildren();
  (s.outcomes || defaults).forEach(criterion);
  $("editHeading").textContent = s.id ? "Edit " + s.title : "Create Scenario";
  $("generatedNotice").hidden = !s.reviewNotice;
  $("generatedNotice").textContent = s.reviewNotice || "";
  $("editor").hidden = false;
  $("editor").scrollIntoView({ behavior: "smooth" });
}
async function loadLibrary() {
  scenarios = await api("scenarios");
  $("scenarioList").replaceChildren();
  for (const s of scenarios) {
    const row = node("article");
    row.className = "panel";
    row.append(
      node("h3", s.title),
      node(
        "p",
        `${s.status} · ${s.enabled ? "On" : "Off"} · ${s.level} · ${s.minutes ? s.minutes + " minutes" : "Untimed"} · version ${s.version}`,
      ),
    );
    const controls = node("div");
    controls.className = "button-row";
    controls.append(
      button("Edit", async () => edit(s)),
      button("Duplicate", async () => {
        const copy = { ...s, title: s.title + " (copy)" };
        delete copy.id;
        delete copy.version;
        edit(copy);
      }),
      button("Test", async () => testScenario(s)),
      button(s.enabled ? "Switch Off" : "Switch On", async () => {
        if (s.status !== "published")
          throw new Error("Review and publish this scenario first.");
        await api("scenarios", "POST", { ...s, enabled: !s.enabled });
        await loadLibrary();
      }),
      button("Archive", async () => {
        await api("scenarios", "POST", {
          ...s,
          status: "archived",
          enabled: false,
        });
        await loadLibrary();
      }),
    );
    if (s.status === "draft")
      controls.append(
        button("Delete draft", async () => {
          if (!confirm("Delete this draft?")) return;
          await api("scenarios/" + s.id, "DELETE");
          await loadLibrary();
        }),
      );
    row.append(controls);
    $("scenarioList").append(row);
  }
}
async function testScenario(s) {
  const attempt = await api("test", "POST", s);
  localStorage.setItem("advisorPracticeSession", attempt.id);
  location.href = "/";
}
async function save(publish) {
  if (!$("scenarioForm").reportValidity()) return;
  const s = await api("scenarios", "POST", {
    ...formValue(),
    status: publish ? "published" : "draft",
    enabled: publish,
  });
  editing = s;
  await loadLibrary();
  edit(s);
  notice(
    publish ? "Published. Trainees can now use this scenario." : "Draft saved.",
  );
}
async function signedIn(d) {
  user = d;
  csrf = d.csrf;
  $("signin").hidden = true;
  $("workspace").hidden = false;
  $("logout").hidden = false;
  $("adminNav").hidden = d.role !== "admin";
  $("who").textContent = `Signed in as ${d.username} (${d.role})`;
  const c = await fetch("/api/catalog").then((r) => r.json());
  defaults = c.outcomes;
  await loadLibrary();
  tab("library");
}
$("loginForm").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const d = await api(setup ? "setup" : "login", "POST", {
      username: $("username").value,
      password: $("password").value,
      setupKey: $("setupKey").value,
    });
    $("password").value = "";
    $("setupKey").value = "";
    setup = false;
    await signedIn(d);
    notice("Signed in.");
  });
};
$("logout").onclick = () =>
  action(async () => {
    await api("logout", "POST", {});
    location.reload();
  });
$("create").onclick = () => edit();
$("addCriterion").onclick = () => {
  if ($("criteria").children.length >= 10) {
    notice("Use up to 10 criteria.", true);
    return;
  }
  criterion();
};
$("cancel").onclick = () => {
  $("editor").hidden = true;
};
$("scenarioForm").onsubmit = (e) => {
  e.preventDefault();
  action(() => save(false));
};
$("publish").onclick = () => action(() => save(true));
$("test").onclick = () =>
  action(async () => {
    if ($("scenarioForm").reportValidity()) await testScenario(formValue());
  });
$("generate").onclick = () =>
  action(async () => {
    notice("Generating scenario…");
    const s = await api("generate", "POST", {
      description: $("description").value,
    });
    edit(s);
    notice(
      "Generated draft. Review the guidance, hidden facts and assessment criteria before publishing.",
    );
  });
async function loadResults() {
  const d = await api(
    `results?q=${encodeURIComponent($("search").value)}&tests=${$("includeTests").checked ? "1" : "0"}&offset=${offset}`,
  );
  $("resultsList").replaceChildren();
  for (const r of d.items) {
    const row = node("article");
    row.className = "panel";
    row.append(
      node("h3", r.advisor + " · " + r.scenario),
      node(
        "p",
        `${new Date(r.startedAt).toLocaleString()} · ${r.level} · ${r.percent}% · ${r.decision}${r.isTest ? " · TEST" : ""}`,
      ),
      button("Open assessment & transcript", () => openResult(r.id)),
    );
    $("resultsList").append(row);
  }
  if (!d.items.length)
    $("resultsList").append(node("p", "No completed assessments match."));
  $("resultCount").textContent =
    `${d.total} results · page ${Math.floor(offset / 50) + 1}`;
  $("prev").disabled = offset === 0;
  $("next").disabled = offset + 50 >= d.total;
}
async function openResult(id) {
  result = await api("results/" + id);
  const s = result,
    r = s.report;
  $("resultDetail").hidden = false;
  $("resultTitle").textContent =
    s.config.advisor + " · " + s.config.scenario.title;
  $("resultBody").replaceChildren(
    node("p", `${r.percent}% · ${r.decision} · model ${s.model}`),
    node("p", r.summary),
  );
  for (const o of r.outcomes) {
    const a = node("article");
    a.className = "panel";
    a.append(
      node("h4", `${o.title}: ${o.score}/4 (weight ${o.weight})`),
      node("p", o.feedback),
      node("p", "Coaching: " + o.improvement),
    );
    for (const ev of o.evidence)
      a.append(node("blockquote", `Advisor turn ${ev.turn}: “${ev.quote}”`));
    $("resultBody").append(a);
  }
  const next = node("ul");
  for (const step of r.nextSteps) next.append(node("li", step));
  $("resultBody").append(node("h3", "Recommended coaching"), next);
  const transcript = node("details");
  transcript.append(node("summary", "Full transcript"));
  for (const m of s.messages)
    transcript.append(
      node(
        "p",
        `${m.turn}. ${m.role === "user" ? "Advisor" : "Customer"}: ${m.content}`,
      ),
    );
  $("resultBody").append(transcript);
  const facts = node("details");
  facts.append(
    node("summary", "Scenario version and hidden customer details"),
    node("p", JSON.stringify(s.config.scenario, null, 2)),
  );
  $("resultBody").append(facts);
  $("finalDecision").value = s.review?.decision || "Awaiting review";
  $("reviewNotes").value = s.review?.notes || "";
  $("reviewAt").textContent = s.review
    ? `Manager score ${s.review.percent}% · Reviewed by ${s.review.reviewer} on ${new Date(s.review.at).toLocaleString()}`
    : "";
  $("reviewScores").replaceChildren();
  for (const o of r.outcomes) {
    const l = node("label", o.title + " — manager score (0–4)"),
      input = node("input");
    input.type = "number";
    input.min = 0;
    input.max = 4;
    input.required = true;
    input.dataset.id = o.id;
    input.value =
      s.review?.scores?.find((x) => x.id === o.id)?.score ?? o.score;
    l.append(input);
    $("reviewScores").append(l);
  }
  $("resultDetail").scrollIntoView({ behavior: "smooth" });
}
$("reviewForm").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await api("results/" + result.id, "POST", {
      decision: $("finalDecision").value,
      notes: $("reviewNotes").value,
      scores: [...$("reviewScores input")].map((i) => ({
        id: i.dataset.id,
        score: Number(i.value),
      })),
    });
    await openResult(result.id);
    await loadResults();
    notice("Review saved. Original AI marks are preserved.");
  });
};
$("exportResult").onclick = () => {
  const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = node("a");
  a.href = url;
  a.download = "advisor-assessment.json";
  a.click();
  URL.revokeObjectURL(url);
};
$("filterForm").onsubmit = (e) => {
  e.preventDefault();
  offset = 0;
  action(loadResults);
};
$("prev").onclick = () =>
  action(async () => {
    offset = Math.max(0, offset - 50);
    await loadResults();
  });
$("next").onclick = () =>
  action(async () => {
    offset += 50;
    await loadResults();
  });
async function loadAdmin() {
  const accounts = await api("accounts"),
    settings = await api("settings");
  $("retention").value = settings.retentionDays;
  $("accountsList").replaceChildren();
  for (const a of accounts) {
    $("accountsList").append(
      node(
        "p",
        `${a.username} · ${a.role} · ${a.disabled ? "Disabled" : "Active"}`,
      ),
      button("Edit " + a.username, async () => {
        $("accountName").value = a.username;
        $("accountPassword").value = "";
        $("accountDisabled").checked = a.disabled;
      }),
    );
  }
}
$("accountForm").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await api("accounts", "POST", {
      username: $("accountName").value,
      password: $("accountPassword").value,
      disabled: $("accountDisabled").checked,
    });
    $("accountPassword").value = "";
    await loadAdmin();
    notice("Account saved. Existing sign-ins were revoked.");
  });
};
$("retentionForm").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await api("settings", "POST", {
      retentionDays: Number($("retention").value),
    });
    notice("Retention saved for future assessments.");
  });
};
for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () =>
    action(async () => {
      tab(b.dataset.tab);
      if (b.dataset.tab === "results") await loadResults();
      if (b.dataset.tab === "admin") await loadAdmin();
      if (b.dataset.tab === "audit") {
        const list = await api("audit");
        $("auditList").replaceChildren(
          ...list.map((a) =>
            node(
              "p",
              `${new Date(a.at).toLocaleString()} · ${a.actor} · ${a.action} · ${a.id}`,
            ),
          ),
        );
      }
    });
action(async () => {
  const s = await api("status");
  setup = s.setupRequired;
  $("setupLabel").hidden = !setup;
  $("signIn").textContent = setup ? "Create administrator" : "Sign in";
  if (setup)
    $("intro").textContent = s.bootstrapConfigured
      ? "Create the first administrator with your one-time setup key. Use a password of at least 14 characters."
      : "The owner must first add the MANAGER_SETUP_KEY secret in Cloudflare and deploy. See the installation guide.";
  try {
    await signedIn(await api("me"));
  } catch (e) {
    if (!e.message.includes("Sign in") && !e.message.includes("expired"))
      notice(e.message, true);
  }
});

$("recoveryForm").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const d = await api("recover", "POST", {
      username: $("recoveryUsername").value,
      password: $("recoveryPassword").value,
      recoveryKey: $("recoveryKey").value,
    });
    $("recoveryPassword").value = "";
    $("recoveryKey").value = "";
    await signedIn(d);
    notice(
      "Administrator access recovered. Remove the recovery secret from Cloudflare.",
    );
  });
};
