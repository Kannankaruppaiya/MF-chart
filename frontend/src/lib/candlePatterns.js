/**
 * candlePatterns.js
 *
 * Plain-JS port of candlestick pattern logic from the MIT-licensed
 * technicalindicators library (Copyright 2016 Anand Aravindan).
 * See vendor/technicalindicators-LICENSE for full license text.
 *
 * Architecture notes:
 *  - TypeScript classes / generators removed; all logic is plain functions.
 *  - Bug fix: original `getAllPatternIndex` used `.filter(hasIndex => hasIndex)`
 *    which drops index 0 (falsy). Fixed with explicit `!== undefined` check.
 *  - Each detector function accepts {open, high, low, close} arrays and returns
 *    an array of integer indices where the pattern occurs.
 */

// ─── Shared helper ────────────────────────────────────────────────────────────

/** Returns true when |a−b| ≤ 0.1% of a (approximateEqual from CandlestickFinder) */
function approxEq(a, b) {
  const diff = Math.abs(a - b);
  const threshold = Math.abs(a * 0.001);
  return diff <= threshold;
}

/**
 * Scans a full OHLC dataset for a multi-candle pattern.
 * @param {Object}   data        - {open, high, low, close} arrays
 * @param {number}   count       - number of consecutive candles the pattern needs
 * @param {Function} logicFn     - function(window) → boolean, window = {open,high,low,close}
 * @returns {number[]} indices where the LAST candle of the pattern appears
 */
function scanPattern(data, count, logicFn) {
  const { open, high, low, close } = data;
  const n = close.length;
  const results = [];
  if (n < count) return results;
  for (let i = 0; i <= n - count; i++) {
    const w = {
      open:  open.slice(i, i + count),
      high:  high.slice(i, i + count),
      low:   low.slice(i, i + count),
      close: close.slice(i, i + count),
    };
    if (logicFn(w)) {
      results.push(i + count - 1); // index of the LAST bar of the pattern
    }
  }
  return results;
}

// ─── Average gain / loss helpers (for HammerPattern / HangingMan / ShootingStar) ──

function avgGain(values, period) {
  let gains = 0, count = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) { gains += diff; count++; }
  }
  return count > 0 ? gains / period : 0;
}

function avgLoss(values, period) {
  let losses = 0, count = 0;
  for (let i = 1; i < values.length; i++) {
    const diff = values[i - 1] - values[i];
    if (diff > 0) { losses += diff; count++; }
  }
  return count > 0 ? losses / period : 0;
}

// ─── 1-candle patterns ────────────────────────────────────────────────────────

export function detectDoji(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    const oc = approxEq(o, c);
    const hEqO = oc && approxEq(o, h);
    const lEqC = oc && approxEq(c, l);
    return oc && (hEqO === lEqC);
  });
}

export function detectDragonFlyDoji(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    const oc = approxEq(o, c);
    const hEqO = oc && approxEq(o, h);
    const lEqC = oc && approxEq(c, l);
    return oc && hEqO && !lEqC;
  });
}

export function detectGraveStoneDoji(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    const oc = approxEq(o, c);
    const hEqO = oc && approxEq(o, h);
    const lEqC = oc && approxEq(c, l);
    return oc && lEqC && !hEqO;
  });
}

export function detectBullishMarubozu(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return approxEq(c, h) && approxEq(l, o) && o < c && o < h;
  });
}

export function detectBearishMarubozu(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return approxEq(o, h) && approxEq(l, c) && o > c && o > l;
  });
}

export function detectBullishHammerStick(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return c > o && approxEq(c, h) && (c - o) <= 2 * (o - l);
  });
}

export function detectBearishHammerStick(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return o > c && approxEq(o, h) && (o - c) <= 2 * (c - l);
  });
}

export function detectBullishInvertedHammerStick(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return c > o && approxEq(o, l) && (c - o) <= 2 * (h - c);
  });
}

export function detectBearishInvertedHammerStick(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    return o > c && approxEq(c, l) && (o - c) <= 2 * (h - o);
  });
}

export function detectBullishSpinningTop(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    const body = Math.abs(c - o);
    const upper = Math.abs(h - c);
    const lower = Math.abs(o - l);
    return body < upper && body < lower;
  });
}

export function detectBearishSpinningTop(data) {
  return scanPattern(data, 1, (w) => {
    const [o, c, h, l] = [w.open[0], w.close[0], w.high[0], w.low[0]];
    const body = Math.abs(c - o);
    const upper = Math.abs(h - o);
    const lower = Math.abs(h - l);
    return body < upper && body < lower;
  });
}

