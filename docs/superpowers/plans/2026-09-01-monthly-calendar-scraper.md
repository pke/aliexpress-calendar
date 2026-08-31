# Monthly AliExpress Calendar Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape the AliExpress sales calendar monthly, reject empty or implausible replacements, commit validated changes directly to `master`, and publish them through Vercel's Git integration.

**Architecture:** Keep the site static. Pure TypeScript functions parse and validate the external HTML, a small update pipeline writes `lib/events.ts` and the iCalendar feed only after all checks pass, and GitHub Actions runs that pipeline monthly. Vercel deploys successful workflow commits through its native GitHub link.

**Tech Stack:** Node.js 24, TypeScript 6, built-in `node:test`, Cheerio, GitHub Actions, Vercel static hosting

**Spec:** `docs/plans/2026-09-01-monthly-calendar-scraper-design.md`

## Global Constraints

- Scrape only `https://en.ali-shop.net/sales` and reject redirects to another host.
- Run on the first day of every month at 06:00 UTC and support `workflow_dispatch`.
- Reject an empty scrape and never commit partially generated output.
- For same-year updates, require 50% exact overlap, 70% normalized-name/month overlap, and at least 60% of the previous event count.
- Permit zero overlap only for the immediately following calendar year during November through February, with at least 20 candidate events.
- Keep `SaleEvent.endDate` exclusive and convert the source's inclusive displayed end date by adding one day.
- Keep the canonical feed URL unchanged: `/aliexpress-sales.ics`.
- Push generated workflow updates directly to `master` with the repository-scoped `GITHUB_TOKEN`; do not store a personal GitHub token.
- Do not create manual commits while executing this plan unless the user explicitly asks for a commit. The scheduled workflow's generated-data commit is part of the approved feature.
- Use the `pke` GitHub account for repository and Vercel linking because this repository is under `/Users/pkursawe/projects/private/`.

## File Map

- Create `lib/scrape.ts`: parse source HTML, normalize events, validate continuity, compute differences, and render `events.ts`.
- Create `lib/update.ts`: fetch with retries and response guards, build both generated outputs in memory, and replace files only after validation.
- Create `update-calendar.ts`: production CLI entry point for the scheduled update.
- Create `test/fixtures/sales-2026.html`: deterministic source-page fixture.
- Create `test/scrape.test.ts`: parser and continuity-policy tests.
- Create `test/ical.test.ts`: stable UID and event-count tests.
- Create `test/update.test.ts`: response-guard and no-partial-write integration tests.
- Create `.github/workflows/update-calendar.yml`: monthly/manual automation and direct generated-data commit.
- Modify `lib/ical.ts`: inject generation time and generate stable event UIDs.
- Modify `lib/events.ts`: generated provenance header while retaining the exported `SaleEvent` and `events` API.
- Modify `package.json` and `package-lock.json`: add Cheerio and test/update/typecheck scripts.
- Modify `tsconfig.json`: type-check root scripts and tests.
- Modify `README.md`: document automatic updates, safeguards, and manual execution.

---

### Task 1: HTML Parser and Test Harness

**Files:**
- Create: `lib/scrape.ts`
- Create: `test/fixtures/sales-2026.html`
- Create: `test/scrape.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `SaleEvent` from `lib/events.ts`.
- Produces: `ParsedSalesPage`, `parseSalesPage(html: string): ParsedSalesPage`, and `normalizeEventName(name: string): string`.

- [ ] **Step 1: Add the HTML parser dependency and test scripts**

Run:

```bash
npm install cheerio
```

Set the `package.json` scripts to:

```json
{
  "dev": "vercel dev",
  "generate": "tsx generate.ts",
  "update": "tsx update-calendar.ts",
  "test": "node --import tsx --test test/*.test.ts",
  "typecheck": "tsc --noEmit"
}
```

Change `tsconfig.json`'s `include` to:

```json
["*.ts", "lib/**/*.ts", "test/**/*.ts"]
```

- [ ] **Step 2: Add a representative HTML fixture**

Create `test/fixtures/sales-2026.html` with a first row that includes the month cell, later rows that omit it, and a range crossing into December:

```html
<!doctype html>
<html lang="en">
  <body>
    <h1>AliExpress Sales Calendar for 2026</h1>
    <table>
      <thead>
        <tr><th>Month</th><th>Name</th><th>Date</th></tr>
      </thead>
      <tbody>
        <tr><td rowspan="2">January</td><td>Choice Day + New Year Deals</td><td>01.01-07.01</td></tr>
        <tr><td>Winter Sale</td><td>12.01-18.01</td></tr>
        <tr><td>November</td><td>Black Friday</td><td>20.11-03.12</td></tr>
        <tr><td>December</td><td>Christmas Sale</td><td>08.12-14.12</td></tr>
      </tbody>
    </table>
  </body>
</html>
```

- [ ] **Step 3: Write parser tests that initially fail**

Create `test/scrape.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeEventName, parseSalesPage } from "../lib/scrape.js";

