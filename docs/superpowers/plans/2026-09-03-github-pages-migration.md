# GitHub Pages Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the static AliExpress calendar and subscription feed on GitHub Pages at `https://aesales.kalenderabos.de`, then delete the Vercel project after the replacement is verified.

**Architecture:** Extend the existing monthly update workflow so both ordinary `master` pushes and validated scraper runs upload `public/` as a Pages artifact and deploy it. Configure the custom domain in GitHub Pages, verify `kalenderabos.de` for the `pke` account, point the Porkbun `aesales` CNAME to `pke.github.io`, and retire Vercel only after HTTPS and feed integrity checks pass.

**Tech Stack:** GitHub Actions, GitHub Pages, Node.js 24, TypeScript, Node test runner, Porkbun DNS, Vercel CLI

**Spec:** `docs/plans/2026-09-03-github-pages-migration-design.md`

## Global Constraints

- The canonical website URL is `https://aesales.kalenderabos.de/`.
- The canonical feed URL is `https://aesales.kalenderabos.de/aliexpress-sales.ics`.
- Existing subscriptions to the Vercel URL are intentionally not preserved.
- Keep all existing empty-feed, continuity, rollover, and maximum-growth safeguards unchanged.
- A failed scrape or deploy must leave the last successful Pages deployment available.
- Verify `kalenderabos.de` for the GitHub account `pke` before assigning the repository custom domain.
- Point the `aesales` CNAME directly to `pke.github.io`, without the repository name.
- Do not delete the Vercel project until the custom-domain website and feed pass all end-to-end checks.
- Pin third-party GitHub Actions to immutable commit SHAs with readable release comments.
- Do not commit or push unless the user explicitly says `commit` or otherwise explicitly authorizes a commit.
- Before every Git/GitHub write, verify repository path, active account `pke`, commit email `phil.kursawe@gmail.com`, and signing key `923E6361D8D6F83D`.

## File map

- Create `test/pages-hosting.test.ts`: deployment, canonical URL, badge, and Vercel-removal contract tests.
- Modify `.github/workflows/update-calendar.yml`: combine validated calendar updates with Pages artifact deployment.
- Modify `public/index.html`: use the canonical custom-domain feed and monthly-update copy.
- Modify `README.md`: document GitHub Pages, canonical subscription URLs, deployment behavior, and the approved badge row.
- Modify `package.json`: remove the obsolete Vercel development command.
- Delete `vercel.json`: remove obsolete Vercel project configuration.
- Keep `lib/events.ts), `lib/ical.ts), `lib/scrape.ts), and `lib/update.ts` behavior unchanged.

---

### Task 1: Add migration contract tests

**Files:**
- Create: `test/pages-hosting.test.ts`
- Read: `.github/workflows/update-calendar.yml`
- Read: `public/index.html`
- Read: `README.md`
- Read: `package.json`
- Read: `vercel.json`

**Interfaces:**
- Consumes: repository files as UTF-8 text.
- Produces: tests that define the required Pages workflow, canonical URLs, badges, and Vercel cleanup.

- [ ] **Step 1: Create a feature branch**

Run:

```bash
git checkout -b feat/github-pages-hosting
```

Expected: Git reports a new branch named `feat/github-pages-hosting`.

- [ ] **Step 2: Write the failing contract tests**

Create `test/pages-hosting.test.ts` with:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("calendar workflow updates and deploys GitHub Pages", () => {
  const workflow = readProjectFile(".github/workflows/update-calendar.yml");

  assert.ok(workflow.includes("name: Update and deploy sales calendar"));
  assert.ok(
    workflow.includes("push:\n    branches:\n      - master"),
    "workflow must deploy ordinary master pushes",
  );
  assert.ok(workflow.includes("contents: write"));
  assert.ok(workflow.includes("pages: write"));
  assert.ok(workflow.includes("id-token: write"));
  assert.ok(workflow.includes("if: github.event_name != 'push'"));
  assert.ok(
    workflow.includes(
      "actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d",
    ),
  );
  assert.ok(
    workflow.includes(
      "actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9",
    ),
  );
  assert.ok(workflow.includes("path: public"));
  assert.ok(
    workflow.includes(
      "actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346",
    ),
  );
  assert.ok(workflow.includes("name: github-pages"));
});

test("site and documentation use the canonical calendar domain", () => {
  const index = readProjectFile("public/index.html");
  const readme = readProjectFile("README.md");
  const canonicalFeed =
    "https://aesales.kalenderabos.de/aliexpress-sales.ics";

  assert.ok(index.includes(canonicalFeed));
  assert.ok(readme.includes(canonicalFeed));
  assert.ok(readme.includes("webcal://aesales.kalenderabos.de/aliexpress-sales.ics"));
  assert.ok(!index.includes("aliexpress-calendar.vercel.app"));
  assert.ok(!readme.includes("aliexpress-calendar.vercel.app"));
  assert.ok(index.includes("Updated monthly"));
});

test("README contains the approved compact badge row", () => {
  const readme = readProjectFile("README.md");

  assert.ok(
    readme.includes(
      "actions/workflows/update-calendar.yml/badge.svg?branch=master",
    ),
  );
  assert.ok(readme.includes("img.shields.io/badge/Subscribe-calendar-FF4747"));
  assert.ok(readme.includes("img.shields.io/badge/License-MIT-2F80ED.svg"));
});

test("tracked Vercel configuration is removed", () => {
  const packageJson = JSON.parse(readProjectFile("package.json")) as {
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.scripts.dev, undefined);
  assert.equal(
    existsSync(new URL("../vercel.json", import.meta.url)),
    false,
  );
});
```

