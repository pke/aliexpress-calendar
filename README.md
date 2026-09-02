# AliExpress Sales Calendar

[![Update and deploy](https://github.com/pke/aliexpress-calendar/actions/workflows/update-calendar.yml/badge.svg?branch=master)](https://github.com/pke/aliexpress-calendar/actions/workflows/update-calendar.yml)
[![Subscribe](https://img.shields.io/badge/Subscribe-calendar-FF4747?logo=googlecalendar&logoColor=white)](https://aesales.kalenderabos.de/aliexpress-sales.ics)
[![License: MIT](https://img.shields.io/badge/License-MIT-2F80ED.svg)](LICENSE)

Subscribable iCal feed of AliExpress promo events, hosted on GitHub Pages.

## Subscribe

- **URL:** `https://aesales.kalenderabos.de/aliexpress-sales.ics`
- **Google Calendar:** [Add to Google Calendar](https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Faesales.kalenderabos.de%2Faliexpress-sales.ics)
- **Apple Calendar / Outlook:** Use `webcal://aesales.kalenderabos.de/aliexpress-sales.ics`

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

The same workflow deploys the validated `public/` directory to GitHub Pages after updates and on every push to `master`.
