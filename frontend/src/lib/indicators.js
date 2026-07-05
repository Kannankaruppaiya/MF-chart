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

// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL SMA / EMA / ROC / RSI — commented out for rollback safety only.
// Superseded below by versions ported from technicalindicators (MIT, Anand
// Aravindan) per task spec. See vendor/technicalindicators-LICENSE.
// ─────────────────────────────────────────────────────────────────────────────
// export function sma(values, length) {
//   const out = new Array(values.length).fill(null);
//   if (length <= 0) return out;
//   let sum = 0;
//   for (let i = 0; i < values.length; i++) {
//     sum += values[i];
//     if (i >= length) sum -= values[i - length];
//     if (i >= length - 1) out[i] = sum / length;
//   }
//   return out;
// }
//
// export function ema(values, length) {
//   const out = new Array(values.length).fill(null);
//   if (length <= 0 || values.length < length) return out;
//   const k = 2 / (length + 1);
//   let seed = 0;
//   for (let i = 0; i < length; i++) seed += values[i];
//   seed /= length;
//   out[length - 1] = seed;
//   let prev = seed;
//   for (let i = length; i < values.length; i++) {
//     const v = values[i] * k + prev * (1 - k);
//     out[i] = v;
//     prev = v;
//   }
//   return out;
// }
//
// export function roc(values, length, timestamps, chartInterval, indicatorInterval) {
//   const out = new Array(values.length).fill(null);
//   const useCalendar =
//     timestamps && indicatorInterval && chartInterval && indicatorInterval !== chartInterval;
//   if (useCalendar) {
//     for (let i = 0; i < values.length; i++) {
//       const j = calendarLookback(timestamps, i, length, indicatorInterval);
//       if (j !== -1 && values[j] != null && values[j] !== 0) {
//         out[i] = ((values[i] - values[j]) / values[j]) * 100;
//       }
//     }
//   } else {
//     for (let i = length; i < values.length; i++) {
//       const ref = values[i - length];
//       if (ref) {
//         const v = ((values[i] - ref) / ref) * 100;
//         if (!isNaN(v)) out[i] = v;
//       }
//     }
//   }
//   return out;
// }
//
// function _rsiValue(avgG, avgL) {
//   if (avgL === 0) return 100;
//   if (avgG === 0) return 0;
//   const RS = avgG / avgL;
//   return 100 - 100 / (1 + (isNaN(RS) ? 0 : RS));
// }
//
// export function rsi(values, length) {
//   const out = new Array(values.length).fill(null);
//   if (values.length <= length) return out;
//   let gain = 0, loss = 0;
//   for (let i = 1; i <= length; i++) {
//     const d = values[i] - values[i - 1];
//     if (d >= 0) gain += d;
//     else loss -= d;
//   }
//   let avgG = gain / length;
//   let avgL = loss / length;
//   out[length] = _rsiValue(avgG, avgL);
//   for (let i = length + 1; i < values.length; i++) {
//     const d = values[i] - values[i - 1];
//     const g = d > 0 ? d : 0;
//     const l = d < 0 ? -d : 0;
//     avgG = (avgG * (length - 1) + g) / length;
//     avgL = (avgL * (length - 1) + l) / length;
//     out[i] = _rsiValue(avgG, avgL);
//   }
//   return out;
// }

/**
 * SMA — ported from technicalindicators SMA.ts (sliding-window sum, same
 * seed/step logic as the source's LinkedList generator, flattened to a loop).
 * Formatting fix: rounded to 4dp for consistency with our other price-level
 * overlays (WMA/VWAP/BBANDS/MACD all format this way); the source leaves it
 * unrounded by default (no-op `format()` unless `setConfig('precision', n)`
 * is called, which this app never does).
 */
export function sma(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = parseFloat((sum / length).toFixed(4));
  }
  return out;
}

/**
 * EMA — ported from technicalindicators EMA.ts. Seeds the first EMA value
 * from the SMA of the first `length` values (source's `sma.nextValue`), then
 * walks forward with the standard exponential recurrence. Rounded to 4dp,
 * same formatting-consistency fix as `sma` above.
 */
export function ema(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0 || n < length) return out;
  const k = 2 / (length + 1);
  let seed = 0;
  for (let i = 0; i < length; i++) seed += values[i];
  seed /= length;
  out[length - 1] = parseFloat(seed.toFixed(4));
  let prev = seed;
  for (let i = length; i < n; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = parseFloat(prev.toFixed(4));
  }
  return out;
}

/**
 * ROC — core percentage-change loop ported from technicalindicators ROC.ts
 * (`(tick - pastPeriods.lastShift) / pastPeriods.lastShift * 100`).
 * Bug fix: the source only guards with `isNaN(result.value)`, which does NOT
 * catch a zero reference value (division by 0 → Infinity, not NaN). We guard
 * the zero-reference case explicitly so the output is null instead of ±Infinity.
 * Formatting fix: rounded to 2dp for consistency with our other percentage
 * oscillators (RSI/CCI/Stochastic/MFI/ADX all format this way) — the source
 * leaves ROC unrounded by default (its no-op `format()` only rounds when a
 * global `setConfig('precision', n)` call is made, which this app never does).
 * The calendar-lookback wrapper (timeframe override) is app-specific and
 * preserved unchanged around this core loop.
 */