- [ ] **Step 3: Run the contract tests and confirm the red state**

Run:

```bash
node --import tsx --test test/pages-hosting.test.ts
```

Expected: the existing 30 tests pass and the new migration tests fail because the workflow lacks Pages deployment, the README still names Vercel, and `vercel.json` still exists.

- [ ] **Step 4: Leave the failing test uncommitted**

Do not commit yet. The project-level rule requires explicit user authorization before any commit.

---

### Task 2: Combine monthly updates with Pages deployment

**Files:**
- Modify: `.github/workflows/update-calendar.yml`
- Test: `test/pages-hosting.test.ts`

**Interfaces:**
- Consumes: checked-in `public/` files on pushes and freshly validated `public/aliexpress-sales.ics` on schedule/manual runs.
- Produces: a `github-pages` artifact from `public/` and a deployment URL from the Pages deployment job.

- [ ] **Step 1: Replace the workflow with the combined update/deploy workflow**

Set `.github/workflows/update-calendar.yml` to:

```yaml
name: Update and deploy sales calendar

on:
  push:
    branches:
      - master
  schedule:
    - cron: "0 6 1 * *"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: update-and-deploy-sales-calendar
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out master
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          ref: master
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Test and type-check
        run: |
          npm test
          npm run typecheck

      - name: Scrape and validate calendar
        if: github.event_name != 'push'
        run: npm run update

      - name: Commit validated calendar changes
        if: github.event_name != 'push'
        run: |
          git add lib/events.ts public/aliexpress-sales.ics
          if git diff --cached --quiet; then
            echo "No calendar changes to commit."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -m "chore: update AliExpress sales calendar"
          git push origin HEAD:master

      - name: Configure GitHub Pages
        uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6.0.0

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with:
          path: public

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

- [ ] **Step 2: Run the workflow contract test**

Run:

```bash
node --import tsx --test test/pages-hosting.test.ts
```

Expected: the workflow assertions pass; site, badge, and Vercel-removal assertions remain red.

- [ ] **Step 3: Validate YAML structure locally**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/update-calendar.yml"); puts "workflow YAML parsed"'
```

Expected: `workflow YAML parsed`.

- [ ] **Step 4: Leave the workflow change uncommitted**

Do not commit yet. Preserve it with the failing/partially passing test for the next task.

---

### Task 3: Switch site copy, URLs, badges, and repository metadata

**Files:**
- Modify: `public/index.html`
- Modify: `README.md`
- Modify: `package.json`
- Delete: `vercel.json`
- Test: `test/pages-hosting.test.ts`

**Interfaces:**
- Consumes: canonical website/feed domain and workflow path from the design.
- Produces: all public subscription links and README actions pointing to `aesales.kalenderabos.de`, with no tracked Vercel configuration.

- [ ] **Step 1: Make the website use the canonical feed**

In `public/index.html`, add this element after the viewport meta tag:

```html
<link rel="canonical" href="https://aesales.kalenderabos.de/">
```

