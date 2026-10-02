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

## Optional voice update — 2 October 2026

The test suite now includes 19 browser-speech tests plus the existing 36 training/management tests. `npm test` checks opt-in capture, standard/prefixed recognition, interim/final text without duplication, permission/network errors and retries, capture bounds, unsupported-browser fallback, cancellation/late callbacks, speech chunking and voice selection, mute/replay, blocked autoplay, request-busy/session lifecycle, opening turn zero, and dictated-text integration with the existing Worker and evidence transcript.

These speech tests use fake browser speech APIs and explicit mock AI. They do not establish that a real microphone, operating-system voice or employer network works on a particular device. Actual Windows/iPhone microphone and speaker acceptance remains a user-device check.

Pre-deployment checks passed: all 55 automated tests, JavaScript syntax, Wrangler deployment dry run, and real workerd Web Crypto/SQLite persistence smoke test. The runtime smoke test's old forced-timer assertion was corrected to cover the existing trainee-selectable timer/difficulty while preserving the manager's pass mark; production server code was not changed.

Voice adds only frontend assets and tests. Existing Worker routes, manager authentication, assessment code, Durable Objects, bindings and migrations are unchanged. A pre-voice code branch was saved before the update; it is not a database backup.

Device acceptance: start a fictional attempt, enable spoken replies, dictate a reply, stop, correct a word, send, hear the customer's response, replay, mute, and finish an assessment. Verify the assessed transcript contains only the text that was sent. Deny microphone access and confirm typing still works. Check leaving the page stops capture/playback. The clock continues during dictation and playback.