export function roc(values, length, timestamps, chartInterval, indicatorInterval) {
  const n = values.length;
  const out = new Array(n).fill(null);
  const useCalendar =
    timestamps && indicatorInterval && chartInterval && indicatorInterval !== chartInterval;

  if (useCalendar) {
    for (let i = 0; i < n; i++) {
      const j = calendarLookback(timestamps, i, length, indicatorInterval);
      if (j !== -1 && values[j] != null && values[j] !== 0) {
        out[i] = parseFloat((((values[i] - values[j]) / values[j]) * 100).toFixed(2));
      }
    }
  } else {
    for (let i = length; i < n; i++) {
      const ref = values[i - length];
      if (ref === 0 || ref == null) continue; // bug fix: avoid Infinity from zero reference
      const v = ((values[i] - ref) / ref) * 100;
      if (!isNaN(v)) out[i] = parseFloat(v.toFixed(2));
    }
  }
  return out;
}

/**
 * Internal: RSI value from Wilder-smoothed avg gain/loss, ported from the
 * branching in technicalindicators RSI.ts (avgLoss===0 → 100, avgGain===0 → 0,
 * isNaN(RS) guard for the degenerate 0/0 case). Rounded to 2dp — the source
 * hardcodes `.toFixed(2)` here (unlike most of its other indicators, which
 * rely on a no-op-by-default `format()`), so we match that explicitly.
 */
function _rsiValue(avgG, avgL) {
  if (avgL === 0) return 100;
  if (avgG === 0) return 0;
  const RS = avgG / avgL;
  return parseFloat((100 - 100 / (1 + (isNaN(RS) ? 0 : RS))).toFixed(2));
}

/**
 * RSI (Wilder's) — ported from technicalindicators RSI.ts + AverageGain.ts /
 * AverageLoss.ts: seed avg gain/loss as a plain average of the first `length`
 * diffs, then Wilder-smooth `(avg*(length-1)+cur)/length` thereafter.
 */
export function rsi(values, length) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (n <= length) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= length; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgG = gain / length;
  let avgL = loss / length;
  out[length] = _rsiValue(avgG, avgL);
  for (let i = length + 1; i < n; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgG = (avgG * (length - 1) + g) / length;
    avgL = (avgL * (length - 1) + l) / length;
    out[i] = _rsiValue(avgG, avgL);
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

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers (not exported)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True Range for each bar starting at index 1 (needs previous close).
 * Returns array of length n, index 0 = null.
 */
function _trueRange(highs, lows, closes) {
  const n = highs.length;
  const tr = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    const hl = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hpc, lpc);
  }
  return tr;
}

/**
 * Wilder's Smoothing of a raw *sum* (RMA applied to TR/+DM/-DM inside ADX).
 * Ported from technicalindicators WilderSmoothing.ts, seed = plain sum of the
 * first `period` values (not an average) — by design, this is only ever
 * consumed as a ratio (e.g. +DM-sum / TR-sum for PDI) where the shared scale
 * factor cancels out. Do NOT use this where the result is read directly —
 * use `_wema` below for that (matches the source's own ATR.ts / emaDX, which
 * use WEMA rather than WilderSmoothing for exactly this reason).
 */
function _wilderSmooth(values, period) {
  const n = values.length;
  const out = new Array(n).fill(null);
  let sum = 0;
  let count = 0;
  let seeded = false;
  let prev = 0;

  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (!seeded) {
      sum += v;
      count++;
      if (count === period) {
        prev = sum;
        out[i] = prev;
        seeded = true;
      }
    } else {
      prev = prev - prev / period + v;
      out[i] = prev;
    }
  }
  return out;
}

/**
 * Wilder's moving AVERAGE (WEMA) — ported from technicalindicators WEMA.ts.
 * Seed = plain SMA average of the first `period` values, then
 * `prev += (v - prev) / period`. Bug fix: our first port of ATR/ADX reused
 * `_wilderSmooth` (sum-seeded) for these two spots, which inflates the
 * result by a factor of `period` since there's no ratio to cancel the scale
 * — e.g. ADX was reading up to ~1395 instead of being bounded 0–100.
 * technicalindicators itself uses WEMA (not WilderSmoothing) for standalone
 * ATR and for the final DX→ADX smoothing step; we do the same here.
 */