Replace the download anchor with:

```html
<a href="https://aesales.kalenderabos.de/aliexpress-sales.ics" class="action-btn">Download .ics</a>
```

Replace the first two JavaScript URL declarations with:

```js
const url = "https://aesales.kalenderabos.de/aliexpress-sales.ics";
const webcalUrl = url.replace(/^https?:/, "webcal:");
```

Replace the footer sentence with:

```html
Sale dates sourced from public AliExpress calendars. Updated monthly.
```

- [ ] **Step 2: Add the approved README badges**

Immediately below `# AliExpress Sales Calendar`, add:

```markdown
[![Update and deploy](https://github.com/pke/aliexpress-calendar/actions/workflows/update-calendar.yml/badge.svg?branch=master)](https://github.com/pke/aliexpress-calendar/actions/workflows/update-calendar.yml)
[![Subscribe](https://img.shields.io/badge/Subscribe-calendar-FF4747?logo=googlecalendar&logoColor=white)](https://aesales.kalenderabos.de/aliexpress-sales.ics)
[![License: MIT](https://img.shields.io/badge/License-MIT-2F80ED.svg)](LICENSE)
```

- [ ] **Step 3: Rewrite README hosting and subscription references**

Use this opening and subscription section:

```markdown
Subscribable iCal feed of AliExpress promo events, hosted on GitHub Pages.

## Subscribe

- **URL:** `https://aesales.kalenderabos.de/aliexpress-sales.ics`
- **Google Calendar:** [Add to Google Calendar](https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Faesales.kalenderabos.de%2Faliexpress-sales.ics)
- **Apple Calendar / Outlook:** Use `webcal://aesales.kalenderabos.de/aliexpress-sales.ics`
```

Replace the final deployment sentence with:

```markdown
The same workflow deploys the validated `public/` directory to GitHub Pages after updates and on every push to `master`.
```

- [ ] **Step 4: Remove tracked Vercel configuration**

Delete the `"dev": "vercel dev"` entry from `package.json`, preserving valid JSON, and delete the empty `vercel.json` file.

- [ ] **Step 5: Run all local checks**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: 34 tests pass, TypeScript exits successfully, and `git diff --check` prints nothing.

- [ ] **Step 6: Confirm the generated feed remains untouched**

Run:

```bash
git diff --exit-code -- lib/events.ts public/aliexpress-sales.ics
```

Expected: exit code 0 and no output.

- [ ] **Step 7: Leave all implementation changes uncommitted**

Do not commit until the user explicitly authorizes the Git operation.

---

### Task 4: Prepare GitHub Pages and verify domain ownership

**Files:**
- No repository file changes.
- External state: GitHub Pages settings for `pke/aliexpress-calendar`.
- External state: GitHub account Pages-domain verification for `pke`.
- External state: Porkbun TXT record for `kalenderabos.de`.

**Interfaces:**
- Consumes: authenticated `pke` GitHub session and Porkbun DNS access.
- Produces: a Pages site configured for Actions and a verified root domain before the custom hostname is claimed.

- [ ] **Step 1: Verify identities before external writes**

Run:

```bash
pwd
gh auth status -h github.com
git config --get user.email
git config --get user.signingkey
```

Expected: repository path ends in `/projects/private/aliexpress.calendar`, active account is `pke`, email is `phil.kursawe@gmail.com`, and signing key is `923E6361D8D6F83D`.

- [ ] **Step 2: Enable GitHub Pages with Actions as the source**

The Pages endpoint currently returns 404, so create it:

```bash
gh api --method POST repos/pke/aliexpress-calendar/pages -f build_type=workflow
```

Expected: HTTP 201 and a Pages site for the repository. Confirm with:

```bash
gh api repos/pke/aliexpress-calendar/pages --jq '{build_type,html_url,status}'
```

Expected: `build_type` is `workflow`.

- [ ] **Step 3: Start root-domain verification in GitHub**

In the signed-in `pke` GitHub account, open **Settings → Pages → Add a domain**, enter `kalenderabos.de`, and copy GitHub's exact TXT challenge value.

- [ ] **Step 4: Add the verification TXT record at Porkbun**

In Porkbun DNS for `kalenderabos.de`, add:

```text
Type: TXT
Host: _github-pages-challenge-pke
Answer: the exact challenge value displayed by GitHub
TTL: 600
```

Keep this TXT record after verification to protect the domain from Pages takeover.

- [ ] **Step 5: Verify TXT propagation and complete GitHub verification**

Run:

```bash
dig +short TXT _github-pages-challenge-pke.kalenderabos.de
```

Expected: the exact quoted challenge value shown by GitHub. Return to **Settings → Pages** for the `pke` account and click **Verify**.

---

### Task 5: Commit, push, and verify the initial Pages deployment

**Files:**
- Commit all files from Tasks 1–3 plus the design and implementation plans.
- External state: `master` and the `Update and deploy sales calendar` workflow.

**Interfaces:**
- Consumes: passing local changes and Pages configured with `build_type=workflow`.
- Produces: a signed commit on `master` and a successful Pages deployment at the temporary inherited project URL under the existing `pke.fyi` account Pages domain.

- [ ] **Step 1: Stop for explicit commit authorization**

Ask the user to say `commit, merge to master, and push`. Do not continue this task without that explicit authorization.

- [ ] **Step 2: Re-verify repository state and Git identity**

Run:

```bash
pwd
git branch --show-current
git status --short
git remote -v
gh auth status -h github.com
git config --get user.email
git config --get user.signingkey
```

Expected: branch is `feat/github-pages-hosting`, origin is `https://github.com/pke/aliexpress-calendar.git`, active account is `pke`, and the configured email/key match the global constraints.

