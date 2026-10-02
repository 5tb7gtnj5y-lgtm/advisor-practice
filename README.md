# Advisor Practice

A customer role-play chatbot for HMRC-style and public-service advisor training. The customer replies using Cloudflare Workers AI. The app assesses the conversation against editable key outcomes, with evidence and a final trainer-review field.

**No AI API key is needed.** This project uses Cloudflare's AI binding, rather than a paid API. Cloudflare provides a shared allowance of **10,000 neurons a day**. That is a measure of AI work, not a fixed number of conversations. On the Workers Free plan, AI stops when the allowance is exhausted. Do not upgrade to a Paid plan if you want to avoid usage charges. Other free Cloudflare resource limits also apply.

**Already using Advisor Practice?** The optional voice update uses the existing GitHub/Cloudflare deployment. No new API key, secret, database migration or installation is needed. For a new installation, follow the steps below and complete the live-AI check in step 12.

## Install it — no coding or terminal needed

### 1. Download and extract

Download `advisor-practice.zip`.

On Windows, right-click the ZIP, select **Extract All**, and select **Extract**.

Open the extracted `advisor-practice` folder. You should see `package.json`, `package-lock.json`, `wrangler.jsonc`, `README.md`, and the `public`, `src` and `tests` folders.

### 2. Open GitHub

Go to https://github.com and sign in.

### 3. Make a repository

Open https://github.com/new.

Enter this repository name:

**advisor-practice**

Choose **Private** if you do not want the source code visible to everyone. A private source repository does not make the deployed website private.

Tick **Add a README file**, then select **Create repository**.

### 4. Upload the app

In the repository, select **Add file**, then **Upload files**.

From the extracted `advisor-practice` folder, drag its **contents** into GitHub's upload area. Drag the `public`, `src` and `tests` folders too, so their files keep the correct paths.

Select **Commit changes**. If GitHub asks about replacing its initial README, replace it with the supplied README.

**Important:** upload the files inside the folder, not the ZIP and not an extra enclosing `advisor-practice` folder.

The repository's first screen should show `package.json` and `wrangler.jsonc`. It should also show `public` and `src` as folders.

If you cannot see **Add file** in the new repository, use the **uploading an existing file** link on its first screen instead.

### 5. Open Cloudflare

Go to https://dash.cloudflare.com and sign in.

Use the **Workers Free** plan. You do not need a domain name.

### 6. Create a Worker from GitHub

Open **Workers & Pages**.

Select **Create application**, then **Get started** beside **Import a repository**. Depending on the dashboard layout, this may instead be labelled **Connect GitHub** or **Import from GitHub**.

Use the **Workers / Import repository** route. This app includes a server and is not a static GitHub Pages or Cloudflare Pages upload.

### 7. Connect the repository

Connect GitHub if asked.

Allow Cloudflare to access the `advisor-practice` repository. You can choose access to only that repository.

Select `advisor-practice` from the repository list.

### 8. Enter these settings

| Setting               | Value                         |
| --------------------- | ----------------------------- |
| Worker / project name | `advisor-practice`            |
| Production branch     | `main`                        |
| Root directory        | Leave blank / repository root |
| Build command         | `npm run check`               |
| Deploy command        | `npx wrangler deploy`         |

Leave environment variables empty. There is no AI API key to add.

If you are asked for a framework preset or a build output directory, you may be in the Pages setup. Go back and choose the Worker repository import.

**The Worker name must be `advisor-practice`: it matches the supplied configuration file.** If you already have a Worker with this name, use a different name in BOTH Cloudflare and the `name` field of `wrangler.jsonc` before deploying.

### 9. Deploy

Select **Save and Deploy** or **Deploy**.

Cloudflare installs the dependencies from `package-lock.json`. The supplied configuration creates the AI binding and the session storage binding automatically.

Accept any Workers AI terms Cloudflare shows. You should not need to enter an AI API key or buy an AI subscription.

Wait until the deployment says **Success**.

### 10. Open your app

Select **Visit** or open the supplied `workers.dev` address.

The address will look similar to:

`https://advisor-practice.YOUR-CLOUDFLARE-SUBDOMAIN.workers.dev`

This example is a pattern, not an existing link. Use the address Cloudflare gives you.

### 11. Check the configuration

Add `/api/health` to your app address and open it.

The result should include:

```json
{
  "status": "ready",
  "aiBinding": true,
  "sessionBinding": true
}
```

This checks the bindings; it does not call the model. The `liveInferenceTested` field is deliberately `false`. Use the next step to check real AI replies.

### 12. Try a live conversation

Return to the app.

Choose **A confusing tax letter**, **Foundation**, and **10 minutes**.

Select **Start conversation**. The first customer message comes from the scenario.

Send a message such as:

> Hello, I’m Steve. I can help you understand the letter. What part of it is worrying you most?

A new customer reply should appear. **This second customer message is generated by real AI.**