function _wema(values, period) {
  const n = values.length;
  const out = new Array(n).fill(null);
  let sum = 0;
  let count = 0;
  let seeded = false;
  let prev = 0;

  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || v === undefined) continue;
    if (!seeded) {
      sum += v;
      count++;
      if (count === period) {
        prev = sum / period; // seed = average, unlike _wilderSmooth's raw sum
        out[i] = prev;
        seeded = true;
      }
    } else {
      prev = prev + (v - prev) / period;
      out[i] = prev;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW INDICATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MACD — Moving Average Convergence/Divergence
 * Returns array of {macd, signal, histogram} | null per bar.
 * Uses EMA throughout (standard MACD, not SMA variant).
 *
 * @param {number[]} values  - close prices
 * @param {number}   fastLen - fast EMA period (default 12)
 * @param {number}   slowLen - slow EMA period (default 26)
 * @param {number}   sigLen  - signal EMA period (default 9)
 */
export function macd(values, fastLen = 12, slowLen = 26, sigLen = 9) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (n < slowLen) return out;

  const fastK = 2 / (fastLen + 1);
  const slowK = 2 / (slowLen + 1);
  const sigK  = 2 / (sigLen + 1);

  // Seed fast and slow EMAs from their respective SMA of the first N values
  let fastSeed = 0, slowSeed = 0;
  for (let i = 0; i < slowLen; i++) {
    slowSeed += values[i];
    if (i < fastLen) fastSeed += values[i];
  }
  // fast EMA seeds at index fastLen-1; slow EMA seeds at index slowLen-1
  // To keep alignment, we run both from slowLen-1 onward using the slow seed window
  fastSeed = 0;
  for (let i = 0; i < fastLen; i++) fastSeed += values[i];
  fastSeed /= fastLen;
  slowSeed /= slowLen;

  let prevFast = fastSeed;
  let prevSlow = slowSeed;

  // Walk fast EMA from fastLen-1 up to slowLen-1 to align at the slow seed point
  for (let i = fastLen; i < slowLen; i++) {
    prevFast = values[i] * fastK + prevFast * (1 - fastK);
  }

  // Now both are at index slowLen-1; compute MACD line from here
  const macdLine = new Array(n).fill(null);
  macdLine[slowLen - 1] = prevFast - prevSlow;

  for (let i = slowLen; i < n; i++) {
    prevFast = values[i] * fastK + prevFast * (1 - fastK);
    prevSlow = values[i] * slowK + prevSlow * (1 - slowK);
    macdLine[i] = prevFast - prevSlow;
  }

  // Signal line = EMA of MACD line (seed from first sigLen MACD values)
  let sigSeed = 0;
  let sigCount = 0;
  let sigStart = -1;
  for (let i = 0; i < n; i++) {
    if (macdLine[i] === null) continue;
    sigSeed += macdLine[i];
    sigCount++;
    if (sigCount === sigLen) { sigStart = i; break; }
  }

  if (sigStart === -1) return out; // not enough data for signal

  sigSeed /= sigLen;
  let prevSig = sigSeed;
  out[sigStart] = {
    macd: parseFloat(macdLine[sigStart].toFixed(4)),
    signal: parseFloat(sigSeed.toFixed(4)),
    histogram: parseFloat((macdLine[sigStart] - sigSeed).toFixed(4)),
  };

  for (let i = sigStart + 1; i < n; i++) {
    if (macdLine[i] === null) continue;
    prevSig = macdLine[i] * sigK + prevSig * (1 - sigK);
    out[i] = {
      macd: parseFloat(macdLine[i].toFixed(4)),
      signal: parseFloat(prevSig.toFixed(4)),
      histogram: parseFloat((macdLine[i] - prevSig).toFixed(4)),
    };
  }

  return out;
}

/**
 * Bollinger Bands
 * Returns array of {upper, middle, lower, pb} | null per bar.
 * Bug fix: zero stdDev guard — when all prices are identical, upper=middle=lower, pb=0.
 *
 * @param {number[]} values    - price series (typically close)
 * @param {number}   length    - SMA period (default 20)
 * @param {number}   stdDevMult - standard deviation multiplier (default 2)
 */
export function bollingerBands(values, length = 20, stdDevMult = 2) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0 || n < length) return out;

  for (let i = length - 1; i < n; i++) {
    // Compute SMA over window
    let sum = 0;
    for (let j = i - length + 1; j <= i; j++) sum += values[j];
    const middle = sum / length;

    // Compute population stdDev over the same window
    let variance = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const diff = values[j] - middle;
      variance += diff * diff;
    }
    const stdDev = Math.sqrt(variance / length);

    // Bug fix: guard against zero stdDev (flat price period → Infinity)
    if (stdDev === 0) {
      out[i] = {
        upper: parseFloat(middle.toFixed(4)),
        middle: parseFloat(middle.toFixed(4)),
        lower: parseFloat(middle.toFixed(4)),
        pb: 0,
      };
      continue;
    }

    const upper  = middle + stdDevMult * stdDev;
    const lower  = middle - stdDevMult * stdDev;
    const bandWidth = upper - lower;
    const pb = bandWidth !== 0 ? (values[i] - lower) / bandWidth : 0;

    out[i] = {
      upper:  parseFloat(upper.toFixed(4)),
      middle: parseFloat(middle.toFixed(4)),
      lower:  parseFloat(lower.toFixed(4)),
      pb:     parseFloat(pb.toFixed(4)),
    };
  }
  return out;
}

/**
 * ATR — Average True Range (Wilder's smoothing = RMA)
 * Returns array of number | null per bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   length  - period (default 14)
 */
export function atr(highs, lows, closes, length = 14) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < length + 1) return out;

  const tr = _trueRange(highs, lows, closes); // index 0 = null

  // Wilder MOVING AVERAGE on the TR array (matches source ATR.ts's use of WEMA,
  // not the sum-seeded WilderSmoothing — see _wema comment above).
  const smoothed = _wema(tr, length);

  for (let i = 0; i < n; i++) {
    if (smoothed[i] !== null) out[i] = parseFloat(smoothed[i].toFixed(4));
  }
  return out;
}

