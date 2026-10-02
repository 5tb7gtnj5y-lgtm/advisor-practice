# Install Advisor Practice

This app gives you an AI customer for fictional HMRC-style and public-service training, difficulty levels, time limits and assessment against editable key outcomes.

**No AI API key is needed.** Cloudflare's Free plan includes a daily AI allowance of 10,000 neurons shared by everyone using the app. It is free within that allowance, rather than unlimited. Stay on the Free plan to avoid paid usage.

The app is built and checked locally. It is **not yet deployed**. Follow these steps to put it on your own GitHub and Cloudflare accounts.

## 1. Extract the download

Download **advisor-practice.zip**.

Right-click it and select **Extract All**. Open the extracted **advisor-practice** folder.

## 2. Create a GitHub repository

Open [GitHub's new repository page](https://github.com/new).

Name it **advisor-practice**.

Choose **Private**, tick **Add a README file**, then select **Create repository**.

## 3. Upload the app

Select **Add file → Upload files**.

Drag everything **inside** the extracted advisor-practice folder into the upload area. Include the **public**, **src** and **tests** folders.

Select **Commit changes**. Replace the initial README if asked.

You should now see **package.json**, **package-lock.json** and **wrangler.jsonc** on the repository's first screen. Do not upload just the ZIP or an extra enclosing folder.

## 4. Open Cloudflare

Sign in at [Cloudflare](https://dash.cloudflare.com).

Use the **Workers Free** plan.

Open **Workers & Pages → Create application → Import a repository**.

Choose the **Worker** route. This project needs its server as well as its webpage.

## 5. Connect GitHub

Connect your GitHub account if asked.

Give Cloudflare access to the **advisor-practice** repository and select it.

## 6. Enter these settings

| Setting | Enter |
|---|---|
| Worker / project name | `advisor-practice` |
| Production branch | `main` |
| Root directory | Leave blank |
| Build command | `npm run check` |
| Deploy command | `npx wrangler deploy` |

Leave environment variables empty. **There is no API key to add.**

The Worker name must match the name in the supplied configuration: **advisor-practice**.

## 7. Deploy

Select **Save and Deploy** or **Deploy**.

Accept any Workers AI terms Cloudflare shows.

Wait for **Success**, then select **Visit**. Use the **workers.dev** address Cloudflare provides.

The configuration automatically creates the AI and session-storage connections.

## 8. Check it works

Choose **A confusing tax letter**, **Foundation**, and **10 minutes**.

Select **Start conversation**.

Send:

> Hello, I'm Steve. What part of the letter is worrying you most?

The opening customer message is supplied by the scenario. The **next customer reply uses real AI**.

Continue for a few turns, then select **End & assess**. Check the outcome scores and transcript evidence, then download the report.

## Change the training

Open **Trainer settings** before starting a session.

You can edit the outcomes, weights and essential checks, create a custom customer scenario, or save and load a training profile.

The default pass mark is **70%**. Every essential outcome must also score at least **2 out of 4**.

AI marks are provisional: a trainer reviews the evidence and records the final decision. The included guidance is fictional training guidance, so use your approved material for process-specific training.

## Two useful reminders

- Attempts are retained for **24 hours**. Download reports before they expire.
- If the free AI allowance runs out, download the transcript and try again after the allowance renews. You do not need to upgrade.

For screenshots of a different Cloudflare layout, installation errors or detailed settings, use the **README.md** included in the ZIP. It has a fuller guide and troubleshooting steps.

## Management Area update (version 2)

This update extends your existing site. There is no new AI API key or paid API to buy. Stay on the Cloudflare Free plan; AI and storage still have usage limits.

### Activate the update

1. Open Cloudflare and select **Workers & Pages → advisor-practice**.
2. Open **Settings → Variables and Secrets → Add**.
3. Choose **Secret**, enter the name **MANAGER_SETUP_KEY**, and enter a new private random setup code of at least 32 characters. Use a password manager to generate it. Save it privately. This is your own setup code, not an AI API key. Never put it in GitHub or send it in chat.
4. Deploy the updated GitHub project using the complete `wrangler.jsonc`, not just pasted Worker JavaScript. The configuration adds the **MANAGEMENT → ManagementRegistry** SQLite Durable Object binding and the **v2** migration, while preserving **SESSIONS → TrainingSession**. If GitHub Builds is connected, use **Builds → Retry build** on the latest commit. Build command: `npm ci`. Deploy command: `npx wrangler deploy`. Root directory: repository root.
5. Open your site and select **Management Area**.
6. Enter an administrator username, a unique password of at least 14 characters, and the private setup code. Click **Create administrator**. Only one initial administrator can be created.
7. Remove the **MANAGER_SETUP_KEY** secret from Cloudflare once setup succeeds. Normal manager sign-in uses the account password, not the setup code.

If your Worker currently uses manual dashboard deployments and has no GitHub Builds connection, connect **5tb7gtnj5y-lgtm/advisor-practice** in the Worker's **Settings → Builds** first. Deploying the configuration is necessary for the new storage class. Do not create a replacement Worker.

### Everyday management

1. Sign in through **Management Area**.
2. Choose **Create Scenario**, or describe the practice you want and select **Generate Scenario with AI**. Generated scenarios are saved as drafts.
3. Review the visible briefing, hidden customer facts, guidance, criteria, weights, pass mark, essential minimums, difficulty and time limit. Generated guidance is a suggestion; replace it with your approved training guidance.
4. Click **Test** to practise against that scenario without publishing. Test assessments are excluded from normal results and retained for one day.
5. Click **Publish** to make the scenario available immediately. Trainees should refresh their setup page to see new scenarios. Later edits affect new attempts; existing attempts keep their original scenario and rubric.
6. Use **Switch Off**, **Archive**, **Duplicate**, or **Edit** in the library. Only unused drafts can be deleted. Archive scenarios with assessment history.
7. Open **Results**, find a trainee or scenario, and choose **Open assessment & transcript**. Review exact evidence, feedback and coaching. You can change manager scores and record a final decision with reasoning. Original AI scores remain intact.
8. The administrator uses **Accounts & settings** to create managers, reset their passwords, disable accounts, and set retention. Changing or disabling a manager account revokes its old sessions. Managers cannot manage accounts or retention.

### Storage and access

- Existing `TrainingSession` Durable Objects store each active attempt and its transcript for 24 hours, preserving the existing random attempt token. That token permits only that attempt's trainee functions. Trainee names are self-entered and are not verified identities.
- A separate SQLite-backed `ManagementRegistry` Durable Object stores manager accounts, hashed passwords, hashed sign-in tokens, scenario versions, settings, completed assessments, transcripts, manager reviews and an activity log. No training records rely on browser storage for persistence. Browser storage holds only the active attempt token.
- Completed assessments are copied atomically with their exact scenario, rubric and actual model into management storage. Failed copies are retried by the attempt's Durable Object alarm. Existing completed attempts from before the update are copied when assessment is requested again while their token is still valid.
- Managers can review all results for this single organisation. Administrators additionally manage accounts and retention. There is no public manager registration, verified trainee account system or multi-organisation tenancy.
- Default retention: unfinished/trainee-access attempts 24 hours; completed management assessments 30 days; tests one day; activity log 90 days. Administrators can set future completed assessments to 1–365 days. Expired records stop appearing immediately and are physically purged by the daily alarm. Deleting an attempt while its token is valid also removes its management result and transcript.
- Hidden customer profiles are omitted from trainee catalogs, session responses and downloads, including after assessment. Managers access them only after server-authorised sign-in. The AI uses them for customer behaviour, and may reveal individual facts naturally in the conversation.
- Sign-in uses salted PBKDF2-SHA256 (100,000 iterations, the Workers Web Crypto per-call limit), eight-hour server sessions, Secure/HttpOnly/SameSite cookies, CSRF tokens, account lockout and Worker rate limiting. Use unique long manager passwords; no passwords or setup/recovery codes are logged.
- Results are paginated 50 per page, with search and JSON download of the full assessment/transcript. The registry is intended for a single training team; listing/search scans retained records. For high-volume enterprise training, add indexed database queries before scaling.
- Export required records before retention expires. Cloudflare storage survives restarts and redeployments, but this app does not claim a separate automatic disaster-recovery backup.

### Recover administrator access

1. In Cloudflare, add a new secret named **MANAGER_RECOVERY_KEY** using a fresh private random code of at least 32 characters. Save/deploy the change.
2. Open **Management Area → Recover administrator access**.
3. Enter the existing administrator username, a new unique password and that recovery code, then click **Recover access**.
4. Remove **MANAGER_RECOVERY_KEY** from Cloudflare afterwards. Each recovery code can be used once, and previous administrator sessions are revoked. To recover again, set a new code.

### Checks before real training

Run `npm test`, `npm run check`, and `npx wrangler deploy --dry-run`. Then deploy and check a real AI-generated draft, manager test conversation, trainee conversation, completed assessment and manager review. Unit tests use mocked AI; passing them does not prove live Cloudflare inference works. AI scores require trainer review.
