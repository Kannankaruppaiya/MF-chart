// Resample daily NAV series → weekly or monthly (keeps last NAV of each bucket)

/** ISO week key like "2025-W34" from numeric timestamp (seconds) */
function isoWeekKey(timestamp) {
  const d = new Date(timestamp * 1000);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wk =
    1 +
    Math.round(
      ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function monthKey(timestamp) {
  const d = new Date(timestamp * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function resampleNavSeries(series, interval) {
  if (!series.length || interval === "1D") return series;
  const keyFn = interval === "1W" ? isoWeekKey : monthKey;
  const bucket = new Map();
  for (const p of series) {
    bucket.set(keyFn(p.time), p); // last point in each bucket wins
  }
  return Array.from(bucket.values()).sort((a, b) => a.time - b.time);
}

export const INTERVAL_SECONDS = {
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};


