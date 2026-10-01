// Local UI verification only. Production never imports this mock AI server.
import http from "node:http";
import fs from "node:fs/promises";
import worker from "../src/worker.js";
import { testEnvironment } from "./helpers.js";
const env = testEnvironment(async (model, input) => {
  if (input.messages[0].content.includes("training assessor")) {
    const prompt = input.messages[1].content;
    const rubric = JSON.parse(
      prompt.split("RUBRIC: ")[1].split("\nTRANSCRIPT")[0],
    );
    const transcript = JSON.parse(
      prompt.split("TRANSCRIPT EVIDENCE: ")[1].split("\nYour previous")[0],
    );
    const advisor = transcript.find((m) => m.speaker === "ADVISOR");
    return {
      response: {
        summary:
          "LOCAL UI TEST — model inference is mocked. The advisor introduced their role; other outcomes need further evidence.",
        nextSteps: [
          "Explore the customer’s concern before giving advice.",
          "Agree a clear next step and check understanding.",
        ],
        outcomes: rubric.map((o, i) => ({
          id: o.id,
          score: i === 0 ? 3 : 0,
          evidence:
            i === 0 ? [{ turn: advisor.turn, quote: advisor.text }] : [],
          feedback:
            i === 0
              ? "The introduction is evidenced in the advisor message."
              : "This outcome was not demonstrated in the test conversation.",
          improvement:
            "Practise this outcome in a complete customer conversation.",
        })),
      },
    };
  }
  return {
    response:
      "LOCAL UI TEST — I’m worried I may be paying twice. I changed jobs two months ago. Could you help me understand what to check?",
  };
});
env.ASSETS = {
  async fetch(req) {
    let path = new URL(req.url).pathname;
    if (path === "/") path = "/index.html";
    if (!["/index.html", "/app.js", "/style.css"].includes(path))
      return new Response("Not found", { status: 404 });
    const content = await fs.readFile(
      new URL("../public" + path, import.meta.url),
    );
    return new Response(content, {
      headers: {
        "Content-Type": path.endsWith(".js")
          ? "text/javascript"
          : path.endsWith(".css")
            ? "text/css"
            : "text/html",
      },
    });
  },
};
const server = http.createServer(async (req, res) => {
  try {
    const parts = [];
    for await (const p of req) parts.push(p);
    const body = Buffer.concat(parts);
    const request = new Request("http://127.0.0.1:8790" + req.url, {
      method: req.method,
      headers: req.headers,
      ...(body.length ? { body, duplex: "half" } : {}),
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.writeHead(500);
    res.end(e.message);
  }
});
server.listen(8790, "0.0.0.0", () =>
  process.stdout.write("UI test server: http://127.0.0.1:8790 (AI mocked)\n"),
);