/**
 * Stochastic Oscillator — array-mode only (no nextValue streaming, which has type bugs).
 * %K = (Close - LowestLow) / (HighestHigh - LowestLow) * 100
 * %D = SMA of %K over dLen bars
 * Returns array of {k, d} | null per bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   kLen    - %K lookback period (default 14)
 * @param {number}   dLen    - %D smoothing period (default 3)
 */
export function stochastic(highs, lows, closes, kLen = 14, dLen = 3) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < kLen) return out;

  const kArr = new Array(n).fill(null);

  for (let i = kLen - 1; i < n; i++) {
    let lowestLow  = lows[i];
    let highestHigh = highs[i];
    for (let j = i - kLen + 1; j < i; j++) {
      if (lows[j]  < lowestLow)   lowestLow  = lows[j];
      if (highs[j] > highestHigh) highestHigh = highs[j];
    }
    const range = highestHigh - lowestLow;
    // Guard: when High==Low==Close for entire period → range=0 → k=0 (not NaN)
    kArr[i] = range === 0 ? 0 : ((closes[i] - lowestLow) / range) * 100;
  }

  // %D = sliding-window SMA of %K (computed only over non-null kArr values)
  for (let i = 0; i < n; i++) {
    if (kArr[i] === null) continue;
    // Check if we have dLen consecutive non-null %K values ending at i
    if (i < kLen - 1 + dLen - 1) {
      out[i] = { k: parseFloat(kArr[i].toFixed(2)), d: null };
    } else {
      let dSum = 0;
      let valid = true;
      for (let j = i - dLen + 1; j <= i; j++) {
        if (kArr[j] === null) { valid = false; break; }
        dSum += kArr[j];
      }
      out[i] = {
        k: parseFloat(kArr[i].toFixed(2)),
        d: valid ? parseFloat((dSum / dLen).toFixed(2)) : null,
      };
    }
  }
  return out;
}


/**
 * ADX — Average Directional Index
 * Returns array of {adx, pdi, mdi} | null per bar.
 * Note: The stray `ADXOutput` token in the source (line 61) is NOT ported.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   length  - period (default 14)
 */
export function adx(highs, lows, closes, length = 14) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < length * 2) return out;

  // Compute raw TR, +DM, -DM for each bar (starting at index 1)
  const tr   = new Array(n).fill(null);
  const pdm  = new Array(n).fill(null);
  const mdm  = new Array(n).fill(null);

  for (let i = 1; i < n; i++) {
    const hl  = highs[i] - lows[i];
    const hpc = Math.abs(highs[i] - closes[i - 1]);
    const lpc = Math.abs(lows[i]  - closes[i - 1]);
    tr[i] = Math.max(hl, hpc, lpc);

    const upMove   = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    pdm[i] = (upMove   > downMove && upMove   > 0) ? upMove   : 0;
    mdm[i] = (downMove > upMove   && downMove > 0) ? downMove : 0;
  }

  // Wilder smooth TR, +DM, -DM
  const atr_arr  = _wilderSmooth(tr,  length);
  const apdm_arr = _wilderSmooth(pdm, length);
  const amdm_arr = _wilderSmooth(mdm, length);

  // Compute DX from smoothed values, then Wilder-smooth DX to get ADX
  const dx = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (atr_arr[i] === null || atr_arr[i] === 0) continue;
    const pdi = (apdm_arr[i] / atr_arr[i]) * 100;
    const mdi = (amdm_arr[i] / atr_arr[i]) * 100;
    const diDiff = Math.abs(pdi - mdi);
    const diSum  = pdi + mdi;
    dx[i] = diSum === 0 ? 0 : (diDiff / diSum) * 100;
  }

  // DX → ADX uses WEMA in the source (ADX.ts's `emaDX`), not WilderSmoothing —
  // bug fix: using _wilderSmooth here (as our first port did) inflates ADX by
  // a factor of `length` since there's no ratio here to cancel the raw-sum seed.
  const adxSmoothed = _wema(dx, length);

  // Build output — need both adxSmoothed and atr_arr non-null
  for (let i = 0; i < n; i++) {
    if (adxSmoothed[i] === null || atr_arr[i] === null || atr_arr[i] === 0) continue;
    const pdi = parseFloat(((apdm_arr[i] / atr_arr[i]) * 100).toFixed(2));
    const mdi = parseFloat(((amdm_arr[i] / atr_arr[i]) * 100).toFixed(2));
    out[i] = {
      adx: parseFloat(adxSmoothed[i].toFixed(2)),
      pdi,
      mdi,
    };
  }
  return out;
}

/**
 * Williams %R
 * %R = (HighestHigh - Close) / (HighestHigh - LowestLow) * -100
 * Range: -100 to 0 (overbought near 0, oversold near -100)
 * Returns array of number | null per bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   length  - lookback period (default 14)
 */