- [ ] **Step 3: Re-run verification immediately before commit**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, type-check succeeds, and the diff check is clean.

- [ ] **Step 4: Create the signed feature commit**

Run:

```bash
git add .github/workflows/update-calendar.yml README.md package.json public/index.html test/pages-hosting.test.ts docs/plans/2026-09-03-github-pages-migration-design.md docs/superpowers/plans/2026-09-03-github-pages-migration.md vercel.json
git commit -S923E6361D8D6F83D -m "feat: migrate calendar hosting to GitHub Pages"
```

Expected: one signed commit containing only the planned migration files.

- [ ] **Step 5: Fast-forward the feature into current master**

Run:

```bash
git fetch origin master
git checkout master
git merge --ff-only feat/github-pages-hosting
```

Expected: `master` advances to the feature commit without a merge commit.

- [ ] **Step 6: Push master**

Run:

```bash
git push origin master
```

Expected: GitHub accepts the workflow update and advances `origin/master`.

- [ ] **Step 7: Watch the Pages workflow**

Run:

```bash
gh run list --workflow update-calendar.yml --branch master --limit 1
```

Capture the newest run and watch it:

```bash
calendar_pages_run_id="$(gh run list --workflow update-calendar.yml --branch master --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$calendar_pages_run_id" --exit-status
```

Expected: the `build` and `deploy` jobs complete successfully.

- [ ] **Step 8: Verify the temporary inherited Pages artifact**

Run:

```bash
curl -fsS https://pke.fyi/aliexpress-calendar/ -o /tmp/aliexpress-calendar-index.html
curl -fsS https://pke.fyi/aliexpress-calendar/aliexpress-sales.ics -o /tmp/aliexpress-calendar-default.ics
rg -n "AliExpress Sales Calendar" /tmp/aliexpress-calendar-index.html
rg -c "BEGIN:VEVENT" /tmp/aliexpress-calendar-default.ics
```

Expected: the page title is found and the feed contains at least one event.

---

### Task 6: Assign the custom domain, change DNS, and enable HTTPS

**Files:**
- No repository file changes.
- External state: GitHub Pages custom domain and HTTPS.
- External state: Porkbun `aesales` CNAME, which overrides the existing `*.kalenderabos.de → pixie.porkbun.com` wildcard.

**Interfaces:**
- Consumes: verified `kalenderabos.de` ownership and successful default Pages deployment.
- Produces: `aesales.kalenderabos.de` served by GitHub Pages over enforced HTTPS.

- [ ] **Step 1: Assign the custom domain before changing DNS**

Run:

```bash
gh api --method PUT repos/pke/aliexpress-calendar/pages -f build_type=workflow -f cname=aesales.kalenderabos.de
```

Expected: HTTP 204. Confirm:

```bash
gh api repos/pke/aliexpress-calendar/pages --jq '{cname,build_type}'
```

