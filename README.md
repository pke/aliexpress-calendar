# AliExpress Sales Calendar

Subscribable iCal feed of AliExpress promo events, hosted on Vercel.

## Subscribe

- **URL:** `https://aliexpress-calendar.vercel.app/aliexpress-sales.ics`
- **Google Calendar:** [Add to Google Calendar](https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Faliexpress-calendar.vercel.app%2Faliexpress-sales.ics)
- **Apple Calendar / Outlook:** Use `webcal://aliexpress-calendar.vercel.app/aliexpress-sales.ics`

## Updates

GitHub Actions checks `https://en.ali-shop.net/sales` on the first day of
every month at 06:00 UTC. It can also be started manually with the
**Update sales calendar** workflow.

The workflow parses and validates the source, compares it with the last
known-good events, regenerates `lib/events.ts` and
`public/aliexpress-sales.ics`, and commits only actual changes. A failed
fetch, an empty result, invalid dates, or excessive divergence fails the
workflow before a commit, so the published feed remains unchanged.

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