export function williamsR(highs, lows, closes, length = 14) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < length) return out;

  for (let i = length - 1; i < n; i++) {
    let lowestLow   = lows[i];
    let highestHigh = highs[i];
    for (let j = i - length + 1; j < i; j++) {
      if (lows[j]  < lowestLow)   lowestLow  = lows[j];
      if (highs[j] > highestHigh) highestHigh = highs[j];
    }
    const range = highestHigh - lowestLow;
    out[i] = range === 0 ? 0 : parseFloat(((highestHigh - closes[i]) / range * -100).toFixed(2));
  }
  return out;
}

/**
 * OBV — On Balance Volume
 * Cumulative: add volume if close > prev close, subtract if close < prev close, unchanged if equal.
 * Starts at 0 from bar 0. No warmup period.
 * Returns array of number per bar (never null).
 *
 * @param {number[]} closes
 * @param {number[]} volumes
 */
export function obv(closes, volumes) {
  const n = closes.length;
  const out = new Array(n).fill(0);
  if (n === 0) return out;
  // First bar always gets OBV = 0 (no prior close to compare)
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) {
      out[i] = out[i - 1] + volumes[i];
    } else if (closes[i] < closes[i - 1]) {
      out[i] = out[i - 1] - volumes[i];
    } else {
      out[i] = out[i - 1];
    }
  }
  return out;
}

/**
 * VWAP — Volume Weighted Average Price (cumulative from first bar)
 * typicalPrice = (high + low + close) / 3
 * VWAP = ΣTP*Volume / ΣVolume
 * Bug fix: output rounded to 4dp (unlike the source which pushes raw float).
 * Returns array of number per bar (never null, starts from bar 0).
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number[]} volumes
 */
export function vwap(highs, lows, closes, volumes) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n === 0) return out;

  let cumTP = 0;
  let cumVol = 0;

  for (let i = 0; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTP  += tp * volumes[i];
    cumVol += volumes[i];
    out[i] = cumVol === 0 ? null : parseFloat((cumTP / cumVol).toFixed(4));
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW INDICATORS — ported from technicalindicators (MIT) by Anand Aravindan
// Vendored at frontend/src/lib/vendor/technicalindicators-LICENSE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WMA — Weighted Moving Average
 * Linearly weighted: most recent bar has weight=period, oldest has weight=1.
 * Denominator = period*(period+1)/2
 *
 * @param {number[]} values
 * @param {number}   length
 */
export function wma(values, length = 20) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (length <= 0 || n < length) return out;
  const denom = length * (length + 1) / 2;
  for (let i = length - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += values[i - length + 1 + j] * (j + 1);
    }
    out[i] = parseFloat((sum / denom).toFixed(4));
  }
  return out;
}

/**
 * CCI — Commodity Channel Index
 * Formula: (TP − SMA(TP)) / (0.015 × MeanDeviation)
 * Bug fixes:
 *   1. Zero-mean-deviation guard: returns 0 instead of Infinity/NaN.
 *   2. Output rounded to 2dp (original had no formatting).
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   length
 */
export function cci(highs, lows, closes, length = 20) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < length) return out;
  const CONSTANT = 0.015;
  for (let i = length - 1; i < n; i++) {
    // Typical prices for the window
    let tpSum = 0;
    const tpArr = [];
    for (let j = i - length + 1; j <= i; j++) {
      const tp = (highs[j] + lows[j] + closes[j]) / 3;
      tpArr.push(tp);
      tpSum += tp;
    }
    const smaTP = tpSum / length;
    // Mean absolute deviation
    let madSum = 0;
    for (const tp of tpArr) madSum += Math.abs(tp - smaTP);
    const mad = madSum / length;
    // Bug fix: guard zero MAD
    if (mad === 0) { out[i] = 0; continue; }
    const tp_i = (highs[i] + lows[i] + closes[i]) / 3;
    out[i] = parseFloat(((tp_i - smaTP) / (CONSTANT * mad)).toFixed(2));
  }
  return out;
}

/**
 * AO — Awesome Oscillator
 * = SMA(midprice, fastPeriod) − SMA(midprice, slowPeriod)
 * Default fast=5, slow=34 (Bill Williams standard).
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number}   fastPeriod
 * @param {number}   slowPeriod
 */
export function awesomeOscillator(highs, lows, fastPeriod = 5, slowPeriod = 34) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < slowPeriod) return out;
  const mids = highs.map((h, i) => (h + lows[i]) / 2);
  const fastSMA = sma(mids, fastPeriod);
  const slowSMA = sma(mids, slowPeriod);
  for (let i = 0; i < n; i++) {
    if (fastSMA[i] !== null && slowSMA[i] !== null) {
      out[i] = parseFloat((fastSMA[i] - slowSMA[i]).toFixed(4));
    }
  }
  return out;
}

/**
 * MFI — Money Flow Index (volume-weighted RSI-style oscillator).
 * Falls back to volume=1 when no real volume is provided.
 * Bug fix: divides by zero when all bars are positive/negative → guard added.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number[]} volumes
 * @param {number}   length
 */
export function mfi(highs, lows, closes, volumes, length = 14) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < length + 1) return out;
  // Compute typical prices
  const tp = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
  for (let i = length; i < n; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const rawMF = tp[j] * (volumes[j] ?? 1);
      if (tp[j] > tp[j - 1]) posFlow += rawMF;
      else                    negFlow += rawMF;
    }
    // Guard: negFlow=0 → MFI=100; posFlow=0 → MFI=0
    if (negFlow === 0) { out[i] = 100; continue; }
    if (posFlow === 0) { out[i] = 0;   continue; }
    const mfr = posFlow / negFlow;
    out[i] = parseFloat((100 - 100 / (1 + mfr)).toFixed(2));
  }
  return out;
}