// ─── 2-candle patterns ────────────────────────────────────────────────────────

export function detectBullishEngulfing(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, o1, c1] = [w.open[0], w.close[0], w.open[1], w.close[1]];
    return c0 < o0 && o0 > o1 && c0 > o1 && o0 < c1;
  });
}

export function detectBearishEngulfing(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, o1, c1] = [w.open[0], w.close[0], w.open[1], w.close[1]];
    return c0 > o0 && o0 < o1 && c0 < o1 && o0 > c1;
  });
}

export function detectBullishHarami(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    return o0 > o1 && c0 < o1 && c0 < c1 && o0 > l1 && h0 > h1;
  });
}

export function detectBearishHarami(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    return o0 < o1 && c0 > o1 && c0 > c1 && o0 < l1 && h0 > h1;
  });
}

export function detectBullishHaramiCross(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    const isBull = o0 > o1 && c0 < o1 && c0 < c1 && o0 > l1 && h0 > h1;
    return isBull && approxEq(o1, c1);
  });
}

export function detectBearishHaramiCross(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    const isBear = o0 < o1 && c0 > o1 && c0 > c1 && o0 < l1 && h0 > h1;
    return isBear && approxEq(o1, c1);
  });
}

export function detectPiercingLine(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    const mid = (o0 + c0) / 2;
    const downtrend = l1 < l0;
    const firstBear = c0 < o0;
    const secondBull = c1 > o1;
    const pierce = l0 > o1 && c1 > mid;
    return downtrend && firstBear && pierce && secondBull;
  });
}

export function detectDarkCloudCover(data) {
  return scanPattern(data, 2, (w) => {
    const [o0, c0, h0, l0, o1, c1, h1, l1] =
      [w.open[0], w.close[0], w.high[0], w.low[0],
       w.open[1], w.close[1], w.high[1], w.low[1]];
    const mid = (c0 + o0) / 2;
    const firstBull = c0 > o0;
    const secondBear = c1 < o1;
    const pattern = o1 > h0 && c1 < mid && c1 > o0;
    return firstBull && secondBear && pattern;
  });
}

export function detectTweezerBottom(data) {
  return scanPattern(data, 5, (w) => {
    const period = 2;
    const gains = avgGain(w.close.slice(0, 3), period);
    const losses = avgLoss(w.close.slice(0, 3), period);
    const downtrend = losses > gains;
    return downtrend && w.low[3] === w.low[4];
  });
}

export function detectTweezerTop(data) {
  return scanPattern(data, 5, (w) => {
    const period = 2;
    const gains = avgGain(w.close.slice(0, 3), period);
    const losses = avgLoss(w.close.slice(0, 3), period);
    const uptrend = gains > losses;
    return uptrend && w.high[3] === w.high[4];
  });
}

// ─── 3-candle patterns ────────────────────────────────────────────────────────

// Doji logic inlined for reuse
function isDoji(o, c, h, l) {
  const oc = approxEq(o, c);
  const hEqO = oc && approxEq(o, h);
  const lEqC = oc && approxEq(c, l);
  return oc && (hEqO === lEqC);
}

export function detectMorningStar(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const mid0 = (o0 + c0) / 2;
    const firstBear = c0 < o0;
    const small = l0 > l1 && l0 > h1;
    const thirdBull = o2 < c2;
    const gap = h1 < l0 && l1 < l0 && o2 > h1 && c1 < o2;
    const closesAboveMid = c2 > mid0;
    return firstBear && small && gap && thirdBull && closesAboveMid;
  });
}

export function detectMorningDojiStar(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const mid0 = (o0 + c0) / 2;
    const firstBear = c0 < o0;
    const dojiMiddle = isDoji(o1, c1, h1, l1);
    const thirdBull = o2 < c2;
    const gap = h1 < l0 && l1 < l0 && o2 > h1 && c1 < o2;
    const closesAboveMid = c2 > mid0;
    return firstBear && dojiMiddle && thirdBull && gap && closesAboveMid;
  });
}

export function detectEveningStar(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const mid0 = (o0 + c0) / 2;
    const firstBull = c0 > o0;
    const small = h0 < l1 && h0 < h1;
    const thirdBear = o2 > c2;
    const gap = h1 > h0 && l1 > h0 && o2 < l1 && c1 > o2;
    const closesBelowMid = c2 < mid0;
    return firstBull && small && gap && thirdBear && closesBelowMid;
  });
}

