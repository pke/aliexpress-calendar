export interface SaleEvent {
  name: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD (exclusive for iCal)
}

// Scraped from en.ali-shop.net/sales on 2026-04-08
export const events: SaleEvent[] = [
  { name: "Choice Day + New Year Deals", startDate: "20260101", endDate: "20260108" },
  { name: "Winter Sale", startDate: "20260112", endDate: "20260119" },
  { name: "Brand Day", startDate: "20260119", endDate: "20260125" },
  { name: "Final Season Savings", startDate: "20260125", endDate: "20260130" },
  { name: "Choice Day + Love Delivers", startDate: "20260201", endDate: "20260209" },
  { name: "Valentine's Sale", startDate: "20260209", endDate: "20260224" },
  { name: "Choice Day + Seasonal Sale", startDate: "20260301", endDate: "20260308" },
  { name: "16th Anniversary Sale", startDate: "20260316", endDate: "20260326" },
  { name: "Choice Day + Outdoor Fun", startDate: "20260401", endDate: "20260408" },
  { name: "Spring Refresh", startDate: "20260413", endDate: "20260420" },
  { name: "Brand Day", startDate: "20260420", endDate: "20260425" },
  { name: "Mother's Day Savings", startDate: "20260426", endDate: "20260429" },
  { name: "Early Summer Saving", startDate: "20260506", endDate: "20260510" },
  { name: "Sunshine Savings", startDate: "20260512", endDate: "20260519" },
  { name: "Hot Summer Savings", startDate: "20260520", endDate: "20260524" },
  { name: "Choice Day", startDate: "20260601", endDate: "20260606" },
  { name: "Summer Sale", startDate: "20260616", endDate: "20260626" },
  { name: "Choice Day", startDate: "20260701", endDate: "20260706" },
  { name: "Getaway Deals", startDate: "20260714", endDate: "20260721" },
  { name: "Brand Savings", startDate: "20260721", endDate: "20260726" },
  { name: "Choice Day", startDate: "20260801", endDate: "20260806" },
  { name: "Chill Travel Savings", startDate: "20260806", endDate: "20260813" },
  { name: "Back to School", startDate: "20260818", endDate: "20260828" },
  { name: "Choice Day", startDate: "20260901", endDate: "20260906" },
  { name: "Fall Into Savings", startDate: "20260908", endDate: "20260912" },
  { name: "Fall Sale", startDate: "20260915", endDate: "20260922" },
  { name: "Brand Day", startDate: "20260922", endDate: "20260929" },
  { name: "Choice Day", startDate: "20261001", endDate: "20261008" },
  { name: "Holiday Season", startDate: "20261009", endDate: "20261014" },
  { name: "Brand Day", startDate: "20261014", endDate: "20261019" },
  { name: "Fall Fashion", startDate: "20261020", endDate: "20261026" },
  { name: "Mega Choice Day", startDate: "20261101", endDate: "20261108" },
  { name: "11.11: Global Shopping Festival", startDate: "20261111", endDate: "20261120" },
  { name: "Black Friday", startDate: "20261120", endDate: "20261204" },
  { name: "Cyber Monday", startDate: "20261201", endDate: "20261204" },
  { name: "Christmas Sale", startDate: "20261208", endDate: "20261215" },
  { name: "Snowfall Offers", startDate: "20261216", endDate: "20261222" },
  { name: "Brand Day", startDate: "20261222", endDate: "20261227" },
];