/**
 * ADL — Accumulation / Distribution Line
 * ADL += ((Close−Low) − (High−Close)) / (High−Low) × Volume
 * NaN guard: when High===Low, Money Flow Multiplier = 1 (ADL source behaviour).
 * Falls back to volume=1 when no real volume.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number[]} volumes
 */
export function adl(highs, lows, closes, volumes) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  let cumADL = 0;
  for (let i = 0; i < n; i++) {
    const range = highs[i] - lows[i];
    const mfm = range === 0 ? 1
      : ((closes[i] - lows[i]) - (highs[i] - closes[i])) / range;
    cumADL += mfm * (volumes[i] ?? 1);
    out[i] = Math.round(cumADL);
  }
  return out;
}

/**
 * ForceIndex — Elder's Force Index
 * = EMA((Close − PrevClose) × Volume, period)
 * Raw ForceIndex starts at bar 1; output[0] is null.
 *
 * @param {number[]} closes
 * @param {number[]} volumes
 * @param {number}   length
 */
export function forceIndex(closes, volumes, length = 13) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n < 2) return out;
  // Compute raw force index per bar
  const raw = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    raw[i] = (closes[i] - closes[i - 1]) * (volumes[i] ?? 1);
  }
  // EMA of raw (seed from first non-null)
  const k = 2 / (length + 1);
  let prevEMA = null;
  for (let i = 1; i < n; i++) {
    if (raw[i] === null) continue;
    if (prevEMA === null) {
      prevEMA = raw[i];
    } else {
      prevEMA = raw[i] * k + prevEMA * (1 - k);
    }
    out[i] = parseFloat(prevEMA.toFixed(4));
  }
  return out;
}

/**
 * StochasticRSI — Stochastic of RSI
 * Array-mode only (streaming nextValue() has type-mismatch bugs — not ported).
 * Steps:
 *   1. Compute RSI(rsiLen)
 *   2. Compute Stochastic(rsiValues, stochLen) → k
 *   3. SMA(%K, kLen) → signal k-smooth; SMA(%K-smooth, dLen) → d
 *
 * Returns array of {k, d} | null per bar.
 *
 * @param {number[]} values       - price array (typically close)
 * @param {number}   rsiLen       - RSI period (default 14)
 * @param {number}   stochLen     - Stoch lookback (default 14)
 * @param {number}   kLen         - %K smoothing SMA period (default 3)
 * @param {number}   dLen         - %D SMA of %K period (default 3)
 */
export function stochasticRSI(values, rsiLen = 14, stochLen = 14, kLen = 3, dLen = 3) {
  const n = values.length;
  const out = new Array(n).fill(null);

  // Step 1: RSI array
  const rsiArr = rsi(values, rsiLen);

  // Step 2: Stochastic of RSI
  const stochK = new Array(n).fill(null);
  for (let i = stochLen - 1; i < n; i++) {
    let minRSI = Infinity, maxRSI = -Infinity;
    let valid = true;
    for (let j = i - stochLen + 1; j <= i; j++) {
      if (rsiArr[j] === null) { valid = false; break; }
      if (rsiArr[j] < minRSI) minRSI = rsiArr[j];
      if (rsiArr[j] > maxRSI) maxRSI = rsiArr[j];
    }
    if (!valid || rsiArr[i] === null) continue;
    const range = maxRSI - minRSI;
    stochK[i] = range === 0 ? 0 : ((rsiArr[i] - minRSI) / range) * 100;
  }

  // Step 3: SMA(%K, kLen) → smoothed K; SMA(smoothK, dLen) → D
  const smoothK = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (stochK[i] === null) continue;
    // Sliding SMA over kLen consecutive non-null stochK
    if (i < stochLen - 1 + kLen - 1) continue;
    let sum = 0; let valid = true;
    for (let j = i - kLen + 1; j <= i; j++) {
      if (stochK[j] === null) { valid = false; break; }
      sum += stochK[j];
    }
    if (valid) smoothK[i] = sum / kLen;
  }

  for (let i = 0; i < n; i++) {
    if (smoothK[i] === null) continue;
    if (i < stochLen - 1 + kLen - 1 + dLen - 1) {
      out[i] = { k: parseFloat(smoothK[i].toFixed(2)), d: null };
      continue;
    }
    let sum = 0; let valid = true;
    for (let j = i - dLen + 1; j <= i; j++) {
      if (smoothK[j] === null) { valid = false; break; }
      sum += smoothK[j];
    }
    out[i] = {
      k: parseFloat(smoothK[i].toFixed(2)),
      d: valid ? parseFloat((sum / dLen).toFixed(2)) : null,
    };
  }
  return out;
}

/**
 * TRIX — Triple EMA Rate of Change (1-period % change of triple-smoothed EMA)
 * = 1-bar % change of EMA(EMA(EMA(values, n), n), n)
 * Warmup = 3*(n−1) bars, plus 1 more for the ROC step.
 *
 * @param {number[]} values
 * @param {number}   length  - EMA period (default 18)
 */