Continue for a few turns, following the fictional training guidance. Select **End & assess**.

Check that the report contains seven outcome scores and that each credited outcome quotes your advisor messages. Download the report. This confirms the real role-play and assessment calls work on your account.

## How to use the training

1. Choose the customer scenario.
2. Choose Foundation, Intermediate or Advanced.
3. Choose 5, 10, 15, 20, 30 or 60 minutes, or no time limit.
4. Set the pass mark. The default is 70%.
5. Read the briefing and fictional training guidance.
6. Start the conversation and reply as the advisor.
7. End the session, or let the timer finish it.
8. Read the outcome scores, evidence and next steps.
9. Have a trainer review the evidence and record the final decision.
10. Download the report, or use **Print / save PDF**.

There is a limit of 30 advisor messages per attempt. The clock continues during AI replies. A message submitted before the server deadline can receive a reply afterwards. The server will then end the conversation. Refreshing the page does not restart the timer.

An attempt is retained for 24 hours from its start. The browser remembers the access token for the latest attempt so it can resume after a refresh. Download the report before it expires. The deletion button removes the retained attempt immediately. Trainer review notes are added to the download, but are not saved on the server or preserved after leaving the page.

## Default key outcomes

| Outcome                         | Weight | Essential? |
| ------------------------------- | -----: | ---------- |
| Welcome and explain your role   |     10 | No         |
| Protect customer information    |     15 | Yes        |
| Understand the customer's needs |     20 | No         |
| Show empathy and adapt          |     15 | No         |
| Give clear, accurate guidance   |     15 | Yes        |
| Agree a workable action plan    |     15 | No         |
| Check understanding and close   |     10 | No         |

Each outcome is marked from 0 to 4:

- **0:** Not demonstrated, or contradicted.
- **1:** Attempted, with major gaps.
- **2:** Partly achieved, with material gaps.
- **3:** Achieved, with minor gaps.
- **4:** Clearly and consistently achieved.

The server calculates the weighted percentage from the validated scores. Weights do not have to add up to 100; they are normalised.

A provisional pass requires the overall pass mark AND at least 2/4 in every essential outcome. For example, a strong overall percentage cannot compensate for an essential privacy gap.

A positive score must include a quotation that matches an advisor turn in the stored transcript. Unverifiable quotations earn no credit and are flagged for review. The quotation check does not guarantee the AI's interpretation is correct. A trainer must review the assessment, particularly where the final outcome affects a learner.

## Change the training

Open **Trainer settings** on the setup screen.

You can:

- Change the outcome titles, success descriptions, weights and essential flags.
- Add or remove outcomes, using between 1 and 10.
- Create a custom customer scenario with fictional facts and supplied training guidance.
- Download a training profile, then load it in another browser to use the same setup.

For a custom scenario, complete its fields and select **Custom scenario** in the scenario dropdown. The customer facts are withheld from the active-session API and only revealed in the assessment view. Anyone with access to the source repository can read the built-in customer facts. Custom-profile authors also know their own facts.

This is a trainer-reviewed practice tool. There are no learner accounts, locked examination profiles, formal identity checks, invigilation or central results dashboard. Settings are openly editable on the setup screen.

All built-in HMRC-style guidance is fictional and is labelled as such. Replace it with approved training guidance if you want to assess specific processes. Do not paste real customer information into the app or a public GitHub repository.

## If something goes wrong

**Cloudflare cannot find the repository:** check the GitHub account and the repository permissions granted to Cloudflare. Add access to `advisor-practice`, then refresh the repository list.

**“Could not find package.json” or “Wrangler configuration not found”:** the files are probably in an extra folder. Move `package.json`, `package-lock.json`, `wrangler.jsonc`, `public` and `src` to the repository root. Leave Root directory blank.

**Worker name mismatch:** set the Cloudflare Worker name to `advisor-practice`, or update the `name` field in `wrangler.jsonc` to exactly match the Worker name.

**Missing bindings / AI not configured:** deploy with the supplied `wrangler.jsonc`, rather than uploading only the HTML. In the Worker settings, confirm a Workers AI binding named `AI` and a Durable Object binding named `SESSIONS` exist. The Durable Object class must be `TrainingSession` with SQLite storage. Use the supplied configuration and redeploy to create these automatically.

**Free AI allowance exhausted:** download the transcript. Wait for the free allowance to renew. All users of the app share the account's AI allowance, and other Workers AI apps in the account use the same allowance. Do not switch to Paid to continue if you want to keep it free.

**Too many requests:** wait one minute, then retry. Session requests have a rate limit. Session creation also has an IP-based limit, so large groups sharing one network may need to stagger their starts.

**Customer reply fails:** the message stays in the reply box; retry. The server avoids duplicate turns when the same request is retried.

**Assessment fails:** the conversation is locked and saved. Select **Get assessment** to retry. Download the transcript if the AI service is unavailable, so a trainer can still assess it. The app makes at most one automatic retry for invalid assessment output; it never substitutes a made-up score.