const fixture = readFileSync(
  new URL("./fixtures/sales-2026.html", import.meta.url),
  "utf8",
);

test("parseSalesPage extracts the year and inclusive source ranges", () => {
  const result = parseSalesPage(fixture);

  assert.equal(result.year, 2026);
  assert.deepEqual(result.events, [
    { name: "Choice Day + New Year Deals", startDate: "20260101", endDate: "20260108" },
    { name: "Winter Sale", startDate: "20260112", endDate: "20260119" },
    { name: "Black Friday", startDate: "20261120", endDate: "20261204" },
    { name: "Christmas Sale", startDate: "20261208", endDate: "20261215" },
  ]);
});

test("parseSalesPage rejects a missing calendar table", () => {
  assert.throws(
    () => parseSalesPage("<h1>AliExpress Sales Calendar for 2026</h1>"),
    /sales calendar table/i,
  );
});

test("parseSalesPage rejects malformed ranges instead of skipping them", () => {
  const malformed = fixture.replace("01.01-07.01", "not-a-date");
  assert.throws(() => parseSalesPage(malformed), /date range/i);
});

test("normalizeEventName ignores punctuation, spacing, case, and accents", () => {
  assert.equal(normalizeEventName("  Fäll—SALE & Deals! "), "fall sale and deals");
});
```

- [ ] **Step 4: Run the parser tests and confirm the missing-module failure**

Run:

```bash
npm test
```

Expected: FAIL because `lib/scrape.ts` does not exist.

- [ ] **Step 5: Implement the smallest complete parser**

Create `lib/scrape.ts`:

```ts
import { load } from "cheerio";
import type { SaleEvent } from "./events.js";