export function trix(values, length = 18) {
  const n = values.length;
  const out = new Array(n).fill(null);
  if (n < length) return out;
  const k = 2 / (length + 1);

  // EMA pass 1
  let e1 = values[0];
  const ema1 = new Array(n).fill(null);
  ema1[0] = e1;
  for (let i = 1; i < n; i++) {
    e1 = values[i] * k + e1 * (1 - k);
    ema1[i] = e1;
  }

  // EMA pass 2
  let e2 = ema1[0];
  const ema2 = new Array(n).fill(null);
  ema2[0] = e2;
  for (let i = 1; i < n; i++) {
    e2 = ema1[i] * k + e2 * (1 - k);
    ema2[i] = e2;
  }

  // EMA pass 3
  let e3 = ema2[0];
  const ema3 = new Array(n).fill(null);
  ema3[0] = e3;
  for (let i = 1; i < n; i++) {
    e3 = ema2[i] * k + e3 * (1 - k);
    ema3[i] = e3;
  }

  // 1-bar % ROC of ema3 (meaningful after 3*(length-1) warmup bars)
  const warmup = 3 * (length - 1) + 1;
  for (let i = warmup; i < n; i++) {
    if (ema3[i - 1] === 0) { out[i] = 0; continue; }
    out[i] = parseFloat(((ema3[i] - ema3[i - 1]) / ema3[i - 1] * 100).toFixed(4));
  }
  return out;
}

/**
 * KST — Know Sure Thing (Martin Pring)
 * KST = RCMA1×1 + RCMA2×2 + RCMA3×3 + RCMA4×4
 * where RCMAn = SMA(ROC(values, rocPern), smaPern)
 * Signal = SMA(KST, sigPeriod)
 * Default params match Martin Pring's daily settings.
 *
 * Returns array of {kst, signal} | null per bar.
 *
 * @param {number[]} values
 * @param {Object}   opts
 */
export function kst(values, opts = {}) {
  const {
    rocPer1 = 10, rocPer2 = 13, rocPer3 = 14, rocPer4 = 15,
    smaPer1 = 10, smaPer2 = 13, smaPer3 = 14, smaPer4 = 15,
    signalPeriod = 9,
  } = opts;
  const n = values.length;
  const out = new Array(n).fill(null);

  // Compute 4 simple (non-calendar) ROC arrays
  function simpleRoc(arr, per) {
    const r = new Array(arr.length).fill(null);
    for (let i = per; i < arr.length; i++) {
      if (arr[i - per] === 0) { r[i] = 0; continue; }
      r[i] = ((arr[i] - arr[i - per]) / arr[i - per]) * 100;
    }
    return r;
  }

  const roc1 = simpleRoc(values, rocPer1);
  const roc2 = simpleRoc(values, rocPer2);
  const roc3 = simpleRoc(values, rocPer3);
  const roc4 = simpleRoc(values, rocPer4);

  const rcma1 = sma(roc1.map(v => v ?? 0), smaPer1);
  const rcma2 = sma(roc2.map(v => v ?? 0), smaPer2);
  const rcma3 = sma(roc3.map(v => v ?? 0), smaPer3);
  const rcma4 = sma(roc4.map(v => v ?? 0), smaPer4);

  const firstResult = Math.max(
    rocPer1 + smaPer1, rocPer2 + smaPer2,
    rocPer3 + smaPer3, rocPer4 + smaPer4
  );

  const kstArr = new Array(n).fill(null);
  for (let i = firstResult; i < n; i++) {
    if (rcma1[i] === null || rcma2[i] === null || rcma3[i] === null || rcma4[i] === null) continue;
    kstArr[i] = rcma1[i] * 1 + rcma2[i] * 2 + rcma3[i] * 3 + rcma4[i] * 4;
  }

  const sigArr = sma(kstArr.map(v => v ?? 0), signalPeriod);

  for (let i = 0; i < n; i++) {
    if (kstArr[i] === null) continue;
    out[i] = {
      kst:    parseFloat(kstArr[i].toFixed(4)),
      signal: sigArr[i] !== null ? parseFloat(sigArr[i].toFixed(4)) : null,
    };
  }
  return out;
}

/**
 * PSAR — Parabolic SAR
 * State-machine port of PSAR.ts. No generator class.
 * Starts long on the second bar, initialised from the first bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number}   step  - AF increment (default 0.02)
 * @param {number}   max   - AF maximum (default 0.20)
 */