**An attempt disappears after 24 hours:** the retention period ended. Start a new attempt. Keep downloaded reports if you need a longer record.

**The first customer message works but later messages fail:** the opening is saved scenario text. Later replies need the actual AI binding, remaining quota and provider availability. Check the deployment's bindings and Workers AI usage in Cloudflare.

## Future updates

Edit or upload the changed source files in GitHub and select **Commit changes**. Cloudflare's Git integration will deploy the update automatically. Keep `wrangler.jsonc` and all required folders in the repository.

## For a developer

Requires Node.js 22 or later.

```bash
npm ci
npm run check
npm test
npx wrangler deploy --dry-run
npm run dev
```

`npm run dev` requires Cloudflare authentication for Workers AI because inference runs remotely, even during local development. Use `npx wrangler login` if needed. Cloudflare's Git-connected dashboard deployment avoids these terminal commands entirely.

Tests use explicit mock bindings. `tests/preview-server.mjs` is a local UI test harness with visibly labelled mock replies; it is not part of the production app and is never imported by the Worker.

The Worker uses a cryptographically random 256-bit session ID as an access capability. There is no user authentication: anyone who obtains the ID can access the attempt during retention. Do not share the session ID or a downloaded report containing it while the attempt is active. The site does not store transcripts in browser local storage; it stores only the latest attempt ID. The server retains each attempt in a SQLite-backed Durable Object and sets a 24-hour deletion alarm. Logs are not enabled by this configuration.

No API tokens, AI keys or account IDs are committed to the repository. The AI binding, storage binding, SQLite migration and asset binding are declared in `wrangler.jsonc`.

## Official setup references

Checked on 1 October 2026:

- Cloudflare GitHub deployment: https://developers.cloudflare.com/workers/ci-cd/builds/
- Workers AI bindings: https://developers.cloudflare.com/workers-ai/configuration/bindings/
- Workers AI free allowance: https://developers.cloudflare.com/workers-ai/platform/pricing/
- SQLite Durable Objects on the Free plan: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Structured assessment output: https://developers.cloudflare.com/workers-ai/features/json-mode/

## Version 2: Management Area

Use the **Management Area** link to manage persistent scenarios, generate AI drafts, publish immediately, set per-scenario timers/difficulty/rubrics/pass rules, test drafts, review saved assessments/transcripts/evidence, and record manager scores and coaching. Managers are authenticated; administrators manage accounts and retention. Published training settings are enforced by the server.

Deploy the complete `wrangler.jsonc` to add `ManagementRegistry` storage and its v2 migration. Set the `MANAGER_SETUP_KEY` secret once to create the initial administrator, then remove it. See the Management Area update section of [installation-guide.md](installation-guide.md) for simple activation, everyday use, retention and account recovery.

Completed management assessments default to 30-day retention; attempt-token access still expires after 24 hours. No paid AI API is introduced. AI and storage free-plan quotas still apply.

## Optional voice practice

1. Start a conversation as normal.
2. Select **Enable spoken replies** to hear the AI customer's opening and subsequent replies. Sound is off until you choose it.
3. Select **Talk**, allow the microphone if asked, and say your advisor reply. Select **Stop listening** when finished; the browser may also finish automatically after a pause.
4. Check and edit the text in **Your reply**, then select **Send reply**. Dictation never sends anything automatically.
5. Use **Replay customer**, **Stop speaking**, **Mute customer** or the **Customer voice** selector as needed. Selecting **Talk** stops customer playback before starting the microphone.

This is turn-by-turn voice practice, not an always-listening telephone call. Listening stops on assessment, expiry, page hiding and navigation. Each capture is limited to 60 seconds; the existing 1,000-character reply limit still applies. Typing remains available independently of speech support.

Voice uses the browser's speech recognition and text-to-speech, not a new paid AI service. Browser and workplace policies affect availability; try a browser with speech recognition support, or use keyboard dictation and normal typing. Your browser may send audio to its speech provider. The application does not save audio recordings. Only reviewed, sent text is stored and scored. Tone, accent and pronunciation are not assessed, and the selected voice does not guarantee emotional acting. Use fictional details.

The existing Cloudflare AI still generates the customer's dynamic replies and assessments, with the same account limits. Voice does not change scenarios, hidden facts, scoring rules or result retention.

## Pre-voice rollback point

The GitHub branch **pre-voice-version** preserves the build immediately before voice, at commit **c3440cd80da701957010367f79290b7120df9926**. Restore its files in a new commit on `main`, keeping the current Git history; Cloudflare then deploys that commit through the existing integration. Do not force-reset `main` or remove Durable Object migrations.

This is a code backup, not a database backup. A code rollback does not recover records deleted or expired later, and does not rewind management data or configuration changes. The voice update introduces no storage or schema changes.