const DAY_MS = 86_400_000;
const DATE_RANGE = /^(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$/;

export interface ParsedSalesPage {
  year: number;
  events: SaleEvent[];
}

export function normalizeEventName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function utcDate(year: number, month: number, day: number): Date {
  const result = new Date(Date.UTC(year, month - 1, day));
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${day}.${month}.${year}`);
  }
  return result;
}

function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function parseDateRange(text: string, year: number): Pick<SaleEvent, "startDate" | "endDate"> {
  const match = DATE_RANGE.exec(text.trim());
  if (!match) {
    throw new Error(`Invalid date range: ${text}`);
  }

  const [, startDayText, startMonthText, endDayText, endMonthText] = match;
  const startDay = Number(startDayText);
  const startMonth = Number(startMonthText);
  const endDay = Number(endDayText);
  const endMonth = Number(endMonthText);
  const endYear = endMonth < startMonth ? year + 1 : year;
  const start = utcDate(year, startMonth, startDay);
  const endInclusive = utcDate(endYear, endMonth, endDay);
  const endExclusive = new Date(endInclusive.getTime() + DAY_MS);

  return { startDate: compactDate(start), endDate: compactDate(endExclusive) };
}

export function parseSalesPage(html: string): ParsedSalesPage {
  const $ = load(html);
  const heading = $("h1").first().text().replace(/\s+/g, " ").trim();
  const yearMatch = /sales calendar for\s+(20\d{2})/i.exec(heading);
  if (!yearMatch) {
    throw new Error("Could not determine sales calendar year");
  }
  const year = Number(yearMatch[1]);

  const table = $("table")
    .filter((_, element) => {
      const headers = $(element)
        .find("th")
        .map((__, header) => $(header).text().trim().toLowerCase())
        .get();
      return headers.includes("name") && headers.includes("date");
    })
    .first();

  if (table.length === 0) {
    throw new Error("Could not find the sales calendar table");
  }

  const events: SaleEvent[] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();
    if (cells.length === 0) return;
    if (cells.length < 2) throw new Error("Sales calendar row has too few cells");

    const name = cells.at(-2) ?? "";
    const rangeText = cells.at(-1) ?? "";
    if (!name) throw new Error("Sales calendar row has an empty event name");
    events.push({ name, ...parseDateRange(rangeText, year) });
  });

  if (events.length === 0) {
    throw new Error("Sales calendar table contains no events");
  }

  events.sort((left, right) =>
    left.startDate.localeCompare(right.startDate) ||
    left.endDate.localeCompare(right.endDate) ||
    left.name.localeCompare(right.name),
  );

  return { year, events };
}
```

- [ ] **Step 6: Run tests and type checking**

Run:

```bash
npm test
npm run typecheck
```

Expected: all parser tests PASS and TypeScript exits successfully.

- [ ] **Step 7: Review checkpoint without committing**

Run `git diff --check` and inspect only the Task 1 files. Do not commit unless the user explicitly asks.

---

### Task 2: Continuity Validation and Difference Reporting

**Files:**
- Modify: `lib/scrape.ts`
- Modify: `test/scrape.test.ts`

**Interfaces:**
- Consumes: `SaleEvent`, `normalizeEventName`.
- Produces: `ValidationReport`, `EventDiff`, `validateCandidate(previous, candidate, now)`, `diffEvents(previous, candidate)`, and `eventsEqual(previous, candidate)`.

- [ ] **Step 1: Add failing safeguard tests**

Append to `test/scrape.test.ts`:

```ts
import type { SaleEvent } from "../lib/events.js";
import {
  diffEvents,
  eventsEqual,
  validateCandidate,
} from "../lib/scrape.js";

function makeYear(year: number, count: number): SaleEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const month = Math.floor(index / 2) + 1;
    const day = index % 2 === 0 ? 1 : 10;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const end = String(day + 2).padStart(2, "0");
    return {
      name: `Event ${index + 1}`,
      startDate: `${year}${mm}${dd}`,
      endDate: `${year}${mm}${end}`,
    };
  });
}

test("validateCandidate accepts the exact continuity thresholds", () => {
  const previous = makeYear(2026, 10);
  const candidate = previous.map((event, index) => {
    if (index < 5) return event;
    if (index < 7) {
      return {
        ...event,
        startDate: `${event.startDate.slice(0, 6)}${String(Number(event.startDate.slice(6)) + 1).padStart(2, "0")}`,
        endDate: `${event.endDate.slice(0, 6)}${String(Number(event.endDate.slice(6)) + 1).padStart(2, "0")}`,
      };
    }
    return { ...event, name: `Replacement ${index + 1}` };
  });

  const report = validateCandidate(previous, candidate, new Date("2026-09-01T06:00:00Z"));
  assert.equal(report.exactRatio, 0.5);
  assert.equal(report.recognizableRatio, 0.7);
});

test("validateCandidate rejects empty, shrunken, and unrelated data", () => {
  const previous = makeYear(2026, 10);
  assert.throws(() => validateCandidate(previous, [], new Date("2026-09-01T06:00:00Z")), /empty/i);
  assert.throws(
    () => validateCandidate(previous, previous.slice(0, 5), new Date("2026-09-01T06:00:00Z")),
    /60%/,
  );
  assert.throws(
    () => validateCandidate(
      previous,
      previous.map((event, index) => ({ ...event, name: `Unrelated ${index}` })),
      new Date("2026-09-01T06:00:00Z"),
    ),
    /exact overlap/i,
  );
});

test("validateCandidate rejects duplicate and reversed events", () => {
  const previous = makeYear(2026, 10);
  assert.throws(
    () => validateCandidate(previous, [...previous, previous[0]], new Date("2026-09-01T06:00:00Z")),
    /duplicate/i,
  );
  const reversed = previous.map((event, index) =>
    index === 0 ? { ...event, endDate: event.startDate } : event,
  );
  assert.throws(
    () => validateCandidate(previous, reversed, new Date("2026-09-01T06:00:00Z")),
    /duration/i,
  );
});

test("validateCandidate permits only a plausible next-year rollover", () => {
  const previous = makeYear(2026, 20);
  const candidate = makeYear(2027, 20);
  assert.doesNotThrow(() =>
    validateCandidate(previous, candidate, new Date("2026-12-01T06:00:00Z")),
  );
  assert.throws(
    () => validateCandidate(previous, candidate, new Date("2026-06-01T06:00:00Z")),
    /year rollover/i,
  );
});

test("eventsEqual and diffEvents describe a date change", () => {
  const previous = makeYear(2026, 10);
  const candidate = previous.map((event, index) =>
    index === 0 ? { ...event, endDate: "20260104" } : event,
  );
  assert.equal(eventsEqual(previous, previous), true);
  assert.equal(eventsEqual(previous, candidate), false);
  assert.deepEqual(diffEvents(previous, candidate), {
    added: [],
    removed: [],
    changed: [{ before: previous[0], after: candidate[0] }],
  });
});
```

- [ ] **Step 2: Run the safeguard tests and confirm missing-export failures**

Run `npm test`.

Expected: FAIL because the validation and diff exports are missing.

- [ ] **Step 3: Implement continuity validation**

Append these types and functions to `lib/scrape.ts`:

```ts
const MAX_EVENT_DAYS = 45;

export interface ValidationReport {
  candidateYear: number;
  exactRatio: number;
  recognizableRatio: number;
  rollover: boolean;
}

export interface EventChange {
  before: SaleEvent;
  after: SaleEvent;
}

export interface EventDiff {
  added: SaleEvent[];
  removed: SaleEvent[];
  changed: EventChange[];
}

function parseCompactDate(value: string): Date {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid compact date: ${value}`);
  return utcDate(Number(value.slice(0, 4)), Number(value.slice(4, 6)), Number(value.slice(6, 8)));
}

function exactKey(event: SaleEvent): string {
  return `${normalizeEventName(event.name)}|${event.startDate}|${event.endDate}`;
}

function recognizableKey(event: SaleEvent): string {
  return `${normalizeEventName(event.name)}|${event.startDate.slice(0, 6)}`;
}

