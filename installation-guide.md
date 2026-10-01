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
