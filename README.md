# AliExpress Sales Calendar

Subscribable iCal feed of AliExpress promo events, hosted on Vercel.

## Subscribe

- **URL:** `https://aliexpress-calendar.vercel.app/aliexpress-sales.ics`
- **Google Calendar:** [Add to Google Calendar](https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Faliexpress-calendar.vercel.app%2Faliexpress-sales.ics)
- **Apple Calendar / Outlook:** Use `webcal://aliexpress-calendar.vercel.app/aliexpress-sales.ics`

## Update Events

Edit `lib/events.ts`, then regenerate:

```bash
npm run generate
```

This rebuilds `public/aliexpress-sales.ics` from the event data. Deploy with `vercel deploy --prod`.
