// MFapi.in HTTP client (via our backend proxy)
import axios from "axios";

const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;

export const http = axios.create({ baseURL: API, timeout: 60000 });

/** Parse "DD-MM-YYYY" → "YYYY-MM-DD" */
export function parseDDMMYYYY(s) {
  const [dd, mm, yyyy] = s.split("-");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert MFapi data array (newest-first, string nav, DD-MM-YYYY) → ascending series of { time, value }  */
export function adaptNavHistoryToSeries(rawData) {
  if (!rawData || !rawData.length) return [];
  const reversed = [...rawData].reverse();
  const out = [];
  for (const row of reversed) {
    const v = parseFloat(row.nav);
    if (!isFinite(v)) continue;
    const dateStr = parseDDMMYYYY(row.date);
    const timestamp = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
    out.push({ time: timestamp, value: v });
  }
  return out;
}

/** Synthesize OHLC for candle chart: prev close = open, current = close, high/low = max/min */
export function buildOHLC(series) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const close = series[i].value;
    const open = i > 0 ? series[i - 1].value : close;
    out.push({
      time: series[i].time,
      open,
      close,
      high: Math.max(open, close),
      low: Math.min(open, close),
    });
  }
  return out;
}

export const mfapi = {
  search: (q, limit = 15) =>
    http.get(`/mf/search`, { params: { q, limit } }).then((r) => r.data),
  history: (code) => http.get(`/mf/${code}`).then((r) => r.data),
  latest: (code) => http.get(`/mf/${code}/latest`).then((r) => r.data),
};