function overlapCount(left: readonly SaleEvent[], right: readonly SaleEvent[], key: (event: SaleEvent) => string): number {
  const remaining = new Map<string, number>();
  for (const event of right) remaining.set(key(event), (remaining.get(key(event)) ?? 0) + 1);
  let matches = 0;
  for (const event of left) {
    const value = key(event);
    const count = remaining.get(value) ?? 0;
    if (count > 0) {
      matches += 1;
      remaining.set(value, count - 1);
    }
  }
  return matches;
}

export function validateCandidate(
  previous: readonly SaleEvent[],
  candidate: readonly SaleEvent[],
  now: Date,
): ValidationReport {
  if (candidate.length === 0) throw new Error("Candidate calendar is empty");

  const duplicateKeys = new Set<string>();
  for (const event of candidate) {
    const start = parseCompactDate(event.startDate);
    const end = parseCompactDate(event.endDate);
    const durationDays = (end.getTime() - start.getTime()) / DAY_MS;
    if (durationDays <= 0 || durationDays > MAX_EVENT_DAYS) {
      throw new Error(`Implausible event duration for ${event.name}: ${durationDays} days`);
    }
    const key = exactKey(event);
    if (duplicateKeys.has(key)) throw new Error(`Duplicate event: ${event.name}`);
    duplicateKeys.add(key);
  }

  const candidateYears = new Set(candidate.map((event) => Number(event.startDate.slice(0, 4))));
  if (candidateYears.size !== 1) throw new Error("Candidate spans multiple start years");
  const candidateYear = [...candidateYears][0];

  if (previous.length === 0) {
    if (candidate.length < 20) throw new Error("Initial calendar must contain at least 20 events");
    return { candidateYear, exactRatio: 0, recognizableRatio: 0, rollover: true };
  }

  const previousYear = Number(previous[0].startDate.slice(0, 4));
  const rolloverWindow = [10, 11, 0, 1].includes(now.getUTCMonth());
  const rollover = candidateYear === previousYear + 1;

  if (rollover) {
    if (!rolloverWindow || candidate.length < 20) {
      throw new Error("Rejected implausible year rollover");
    }
    return { candidateYear, exactRatio: 0, recognizableRatio: 0, rollover: true };
  }

  if (candidateYear !== previousYear) {
    throw new Error(`Candidate year ${candidateYear} does not match previous year ${previousYear}`);
  }
  if (candidate.length < Math.ceil(previous.length * 0.6)) {
    throw new Error("Candidate contains less than 60% of the previous event count");
  }

  const exactRatio = overlapCount(previous, candidate, exactKey) / previous.length;
  const recognizableRatio = overlapCount(previous, candidate, recognizableKey) / previous.length;
  if (exactRatio < 0.5) throw new Error(`Exact overlap is below 50%: ${exactRatio}`);
  if (recognizableRatio < 0.7) {
    throw new Error(`Recognizable name/month overlap is below 70%: ${recognizableRatio}`);
  }

  return { candidateYear, exactRatio, recognizableRatio, rollover: false };
}

export function eventsEqual(left: readonly SaleEvent[], right: readonly SaleEvent[]): boolean {
  return left.length === right.length && left.every((event, index) => exactKey(event) === exactKey(right[index]));
}

export function diffEvents(previous: readonly SaleEvent[], candidate: readonly SaleEvent[]): EventDiff {
  const oldByIdentity = new Map(previous.map((event) => [recognizableKey(event), event]));
  const newByIdentity = new Map(candidate.map((event) => [recognizableKey(event), event]));
  const added = candidate.filter((event) => !oldByIdentity.has(recognizableKey(event)));
  const removed = previous.filter((event) => !newByIdentity.has(recognizableKey(event)));
  const changed: EventChange[] = [];

  for (const [identity, before] of oldByIdentity) {
    const after = newByIdentity.get(identity);
    if (after && exactKey(before) !== exactKey(after)) changed.push({ before, after });
  }

  return { added, removed, changed };
}
```

- [ ] **Step 4: Run tests and type checking**

Run:

```bash
npm test
npm run typecheck
```

Expected: all parser and safeguard tests PASS.

- [ ] **Step 5: Review checkpoint without committing**

Run `git diff --check` and inspect `lib/scrape.ts` and `test/scrape.test.ts`. Do not commit unless explicitly requested.

---

### Task 3: Stable iCalendar Identity

**Files:**
- Create: `test/ical.test.ts`
- Modify: `lib/ical.ts`

**Interfaces:**
- Consumes: `SaleEvent`.
- Produces: `generateICal(events: readonly SaleEvent[], generatedAt?: Date): string` with stable UID values.

- [ ] **Step 1: Write failing UID and count tests**

Create `test/ical.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { generateICal } from "../lib/ical.js";
import type { SaleEvent } from "../lib/events.js";

