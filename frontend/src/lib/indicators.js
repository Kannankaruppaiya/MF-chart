// Pure-math indicator helpers — standard (TradingView-compatible) formulas.
// Each function returns an array aligned 1:1 with the input series;
// warmup bars are null.

import { bucketKey } from "./navAggregation";

const TF_ORDER = { "1D": 0, "1W": 1, "1M": 2 };

/** True when `indicatorTF` is a strictly higher timeframe than `chartTF`. */
export function isHigherTimeframe(indicatorTF, chartTF) {
  return (TF_ORDER[indicatorTF] ?? -1) > (TF_ORDER[chartTF] ?? Infinity);
}

/**
 * Multi-timeframe calculation (TradingView `request.security`-style).
 *
 * Groups the chart bars into higher-timeframe (HTF) buckets, builds one HTF
 * bar per bucket (close = last chart value in the bucket), runs `computeFn`
 * over those HTF values with standard bar-based math, then projects the
 * results back onto the chart bars:
 *
 * - waitForClose = true  → each HTF value appears only on the chart bar where
 *   its HTF period completes (confirmed, non-repainting; sparse points that
 *   the line series visually connects). The still-forming final bucket
 *   returns nothing until it closes.
 * - waitForClose = false → values are gap-filled: bars inside an HTF period
 *   carry the last confirmed (previous period) value, the period's closing
 *   bar shows its own value, and the live edge shows the developing value of
 *   the still-forming period (non-repainting historically, repaints at the
 *   real-time edge — matches TradingView's documented behavior).
 *
 * @param {{time:number}[]} series    - chart bars (ascending)
 * @param {number[]}        values    - source value per chart bar
 * @param {string}          indicatorTF - "1D" | "1W" | "1M"
 * @param {boolean}         waitForClose
 * @param {(vals:number[]) => (number|null)[]} computeFn - indicator over HTF values
 * @returns {(number|null)[]} per chart bar
 */
export function computeOnTimeframe(series, values, indicatorTF, waitForClose, computeFn) {
  const n = series.length;
  const out = new Array(n).fill(null);
  if (!n) return out;

  const htfValues = [];
  const lastBarOfBucket = [];
  const bucketOfBar = new Array(n);
  let prevKey = null;
  for (let i = 0; i < n; i++) {
    const key = bucketKey(series[i].time, indicatorTF);
    if (key !== prevKey) {
      htfValues.push(values[i]);
      lastBarOfBucket.push(i);
      prevKey = key;
    } else {
      htfValues[htfValues.length - 1] = values[i]; // close = last value in bucket
      lastBarOfBucket[lastBarOfBucket.length - 1] = i;
    }
    bucketOfBar[i] = htfValues.length - 1;
  }

  const htfOut = computeFn(htfValues);

  if (waitForClose) {
    // Confirmed values only: bucket j's value lands on the bar that closes it.
    // The final bucket is still forming, so it stays empty until it completes.
    for (let j = 0; j < htfOut.length - 1; j++) {
      out[lastBarOfBucket[j]] = htfOut[j];
    }
  } else {
    for (let i = 0; i < n; i++) {
      const j = bucketOfBar[i];
      if (i === lastBarOfBucket[j]) {
        // Period close — its own confirmed value. For the final, still-forming
        // period this is the live developing value (real-time repaint edge).
        out[i] = htfOut[j];
      } else {
        // Inside a period — carry the last confirmed value forward.
        out[i] = j > 0 ? htfOut[j - 1] : null;
      }
    }
  }
  return out;
}

/**
 * SMA — Simple Moving Average.
 * Arithmetic mean of the last `length` values (sliding-window sum).
 * First value at index length-1.
 */
export function sma(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

/**
 * EMA — Exponential Moving Average.
 * Standard recurrence EMA = value*k + prevEMA*(1-k), k = 2/(length+1),
 * seeded with the SMA of the first `length` values (TradingView convention).
 */
export function ema(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0 || n < length) return out;
  const k = 2 / (length + 1);
  let seed = 0;
  for (let i = 0; i < length; i++) seed += values[i];
  let prev = seed / length;
  out[length - 1] = prev;
  for (let i = length; i < n; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

/**
 * ROC — Rate of Change (standard bar-based momentum).
 * ROC[i] = (price[i] − price[i−length]) / price[i−length] × 100
 * First value at index `length`. Zero/invalid reference bars stay null.
 */
export function roc(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0) return out;
  for (let i = length; i < n; i++) {
    const ref = values[i - length];
    if (ref == null || ref === 0) continue;
    const v = ((values[i] - ref) / ref) * 100;
    if (Number.isFinite(v)) out[i] = v;
  }
  return out;
}

/**
 * RSI — Relative Strength Index (Wilder's).
 * Seed avg gain/loss = simple average of the first `length` price changes,
 * then Wilder smoothing: avg = (prevAvg*(length−1) + current) / length.
 * RSI = 100 − 100/(1+RS), RS = avgGain/avgLoss. First value at index `length`.
 */
export function rsi(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0 || n <= length) return out;

  const rsiValue = (avgG, avgL) => {
    if (avgL === 0) return 100;
    return 100 - 100 / (1 + avgG / avgL);
  };

  let gain = 0, loss = 0;
  for (let i = 1; i <= length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / length;
  let avgL = loss / length;
  out[length] = rsiValue(avgG, avgL);

  for (let i = length + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (length - 1) + (d > 0 ? d : 0)) / length;
    avgL = (avgL * (length - 1) + (d < 0 ? -d : 0)) / length;
    out[i] = rsiValue(avgG, avgL);
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

/** Build value array from OHLC bars for the configured source price */
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