Expected: `cname` is `aesales.kalenderabos.de` and `build_type` is `workflow`.

- [ ] **Step 2: Add a specific Porkbun record**

In Porkbun DNS, leave the shared `*.kalenderabos.de → pixie.porkbun.com` wildcard unchanged. Add this more-specific record so only `aesales` overrides the wildcard:

```text
Type: CNAME
Host: aesales
Answer: pke.github.io
TTL: 600
```

- [ ] **Step 3: Verify DNS**

Run:

```bash
dig +short CNAME aesales.kalenderabos.de
```

Expected:

```text
pke.github.io.
```

- [ ] **Step 4: Wait for certificate eligibility**

Poll no more often than once every few minutes:

```bash
gh api repos/pke/aliexpress-calendar/pages --jq '{cname,https_enforced,certificate: .https_certificate.state}'
```

Expected: the certificate state becomes `approved`. DNS and certificate propagation can take up to 24 hours; do not delete Vercel while waiting.

- [ ] **Step 5: Enforce HTTPS**

Run:

```bash
gh api --method PUT repos/pke/aliexpress-calendar/pages -F https_enforced=true
```

Expected: HTTP 204. Confirm that `https_enforced` is `true` with the query from Step 4.

---

### Task 7: Verify the custom-domain release and delete Vercel

**Files:**
- No tracked repository file changes.
- External state: Vercel project `aliexpress-calendar` with ID `prj_hKqIn7XWtU4WTkxvh54j2TVI4Mqb`.

**Interfaces:**
- Consumes: HTTPS-enabled GitHub Pages deployment at the custom domain.
- Produces: verified production site/feed on Pages and deletion of the exact linked Vercel project.

- [ ] **Step 1: Download the production page and feed**

Run:

```bash
curl -fsS https://aesales.kalenderabos.de/ -o /tmp/aesales-index.html
curl -fsS https://aesales.kalenderabos.de/aliexpress-sales.ics -o /tmp/aesales-calendar.ics
```

Expected: both commands exit 0 and both files are non-empty.

- [ ] **Step 2: Verify canonical links and calendar structure**

Run:

```bash
rg -n "https://aesales\.kalenderabos\.de/aliexpress-sales\.ics" /tmp/aesales-index.html
rg -n "BEGIN:VCALENDAR|END:VCALENDAR" /tmp/aesales-calendar.ics
rg -c "BEGIN:VEVENT" /tmp/aesales-calendar.ics
rg -c "^  \{ name:" lib/events.ts
```

Expected: the page contains the canonical feed URL, the feed has calendar boundaries, and both count commands print the same non-zero event count.

- [ ] **Step 3: Verify response headers and subscription schemes**

Run:

```bash
curl -fsSI https://aesales.kalenderabos.de/
curl -fsSI https://aesales.kalenderabos.de/aliexpress-sales.ics
rg -n "webcal://aesales\.kalenderabos\.de/aliexpress-sales\.ics" /tmp/aesales-index.html README.md
```

Expected: both HTTPS responses are successful and the webcal URL appears in both the site behavior and README.

- [ ] **Step 4: Resolve the exact Vercel deletion target**

Run:

```bash
vercel project inspect aliexpress-calendar
sed -n '1,80p' .vercel/project.json
```

Expected: the project name is `aliexpress-calendar`, project ID is `prj_hKqIn7XWtU4WTkxvh54j2TVI4Mqb`, and organization ID is `team_IAL1C7998Uvv6ZXoPXccOqt2`. Stop if any identifier differs.

- [ ] **Step 5: Delete the verified Vercel project**

Run:

```bash
vercel project remove aliexpress-calendar
```

Confirm deletion only when the CLI names the exact project from Step 4. This is intentionally irreversible at the hosting-project level.

- [ ] **Step 6: Verify deletion and final repository state**

Run:

```bash
vercel project inspect aliexpress-calendar
git status --short --branch
gh api repos/pke/aliexpress-calendar/pages --jq '{html_url,cname,status,https_enforced}'
```

Expected: Vercel reports that the project does not exist, Git is clean on `master`, and GitHub Pages reports `aesales.kalenderabos.de`, built status, and enforced HTTPS.

## Official references

- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub Pages custom domains: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- GitHub Pages domain verification: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- GitHub Pages REST API: https://docs.github.com/en/rest/pages/pages