export function detectEveningDojiStar(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const mid0 = (o0 + c0) / 2;
    const firstBull = c0 > o0;
    const dojiMiddle = isDoji(o1, c1, h1, l1);
    const thirdBear = o2 > c2;
    const gap = h1 > h0 && l1 > h0 && o2 < l1 && c1 > o2;
    const closesBelowMid = c2 < mid0;
    return firstBull && dojiMiddle && gap && thirdBear && closesBelowMid;
  });
}

export function detectThreeWhiteSoldiers(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const uptrend  = h1 > h0 && h2 > h1;
    const allBull  = o0 < c0 && o1 < c1 && o2 < c2;
    const opensIn  = c0 > o1 && o1 < h0 && h1 > o2 && o2 < c1;
    return uptrend && allBull && opensIn;
  });
}

export function detectThreeBlackCrows(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const downtrend = l0 > l1 && l1 > l2;
    const allBear   = o0 > c0 && o1 > c1 && o2 > c2;
    const opensIn   = o0 > o1 && o1 > c0 && o1 > o2 && o2 > c1;
    return downtrend && allBear && opensIn;
  });
}

export function detectAbandonedBaby(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const firstBear = c0 < o0;
    const dojiMiddle = isDoji(o1, c1, h1, l1);
    const gap = h1 < l0 && l2 > h1 && c2 > o2;
    const thirdBull = h2 < o0;
    return firstBear && dojiMiddle && gap && thirdBull;
  });
}

export function detectDownsideTasukiGap(data) {
  return scanPattern(data, 3, (w) => {
    const [o0,c0,h0,l0,o1,c1,h1,l1,o2,c2,h2,l2] =
      [w.open[0],w.close[0],w.high[0],w.low[0],
       w.open[1],w.close[1],w.high[1],w.low[1],
       w.open[2],w.close[2],w.high[2],w.low[2]];
    const firstBear  = c0 < o0;
    const secondBear = c1 < o1;
    const thirdBull  = c2 > o2;
    const gap        = h1 < l0;
    const pattern    = o1 > o2 && c1 < o2 && c2 > o1 && c2 < c0;
    return firstBear && secondBear && thirdBull && gap && pattern;
  });
}

// ─── 5-candle patterns (complex — trend + hammer + confirmation) ───────────────

function _hammersticksAtSlice(o, c, h, l) {
  // BearishHammer
  if (o > c && approxEq(o, h) && (o - c) <= 2 * (c - l)) return true;
  // BullishHammer
  if (c > o && approxEq(c, h) && (c - o) <= 2 * (o - l)) return true;
  // BullishInvertedHammer
  if (c > o && approxEq(o, l) && (c - o) <= 2 * (h - c)) return true;
  // BearishInvertedHammer
  if (o > c && approxEq(c, l) && (o - c) <= 2 * (h - o)) return true;
  return false;
}

function _invertedHammersAt(o, c, h, l) {
  // BearishInvertedHammer
  if (o > c && approxEq(c, l) && (o - c) <= 2 * (h - o)) return true;
  // BullishInvertedHammer
  if (c > o && approxEq(o, l) && (c - o) <= 2 * (h - c)) return true;
  return false;
}

function _plainHammersAt(o, c, h, l) {
  // BearishHammer
  if (o > c && approxEq(o, h) && (o - c) <= 2 * (c - l)) return true;
  // BullishHammer
  if (c > o && approxEq(c, h) && (c - o) <= 2 * (o - l)) return true;
  return false;
}

export function detectHammerPattern(data) {
  return scanPattern(data, 5, (w) => {
    const close3 = w.close.slice(0, 3);
    const period = 2;
    const downtrend = avgLoss(close3, period) > avgGain(close3, period);
    const hasHammer = _hammersticksAtSlice(w.open[3], w.close[3], w.high[3], w.low[3]);
    const confirmBull = w.open[4] < w.close[4] && w.close[3] < w.close[4];
    return downtrend && hasHammer && confirmBull;
  });
}

export function detectHangingMan(data) {
  return scanPattern(data, 5, (w) => {
    const close3 = w.close.slice(0, 3);
    const period = 2;
    const uptrend = avgGain(close3, period) > avgLoss(close3, period);
    const hasHammer = _plainHammersAt(w.open[3], w.close[3], w.high[3], w.low[3]);
    const confirmBear = w.open[4] > w.close[4] && w.close[3] > w.close[4];
    return uptrend && hasHammer && confirmBear;
  });
}

