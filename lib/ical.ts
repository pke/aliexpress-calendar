import type { SaleEvent } from "./events.js";

function escapeText(text: string): string {
  return text.replace(/[\\;,]/g, (c) => "\\" + c);
}

export function generateICal(events: SaleEvent[]): string {
  const now = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const vevents = events
    .map((event, i) => {
      const uid = `${event.startDate}-${i}@aliexpress-calendar`;
      return [
        "BEGIN:VEVENT",
        `DTSTART;VALUE=DATE:${event.startDate}`,
        `DTEND;VALUE=DATE:${event.endDate}`,
        `SUMMARY:${escapeText(event.name)}`,
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DESCRIPTION:AliExpress promo event`,
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
