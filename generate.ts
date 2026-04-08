import { events } from "./lib/events.js";
import { generateICal } from "./lib/ical.js";
import { writeFileSync } from "fs";

const ical = generateICal(events);
writeFileSync("public/aliexpress-sales.ics", ical);
console.log(`Generated ${events.length} events → public/aliexpress-sales.ics`);