export function detectShootingStar(data) {
  return scanPattern(data, 5, (w) => {
    const close3 = w.close.slice(0, 3);
    const period = 2;
    const uptrend = avgGain(close3, period) > avgLoss(close3, period);
    const hasInvHammer = _invertedHammersAt(w.open[3], w.close[3], w.high[3], w.low[3]);
    const confirmBear = w.open[4] > w.close[4] && w.close[3] > w.close[4];
    return uptrend && hasInvHammer && confirmBear;
  });
}

// ─── Master detector — returns array of {index, name, sentiment} ─────────────

const DETECTORS = [
  { name: "Doji",                      fn: detectDoji,                       sent: "neutral" },
  { name: "DragonFly Doji",            fn: detectDragonFlyDoji,              sent: "bullish" },
  { name: "GraveStone Doji",           fn: detectGraveStoneDoji,             sent: "bearish" },
  { name: "Bullish Marubozu",          fn: detectBullishMarubozu,            sent: "bullish" },
  { name: "Bearish Marubozu",          fn: detectBearishMarubozu,            sent: "bearish" },
  { name: "Bullish Hammer Stick",      fn: detectBullishHammerStick,         sent: "bullish" },
  { name: "Bearish Hammer Stick",      fn: detectBearishHammerStick,         sent: "bearish" },
  { name: "Bullish Inverted Hammer",   fn: detectBullishInvertedHammerStick, sent: "bullish" },
  { name: "Bearish Inverted Hammer",   fn: detectBearishInvertedHammerStick, sent: "bearish" },
  { name: "Bullish Spinning Top",      fn: detectBullishSpinningTop,         sent: "bullish" },
  { name: "Bearish Spinning Top",      fn: detectBearishSpinningTop,         sent: "bearish" },
  { name: "Bullish Engulfing",         fn: detectBullishEngulfing,           sent: "bullish" },
  { name: "Bearish Engulfing",         fn: detectBearishEngulfing,           sent: "bearish" },
  { name: "Bullish Harami",            fn: detectBullishHarami,              sent: "bullish" },
  { name: "Bearish Harami",            fn: detectBearishHarami,              sent: "bearish" },
  { name: "Bullish Harami Cross",      fn: detectBullishHaramiCross,         sent: "bullish" },
  { name: "Bearish Harami Cross",      fn: detectBearishHaramiCross,         sent: "bearish" },
  { name: "Piercing Line",             fn: detectPiercingLine,               sent: "bullish" },
  { name: "Dark Cloud Cover",          fn: detectDarkCloudCover,             sent: "bearish" },
  { name: "Tweezer Bottom",            fn: detectTweezerBottom,              sent: "bullish" },
  { name: "Tweezer Top",               fn: detectTweezerTop,                 sent: "bearish" },
  { name: "Morning Star",              fn: detectMorningStar,                sent: "bullish" },
  { name: "Morning Doji Star",         fn: detectMorningDojiStar,            sent: "bullish" },
  { name: "Evening Star",              fn: detectEveningStar,                sent: "bearish" },
  { name: "Evening Doji Star",         fn: detectEveningDojiStar,            sent: "bearish" },
  { name: "Three White Soldiers",      fn: detectThreeWhiteSoldiers,         sent: "bullish" },
  { name: "Three Black Crows",         fn: detectThreeBlackCrows,            sent: "bearish" },
  { name: "Abandoned Baby",            fn: detectAbandonedBaby,              sent: "bullish" },
  { name: "Downside Tasuki Gap",       fn: detectDownsideTasukiGap,          sent: "bearish" },
  { name: "Hammer Pattern",            fn: detectHammerPattern,              sent: "bullish" },
  { name: "Hanging Man",               fn: detectHangingMan,                 sent: "bearish" },
  { name: "Shooting Star",             fn: detectShootingStar,               sent: "bearish" },
];

/**
 * Scan all candlestick patterns across the full OHLC dataset.
 * Returns a flat array of {index, name, sentiment} objects, one entry per match.
 * Bug fix: original used `.filter(x => x)` which dropped index 0. Now uses
 * explicit scanPattern which never yields falsy indices.
 *
 * @param {Object} data - {open, high, low, close, time} arrays
 * @returns {{ index:number, name:string, sentiment:"bullish"|"bearish"|"neutral" }[]}
 */
export function detectAllPatterns(data) {
  const hits = [];
  for (const { name, fn, sent } of DETECTORS) {
    const indices = fn(data);
    for (const idx of indices) {
      hits.push({ index: idx, name, sentiment: sent });
    }
  }
  // Sort chronologically
  hits.sort((a, b) => a.index - b.index);
  return hits;
}
