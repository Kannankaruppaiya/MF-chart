// Pure-math indicator helpers. Returns arrays aligned with input series; null for warmup.

/**
 * Calendar-based as-of lookback.
 * Subtracts `length` calendar periods (months/weeks/days) from the bar at
 * `currentIndex`, then returns the index of the last bar whose timestamp is
 * at or before that computed reference date — a true "as-of" lookup.
 *
 * This guarantees the output array has the exact same length and timestamps
 * as the input series, so no forward-fill or independent time-scale is needed.
 */
function calendarLookback(timestamps, currentIndex, length, interval) {
  const ts = timestamps[currentIndex];
  const d = new Date(ts * 1000);
  let refTimestamp;
  if (interval === "1M") {
    const yr = d.getUTCFullYear();
    const mo = d.getUTCMonth() - length; // JS handles negative month rollover
    const day = d.getUTCDate();
    // Clamp day to last day of target month to prevent overflow (e.g. Mar 31 - 1 mo)
    const lastDay = new Date(Date.UTC(yr, mo + 1, 0)).getUTCDate();
    refTimestamp = Math.floor(Date.UTC(yr, mo, Math.min(day, lastDay)) / 1000);
  } else if (interval === "1W") {
    refTimestamp = ts - length * 7 * 86400;
  } else {
    // "1D" or anything else — calendar days
    refTimestamp = ts - length * 86400;
  }
  // Scan backwards: first bar satisfying <= refTimestamp is the as-of match
  for (let j = currentIndex - 1; j >= 0; j--) {
    if (timestamps[j] <= refTimestamp) return j;
  }
  return -1;
}

export function sma(values, length) {
  const out = new Array(values.length).fill(null);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  if (length <= 0 || values.length < length) return out;
  const k = 2 / (length + 1);
  // seed with SMA of first `length` values
  let seed = 0;
  for (let i = 0; i < length; i++) seed += values[i];
  seed /= length;
  out[length - 1] = seed;
  let prev = seed;
  for (let i = length; i < values.length; i++) {
    const v = values[i] * k + prev * (1 - k);
    out[i] = v;
    prev = v;
  }
  return out;
}

export function roc(values, length, timestamps, chartInterval, indicatorInterval) {
  const out = new Array(values.length).fill(null);
  // Use calendar lookback only when a timeframe override is active
  const useCalendar =
    timestamps && indicatorInterval && chartInterval && indicatorInterval !== chartInterval;

  if (useCalendar) {
    for (let i = 0; i < values.length; i++) {
      const j = calendarLookback(timestamps, i, length, indicatorInterval);
      if (j !== -1 && values[j] != null && values[j] !== 0) {
        out[i] = ((values[i] - values[j]) / values[j]) * 100;
      }
    }
  } else {
    // Standard array-row lookback (no override) — unchanged
    for (let i = length; i < values.length; i++) {
      const ref = values[i - length];
      if (ref) out[i] = ((values[i] - ref) / ref) * 100;
    }
  }
  return out;
}

/** Wilder's RSI */
export function rsi(values, length) {
  const out = new Array(values.length).fill(null);
  if (values.length <= length) return out;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / length;
  let avgL = loss / length;
  out[length] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = length + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (length - 1) + g) / length;
    avgL = (avgL * (length - 1) + l) / length;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

/** Apply integer offset (positive = shift right/lag, negative = shift left/lead) */
export function applyOffset(series, offset) {
  if (!offset) return series;
  const result = [];
  for (let i = 0; i < series.length; i++) {
    const targetIdx = i + offset;
    if (targetIdx >= 0 && targetIdx < series.length) {
      const pt = { time: series[targetIdx].time };
      if (series[i].value !== undefined) {
        pt.value = series[i].value;
      }
      result.push(pt);
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

/** Build value array from series (input source already resolved to "value") */
export function pickSource(ohlc, source = "close") {
  const map = {
    close: (b) => b.close,
    open: (b) => b.open,
    high: (b) => b.high,
    low: (b) => b.low,
    hl2: (b) => (b.high + b.low) / 2,
    hlc3: (b) => (b.high + b.low + b.close) / 3,
    ohlc4: (b) => (b.open + b.high + b.low + b.close) / 4,
  };
  const fn = map[source] || map.close;
  return ohlc.map(fn);
}
