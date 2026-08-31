# Monthly AliExpress Calendar Scraper Design

## Goal

Keep the published AliExpress calendar current without manual edits. A GitHub Actions workflow fetches the sales calendar from `https://en.ali-shop.net/sales` on the first day of each month at 06:00 UTC, validates it against the last known-good data, updates the repository only when the data changed, and relies on Vercel's Git integration to publish the result.

The workflow may publish imperfect source data, but it must never replace the live calendar with an empty or obviously unrelated feed.

## Architecture

The implementation remains a static Vercel site. No runtime scraper or backend is introduced.

- `lib/scrape.ts` contains pure functions for parsing, normalizing, comparing, and validating scraped event data.
- An update command fetches the source page, parses the calendar table, compares it with `lib/events.ts`, and prepares both generated files in memory.
- `lib/events.ts` remains the repository's inspectable event source and records the source URL and scrape date.
- `public/aliexpress-sales.ics` is regenerated only after the new event data passes every safeguard.
- `.github/workflows/update-calendar.yml` runs monthly and can also be started manually.
- The Vercel project is linked to `pke/aliexpress-calendar`, with `master` as the production branch. A successful workflow commit therefore triggers a production deployment.

## Event and iCalendar Semantics

Date ranges on the source page include the displayed end date. `SaleEvent.endDate` remains exclusive, as required by all-day iCalendar events, so the parser adds one day to the displayed end date.

The current iCalendar UID contains an array index and is unstable when an event is inserted. UIDs will instead be based on normalized event identity and year/month. A date adjustment within the same month will then update an existing subscribed event instead of creating a second identity. Duplicate names within a month receive a deterministic occurrence suffix.

The feed keeps its weekly refresh hints. Calendar clients decide when they actually poll a subscribed feed, so deployment updates the canonical URL immediately but cannot force an immediate client refresh.

## GitHub Actions Data Flow

The workflow runs on `0 6 1 * *` and `workflow_dispatch` with `contents: write` permission and concurrency protection.

1. Check out `master`.
2. Install the pinned Node.js dependencies with `npm ci`.
3. Run unit and integration tests.
4. Fetch the source page, retrying transient network failures up to three times.
5. Parse, normalize, validate, and compare the candidate events in memory.
6. Generate the TypeScript event source and iCalendar feed in memory.
7. Verify that the generated feed contains exactly one `VEVENT` per candidate event.
8. Write both generated files only after all checks succeed.
9. If Git reports no changes, exit successfully without a commit.
10. Otherwise, commit both files as `github-actions[bot]` and push directly to `master`.
11. Vercel builds and deploys the pushed revision through its GitHub integration.

The workflow log prints a compact summary of added, removed, and changed events.

## Safeguards

### Response and structure checks

- Require a successful HTTP response from the expected host.
- Require HTML content with a plausible minimum size.
- Require the expected sales-calendar table and parseable event rows.
- Require each row to contain a non-empty name and a valid date range.

### Candidate data checks

- Reject an empty result.
- Reject duplicate event identities.
- Require every end date to follow its start date.
- Reject implausible event durations.
- Require the events to belong predominantly to the expected calendar year.
- Require the generated `VEVENT` count to equal the parsed event count.

### Continuity checks

For normal same-year updates:

- At least 50% of the old events must still match exactly by normalized name and date range.
- At least 70% must be recognizable by normalized name and month, allowing small date shifts.
- The candidate event count must not fall below 60% of the previous count.

For a year rollover, continuity with the old year is not required. A candidate for the immediately following year is accepted only during the rollover window and only when it contains at least 20 valid events forming a plausible yearly calendar.

### Failure behavior

Parsing, validation, comparison, and feed generation occur before filesystem writes. Any failure exits non-zero and produces no commit, preserving the previously deployed feed. A failed Vercel build likewise leaves the previous successful production deployment in place.

## Testing

Tests use local HTML fixtures and do not depend on the external site. Coverage includes:

- parsing a valid current calendar table;
- accepting small name and date changes;
- rejecting an empty or missing table;
- rejecting malformed and reversed dates;
- rejecting excessive divergence or shrinkage;
- accepting a valid year rollover;
- preserving an iCalendar UID across a date shift within one month;
- matching the `SaleEvent` and `VEVENT` counts;
- running the update pipeline against a fixture without partial writes.

The scheduled workflow itself acts as the live-source smoke test. Its safeguards determine whether source changes are safe to publish.

## Operational Setup

Vercel currently reports no Git link and no production branch for the project. Before relying on the workflow, connect the existing Vercel project to the GitHub repository `pke/aliexpress-calendar` and select `master` as its production branch. GitHub Actions must be allowed to write repository contents and push to `master`; branch protection must permit the workflow identity if protection is enabled.