function uid(ical: string): string {
  const match = /^UID:(.+)$/m.exec(ical);
  assert.ok(match);
  return match[1].trim();
}

test("a date shift within one month preserves the event UID", () => {
  const before: SaleEvent = { name: "Fall Sale", startDate: "20260915", endDate: "20260922" };
  const after: SaleEvent = { name: "Fall Sale", startDate: "20260914", endDate: "20260921" };
  const generatedAt = new Date("2026-09-01T06:00:00Z");
  assert.equal(uid(generateICal([before], generatedAt)), uid(generateICal([after], generatedAt)));
});

test("duplicate names in one month receive distinct deterministic UIDs", () => {
  const events: SaleEvent[] = [
    { name: "Brand Day", startDate: "20260901", endDate: "20260903" },
    { name: "Brand Day", startDate: "20260920", endDate: "20260922" },
  ];
  const ical = generateICal(events, new Date("2026-09-01T06:00:00Z"));
  const uids = [...ical.matchAll(/^UID:(.+)$/gm)].map((match) => match[1].trim());
  assert.equal(new Set(uids).size, 2);
  assert.equal(uids[1], `${uids[0].replace("@aliexpress-calendar", "")}-2@aliexpress-calendar`);
});

test("the feed contains exactly one VEVENT per source event", () => {
  const events: SaleEvent[] = [
    { name: "Choice Day", startDate: "20260901", endDate: "20260908" },
    { name: "Fall Sale", startDate: "20260914", endDate: "20260921" },
  ];
  const ical = generateICal(events, new Date("2026-09-01T06:00:00Z"));
  assert.equal(ical.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, events.length);
});
```

- [ ] **Step 2: Run the UID test and confirm it fails with the index-based UID**

Run:

```bash
node --import tsx --test test/ical.test.ts
```

Expected: the date-shift assertion fails because the existing UID includes `startDate` and an array index.

- [ ] **Step 3: Replace index-based UIDs with normalized month/name identities**

Update `lib/ical.ts` to:

```ts
import type { SaleEvent } from "./events.js";

function escapeText(text: string): string {
  return text.replace(/[\\;,]/g, (character) => `\\${character}`);
}

function uidSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "event";
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function generateICal(
  events: readonly SaleEvent[],
  generatedAt: Date = new Date(),
): string {
  const occurrences = new Map<string, number>();
  const vevents = events
    .map((event) => {
      const baseUid = `${event.startDate.slice(0, 6)}-${uidSlug(event.name)}`;
      const occurrence = (occurrences.get(baseUid) ?? 0) + 1;
      occurrences.set(baseUid, occurrence);
      const uid = `${baseUid}${occurrence === 1 ? "" : `-${occurrence}`}@aliexpress-calendar`;

      return [
        "BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${event.startDate}`,
        `DTEND;VALUE=DATE:${event.endDate}`,
        `SUMMARY:${escapeText(event.name)}`,
        `UID:${uid}`,
        `DTSTAMP:${timestamp(generatedAt)}`,
        "DESCRIPTION:AliExpress promo event",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AliExpress Sales Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:AliExpress Sales",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:P7D",
    "X-PUBLISHED-TTL:P7D",
    vevents,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
```

- [ ] **Step 4: Run the iCalendar and full test suites**

Run:

```bash
node --import tsx --test test/ical.test.ts
npm test
npm run typecheck
```

Expected: all tests PASS.

- [ ] **Step 5: Review checkpoint without committing**

Run `git diff --check` and inspect the UID diff. Do not commit unless explicitly requested.

---

### Task 4: Guarded Fetch and Update Pipeline

**Files:**
- Create: `lib/update.ts`
- Create: `update-calendar.ts`
- Create: `test/update.test.ts`
- Modify: `lib/scrape.ts`
- Modify: `lib/events.ts`

**Interfaces:**
- Consumes: `parseSalesPage`, `validateCandidate`, `eventsEqual`, `diffEvents`, `generateICal`, and current `events`.
- Produces: `renderEventsModule`, `fetchSalesPage`, `updateCalendar`, `UpdateResult`, and the `npm run update` command.

- [ ] **Step 1: Add failing rendering, response, and update tests**

Append to `test/scrape.test.ts`:

```ts
import { renderEventsModule } from "../lib/scrape.js";

test("renderEventsModule records source provenance and escapes names", () => {
  const output = renderEventsModule(
    [{ name: "Brand \"Day\"", startDate: "20260901", endDate: "20260903" }],
    "https://en.ali-shop.net/sales",
    new Date("2026-09-01T06:00:00Z"),
  );
  assert.match(output, /Generated from https:\/\/en\.ali-shop\.net\/sales on 2026-09-01/);
  assert.match(output, /name: "Brand \\\"Day\\\""/);
});
```

Create `test/update.test.ts`:

```ts
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SaleEvent } from "../lib/events.js";
import { parseSalesPage } from "../lib/scrape.js";
import { SALES_URL, fetchSalesPage, updateCalendar } from "../lib/update.js";

const fixture = await readFile(new URL("./fixtures/sales-2026.html", import.meta.url), "utf8");

function response(body: string, overrides: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    url: SALES_URL,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    text: async () => body,
    ...overrides,
  } as Response;
}

test("fetchSalesPage retries transient errors and validates the final response", async () => {
  let calls = 0;
  const html = fixture.padEnd(1_200, " ");
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    if (calls < 3) throw new Error("temporary network failure");
    return response(html);
  };
  assert.equal(await fetchSalesPage(SALES_URL, fetchImpl, async () => {}), html);
  assert.equal(calls, 3);
});

test("fetchSalesPage rejects redirects away from the approved host", async () => {
  const fetchImpl: typeof fetch = async () =>
    response(fixture.padEnd(1_200, " "), { url: "https://example.com/sales" });
  await assert.rejects(
    fetchSalesPage(SALES_URL, fetchImpl, async () => {}),
    /unexpected host/i,
  );
});

test("updateCalendar leaves both files unchanged when validation fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, "old calendar\n");
  const previousEvents = parseSalesPage(fixture).events;

  try {
    await assert.rejects(
      updateCalendar({
        previousEvents,
        now: new Date("2026-09-01T06:00:00Z"),
        sourceUrl: SALES_URL,
        eventsPath,
        calendarPath,
        fetchPage: async () => "<h1>AliExpress Sales Calendar for 2026</h1>",
      }),
      /sales calendar table/i,
    );
    assert.equal(await readFile(eventsPath, "utf8"), "old events\n");
    assert.equal(await readFile(calendarPath, "utf8"), "old calendar\n");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("updateCalendar writes both validated outputs and reports changes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aliexpress-calendar-"));
  const eventsPath = join(directory, "events.ts");
  const calendarPath = join(directory, "calendar.ics");
  await writeFile(eventsPath, "old events\n");
  await writeFile(calendarPath, "old calendar\n");
  const parsed = parseSalesPage(fixture).events;
  const previousEvents: SaleEvent[] = parsed.map((event, index) =>
    index === 0 ? { ...event, endDate: "20260107" } : event,
  );

  try {
    const result = await updateCalendar({
      previousEvents,
      now: new Date("2026-09-01T06:00:00Z"),
      sourceUrl: SALES_URL,
      eventsPath,
      calendarPath,
      fetchPage: async () => fixture,
    });
    assert.equal(result.changed, true);
    assert.equal(result.diff.changed.length, 1);
    assert.match(await readFile(eventsPath, "utf8"), /Choice Day \+ New Year Deals/);
    const ical = await readFile(calendarPath, "utf8");
    assert.equal(ical.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length, parsed.length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the new tests and confirm missing-export failures**

Run `npm test`.

Expected: FAIL because `renderEventsModule`, `lib/update.ts`, and their exports do not exist.

- [ ] **Step 3: Implement deterministic `events.ts` rendering**

Append to `lib/scrape.ts`:

```ts
export function renderEventsModule(
  events: readonly SaleEvent[],
  sourceUrl: string,
  scrapedAt: Date,
): string {
  const rows = events
    .map((event) => `  { name: ${JSON.stringify(event.name)}, startDate: ${JSON.stringify(event.startDate)}, endDate: ${JSON.stringify(event.endDate)} },`)
    .join("\n");

  return `export interface SaleEvent {
  name: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD (exclusive for iCal)
}

// Generated from ${sourceUrl} on ${scrapedAt.toISOString().slice(0, 10)}
export const events: SaleEvent[] = [
${rows}
];
`;
}
```

- [ ] **Step 4: Implement guarded network fetching and coordinated file replacement**

Create `lib/update.ts`:

```ts
import { rename, rm, writeFile } from "node:fs/promises";
import type { SaleEvent } from "./events.js";
import { generateICal } from "./ical.js";
import {
  diffEvents,
  eventsEqual,
  parseSalesPage,
  renderEventsModule,
  validateCandidate,
  type EventDiff,
  type ValidationReport,
} from "./scrape.js";

export const SALES_URL = "https://en.ali-shop.net/sales";
const MIN_HTML_BYTES = 1_000;
const MAX_HTML_BYTES = 2_000_000;

type Sleep = (milliseconds: number) => Promise<void>;

export interface UpdateCalendarOptions {
  previousEvents: readonly SaleEvent[];
  now: Date;
  sourceUrl: string;
  eventsPath: string;
  calendarPath: string;
  fetchPage?: (url: string) => Promise<string>;
}

export interface UpdateResult {
  changed: boolean;
  eventCount: number;
  diff: EventDiff;
  validation: ValidationReport;
}

export async function fetchSalesPage(
  url: string,
  fetchImpl: typeof fetch = fetch,
  sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<string> {
  const expectedHost = new URL(url).hostname;
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "follow",
        headers: { "user-agent": "aliexpress-calendar/1.0 (+https://github.com/pke/aliexpress-calendar)" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
      if (new URL(response.url).hostname !== expectedHost) {
        throw new Error(`Source redirected to unexpected host: ${response.url}`);
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        throw new Error(`Source returned non-HTML content: ${response.headers.get("content-type")}`);
      }

      const html = await response.text();
      if (html.length < MIN_HTML_BYTES || html.length > MAX_HTML_BYTES) {
        throw new Error(`Source HTML size is implausible: ${html.length} bytes`);
      }
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 500);
    }
  }

  throw new Error("Could not fetch a valid sales page after 3 attempts", { cause: lastError });
}

export async function updateCalendar(options: UpdateCalendarOptions): Promise<UpdateResult> {
  const fetchPage = options.fetchPage ?? fetchSalesPage;
  const html = await fetchPage(options.sourceUrl);
  const parsed = parseSalesPage(html);
  const validation = validateCandidate(options.previousEvents, parsed.events, options.now);
  const diff = diffEvents(options.previousEvents, parsed.events);

  if (eventsEqual(options.previousEvents, parsed.events)) {
    return { changed: false, eventCount: parsed.events.length, diff, validation };
  }

  const eventsModule = renderEventsModule(parsed.events, options.sourceUrl, options.now);
  const calendar = generateICal(parsed.events, options.now);
  const veventCount = calendar.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length;
  if (veventCount !== parsed.events.length) {
    throw new Error(`Generated ${veventCount} VEVENT blocks for ${parsed.events.length} events`);
  }

  const eventsTemporaryPath = `${options.eventsPath}.tmp`;
  const calendarTemporaryPath = `${options.calendarPath}.tmp`;
  try {
    await Promise.all([
      writeFile(eventsTemporaryPath, eventsModule, "utf8"),
      writeFile(calendarTemporaryPath, calendar, "utf8"),
    ]);
    await rename(eventsTemporaryPath, options.eventsPath);
    await rename(calendarTemporaryPath, options.calendarPath);
  } finally {
    await Promise.all([
      rm(eventsTemporaryPath, { force: true }),
      rm(calendarTemporaryPath, { force: true }),
    ]);
  }

  return { changed: true, eventCount: parsed.events.length, diff, validation };
}
```

- [ ] **Step 5: Implement the update CLI**

Create `update-calendar.ts`:

```ts
import { resolve } from "node:path";
import { events } from "./lib/events.js";
import { SALES_URL, updateCalendar } from "./lib/update.js";

try {
  const result = await updateCalendar({
    previousEvents: events,
    now: new Date(),
    sourceUrl: SALES_URL,
    eventsPath: resolve("lib/events.ts"),
    calendarPath: resolve("public/aliexpress-sales.ics"),
  });

  if (!result.changed) {
    console.log(`No calendar changes (${result.eventCount} events).`);
  } else {
    console.log(`Updated ${result.eventCount} events.`);
    console.log(`Added: ${result.diff.added.length}`);
    console.log(`Removed: ${result.diff.removed.length}`);
    console.log(`Changed: ${result.diff.changed.length}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

Update the provenance line in `lib/events.ts` to the generated format without changing the existing event data:

```ts
// Generated from https://en.ali-shop.net/sales on 2026-04-08
```

- [ ] **Step 6: Run all local verification**

Run:

```bash
npm test
npm run typecheck
npm run generate
git diff --check
```

Expected: all tests PASS, type checking succeeds, generation reports the current event count, and whitespace validation succeeds. Do not run `npm run update` against the live source until the tests pass because it intentionally rewrites the tracked data when the source has changed.

- [ ] **Step 7: Exercise the live source without publishing**

Run `npm run update`, inspect the logged added/removed/changed counts, rerun `npm test`, and inspect the complete `lib/events.ts` and `.ics` diffs. If a safeguard rejects the real page, preserve the old files and adjust only selectors proven by the fetched HTML; do not weaken the continuity thresholds without user approval.

- [ ] **Step 8: Review checkpoint without committing**

Run `git status --short` and confirm that only planned files changed. Do not commit unless explicitly requested.

---

### Task 5: GitHub Workflow and Documentation

**Files:**
- Create: `.github/workflows/update-calendar.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm test`, `npm run typecheck`, `npm run update`, and GitHub's repository-scoped token.
- Produces: scheduled/manual runs that push only validated `lib/events.ts` and `public/aliexpress-sales.ics` changes to `master`.

- [ ] **Step 1: Add the monthly workflow**

Create `.github/workflows/update-calendar.yml`:

```yaml
name: Update sales calendar

on:
  schedule:
    - cron: "0 6 1 * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: update-sales-calendar
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Check out master
        uses: actions/checkout@v6
        with:
          ref: master
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v7
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
        run: npm run update

      - name: Commit validated calendar changes
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
```

- [ ] **Step 2: Document operation and failure behavior**

Replace the manual-only update section in `README.md` with:

````markdown
## Updates

GitHub Actions checks `https://en.ali-shop.net/sales` on the first day of every month at 06:00 UTC. It can also be started manually with the **Update sales calendar** workflow.

The workflow parses and validates the source, compares it with the last known-good events, regenerates `lib/events.ts` and `public/aliexpress-sales.ics`, and commits only actual changes. A failed fetch, an empty result, invalid dates, or excessive divergence fails the workflow before a commit, so the published feed remains unchanged.

Run the same update locally with:

```bash
npm run update
```

Run verification with:

```bash
npm test
npm run typecheck
npm run generate
```

Vercel deploys commits to `master` through its GitHub integration.
````

- [ ] **Step 3: Verify workflow syntax and the complete repository**

Run:

```bash
npm test
npm run typecheck
npm run generate
git diff --check
git status --short
```

Expected: tests and type checking PASS, the feed regenerates successfully, no whitespace errors are reported, and the status contains only planned files.

- [ ] **Step 4: Review checkpoint without committing**

Inspect the workflow's requested permission and exact staged targets. Do not commit or push unless the user explicitly requests those Git operations.

---

### Task 6: Vercel Git Link and End-to-End Activation

**Files:**
- No repository files.

**Interfaces:**
- Consumes: linked local Vercel project `prj_hKqIn7XWtU4WTkxvh54j2TVI4Mqb`, repository `https://github.com/pke/aliexpress-calendar`, and production branch `master`.
- Produces: a Vercel Git link that deploys pushes to `master`.

- [ ] **Step 1: Verify all identities before the external write**

Run:

```bash
pwd
git remote -v
git branch --show-current
git config user.email
vercel whoami
gh auth status
```

Expected working directory: `/Users/pkursawe/projects/private/aliexpress.calendar`; remote: `pke/aliexpress-calendar`; branch: `master`; commit email: `phil.kursawe@gmail.com`; Vercel user: `pke`. The current `gh` credentials were invalid when this plan was written, so re-authenticate specifically as `pke` before any GitHub write if they remain invalid. Do not use `pke-scoop` for this private repository.

- [ ] **Step 2: Connect the existing Vercel project to GitHub**

Run from the linked project directory:

```bash
vercel git connect https://github.com/pke/aliexpress-calendar
```

Expected: Vercel confirms that `aliexpress-calendar` is connected to `pke/aliexpress-calendar`. This changes external project state and should be executed only after confirming the target printed by the CLI.

- [ ] **Step 3: Verify the Vercel link and production branch**

Run:

```bash
vercel api /v9/projects/prj_hKqIn7XWtU4WTkxvh54j2TVI4Mqb | jq '{name, productionBranch, link}'
```

Expected: `link` identifies the GitHub repository owned by `pke`, and the production branch is `master` either at the top level or inside the returned link object. If the branch is not `master`, set it in Vercel Project Settings → Git before enabling the workflow.

- [ ] **Step 4: Verify GitHub Actions write permission**

With `gh` authenticated as `pke`, run:

```bash
gh api repos/pke/aliexpress-calendar/actions/permissions/workflow
```

Expected: the repository permits a workflow that declares `contents: write`. If repository settings restrict the token to read-only, change Settings → Actions → General → Workflow permissions to **Read and write permissions** before the first scheduled run.

- [ ] **Step 5: Activate only after explicit commit and push authorization**

Because project instructions prohibit automatic commits by Codex, ask the user to explicitly authorize committing and pushing the implementation. Once authorized, verify the `pke` identity again, commit the planned files, push `master`, and confirm that Vercel creates a production deployment for that commit.

- [ ] **Step 6: Run the workflow manually and verify the whole path**

After the workflow file exists on `master`, trigger **Update sales calendar** with `workflow_dispatch`. Confirm:

1. tests and type checking pass;
2. the scraper either reports no changes or commits exactly the two generated files;
3. a generated commit uses the GitHub Actions bot identity;
4. Vercel creates a successful production deployment when a generated commit exists;
5. `https://aliexpress-calendar.vercel.app/aliexpress-sales.ics` remains non-empty and contains the expected number of `VEVENT` blocks.

If no source change exists, the workflow should exit successfully without a commit; use the Vercel link verification from Step 3 as proof of deployment wiring rather than manufacturing a data change.

---

## Final Verification

- [ ] Run `npm test` and confirm every parser, safeguard, UID, and update-pipeline test passes.
- [ ] Run `npm run typecheck` and confirm zero TypeScript errors.
- [ ] Run `npm run generate` and confirm a non-empty feed with matching `SaleEvent`/`VEVENT` counts.
- [ ] Run `git diff --check` and inspect `git status --short` for unintended files.
- [ ] Confirm the Vercel project link targets `pke/aliexpress-calendar` and production branch `master`.
- [ ] Confirm GitHub Actions can request `contents: write` without a personal token.
- [ ] Confirm the manual workflow is successful after the implementation is explicitly committed and pushed.
