# Verification

Checked on 1 October 2026.

- JavaScript syntax checks: passed.
- Automated tests: 19 passed, 0 failed.
- Wrangler deployment dry run: passed, with assets, AI, SQLite Durable Object and rate-limit bindings recognised.
- Desktop UI flow: passed (select scenario, send message, reload, assess, review and download).
- Mobile layout: checked at 390 × 844; no horizontal overflow.
- Browser console/page errors during the UI flow: none.
- Screenshots inspected for setup, mobile setup and the assessment report.

The local UI flow and automated tests use explicit mock AI bindings. The production Worker calls Cloudflare Workers AI and never imports the mock server. No live model inference or production deployment has been verified because the app has not been connected to the owner's Cloudflare account. Complete step 8 of installation-guide.md after deployment to verify both real role-play and assessment.

AI score interpretation, conversational realism and adherence to a custom process require trainer review and a pilot with the intended learners. The app validates evidence quotations and calculates the weighted percentage itself; those checks do not establish that every model judgement is correct.

## Management update verification

Run `npm test` for 36 tests covering the existing chatbot and manager permissions, CSRF, single-use setup/recovery, cookie revocation, scenario publication, hidden data filtering, managed scoring, snapshot isolation, result review, drafts/tests, and retention. AI calls are mocked in these tests.

Run `npm run test:runtime` to check real workerd Web Crypto and SQLite Durable Object persistence. It creates isolated temporary test data and does not invoke AI. It verifies setup, publication, catalog filtering, server-controlled settings, empty assessment, and atomic result/transcript storage.

The deployment dry run and both test suites passed during this update. Browser access to the local development server was blocked in the execution environment, so visual browser checks and live Cloudflare AI inference remain to be checked after deployment.

Production acceptance: add the one-time setup secret, deploy the full configuration, create the administrator, generate/review/publish a draft, send real advisor replies, get an assessment, and open its evidence/transcript in Management Area. Check logout and disabled-account rejection. Stay on the Free plan.