export function psar(highs, lows, step = 0.02, max = 0.20) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  if (n < 2) return out;

  let up    = true;
  let accel = step;
  let sar, extreme;
  let prevHigh = highs[0], prevLow = lows[0];
  let furthestHigh = highs[0], furthestLow = lows[0];

  // Seed on bar 0 (SAR = low, extreme = high)
  sar     = lows[0];
  extreme = highs[0];
  out[0]  = parseFloat(sar.toFixed(4));

  for (let i = 1; i < n; i++) {
    const currHigh = highs[i];
    const currLow  = lows[i];

    // Advance SAR
    sar = sar + accel * (extreme - sar);

    if (up) {
      // SAR must not be above the two prior lows
      sar = Math.min(sar, furthestLow, prevLow);
      if (currHigh > extreme) {
        extreme = currHigh;
        accel   = Math.min(accel + step, max);
      }
    } else {
      // SAR must not be below the two prior highs
      sar = Math.max(sar, furthestHigh, prevHigh);
      if (currLow < extreme) {
        extreme = currLow;
        accel   = Math.min(accel + step, max);
      }
    }

    // Reversal check
    if ((up && currLow < sar) || (!up && currHigh > sar)) {
      accel   = step;
      sar     = extreme;
      up      = !up;
      extreme = up ? currHigh : currLow;
    }

    out[i]       = parseFloat(sar.toFixed(4));
    furthestHigh = prevHigh;
    furthestLow  = prevLow;
    prevHigh     = currHigh;
    prevLow      = currLow;
  }
  return out;
}

/**
 * KeltnerChannels — EMA(close,maPeriod) ± multiplier × ATR(high,low,close,atrPeriod)
 * Returns array of {upper, middle, lower} | null per bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   maPeriod    (default 20)
 * @param {number}   atrPeriod   (default 10)
 * @param {number}   multiplier  (default 2)
 */
export function keltnerChannels(highs, lows, closes, maPeriod = 20, atrPeriod = 10, multiplier = 2) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  const maArr  = ema(closes, maPeriod);
  const atrArr = atr(highs, lows, closes, atrPeriod);
  for (let i = 0; i < n; i++) {
    if (maArr[i] === null || atrArr[i] === null) continue;
    const mid = maArr[i];
    const band = multiplier * atrArr[i];
    out[i] = {
      upper:  parseFloat((mid + band).toFixed(4)),
      middle: parseFloat(mid.toFixed(4)),
      lower:  parseFloat((mid - band).toFixed(4)),
    };
  }
  return out;
}

/**
 * ChandelierExit — long/short stop-loss lines
 * exitLong  = Highest High (period) − ATR(period) × multiplier
 * exitShort = Lowest  Low  (period) + ATR(period) × multiplier
 * Returns array of {exitLong, exitShort} | null per bar.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number[]} closes
 * @param {number}   length      (default 22)
 * @param {number}   multiplier  (default 3)
 */
export function chandelierExit(highs, lows, closes, length = 22, multiplier = 3) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  const atrArr = atr(highs, lows, closes, length);
  for (let i = length - 1; i < n; i++) {
    if (atrArr[i] === null) continue;
    let hiMax = -Infinity, loMin = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (highs[j] > hiMax) hiMax = highs[j];
      if (lows[j]  < loMin) loMin = lows[j];
    }
    out[i] = {
      exitLong:  parseFloat((hiMax - atrArr[i] * multiplier).toFixed(4)),
      exitShort: parseFloat((loMin + atrArr[i] * multiplier).toFixed(4)),
    };
  }
  return out;
}

/**
 * IchimokuCloud
 * Returns array of {conversion, base, spanA, spanB} | null per bar.
 * Note: spanA and spanB are computed at the current bar (not displaced forward)
 * because we align to the price array for chart rendering.
 *
 * @param {number[]} highs
 * @param {number[]} lows
 * @param {number}   conversionPeriod  (default 9)
 * @param {number}   basePeriod        (default 26)
 * @param {number}   spanPeriod        (default 52)
 */
export function ichimokuCloud(highs, lows, conversionPeriod = 9, basePeriod = 26, spanPeriod = 52) {
  const n = highs.length;
  const out = new Array(n).fill(null);
  const warmup = Math.max(conversionPeriod, basePeriod, spanPeriod) - 1;
  for (let i = warmup; i < n; i++) {
    // Conversion line (Tenkan-sen): (highest high + lowest low) / 2 over conversionPeriod
    let cHi = -Infinity, cLo = Infinity;
    for (let j = i - conversionPeriod + 1; j <= i; j++) {
      if (highs[j] > cHi) cHi = highs[j];
      if (lows[j]  < cLo) cLo = lows[j];
    }
    const conversion = (cHi + cLo) / 2;

    // Base line (Kijun-sen): (highest high + lowest low) / 2 over basePeriod
    let bHi = -Infinity, bLo = Infinity;
    for (let j = i - basePeriod + 1; j <= i; j++) {
      if (highs[j] > bHi) bHi = highs[j];
      if (lows[j]  < bLo) bLo = lows[j];
    }
    const base = (bHi + bLo) / 2;

    // Span A (Senkou A): (conversion + base) / 2
    const spanA = (conversion + base) / 2;

    // Span B (Senkou B): (highest high + lowest low) / 2 over spanPeriod
    let sHi = -Infinity, sLo = Infinity;
    for (let j = i - spanPeriod + 1; j <= i; j++) {
      if (highs[j] > sHi) sHi = highs[j];
      if (lows[j]  < sLo) sLo = lows[j];
    }
    const spanB = (sHi + sLo) / 2;

    out[i] = {
      conversion: parseFloat(conversion.toFixed(4)),
      base:       parseFloat(base.toFixed(4)),
      spanA:      parseFloat(spanA.toFixed(4)),
      spanB:      parseFloat(spanB.toFixed(4)),
    };
  }
  return out;
}

