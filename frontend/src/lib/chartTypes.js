// Renko and Heikin-Ashi chart-type transforms.
// Ported from technicalindicators (MIT, Anand Aravindan) src/chart_types/*.ts.
// TypeScript classes/generators removed in favour of plain loops operating on
// our existing {time, open, high, low, close, volume} bar-array shape.
// See vendor/technicalindicators-LICENSE.

import { atr } from "./indicators";

/**
 * Renko — converts an OHLC series into fixed brick-size bars.
 * Bug fix: the source reads `candleData.Low` (capital L) when computing the
 * running low, which is `undefined` and silently breaks brick low tracking.
 * Fixed to read `bar.low` (matching the casing used everywhere else).
 *
 * Brick size defaults to the last ATR(14) value when not supplied, mirroring
 * the source's `useATR` option.
 *
 * @param {{time:number,open:number,high:number,low:number,close:number,volume?:number}[]} ohlc
 * @param {number} [brickSize] - fixed brick size; falls back to ATR(14) if omitted/zero
 */
export function renko(ohlc, brickSize) {
  const n = ohlc.length;
  const out = [];
  if (n === 0) return out;

  let size = brickSize;
  if (!size || size <= 0) {
    const atrArr = atr(
      ohlc.map((b) => b.high),
      ohlc.map((b) => b.low),
      ohlc.map((b) => b.close),
      14
    );
    for (let i = atrArr.length - 1; i >= 0; i--) {
      if (atrArr[i] != null) { size = atrArr[i]; break; }
    }
  }
  if (!size || size <= 0) return out; // not enough data to size bricks

  let lastOpen = null;
  let lastHigh = 0;
  let lastLow = Infinity;
  let lastClose = 0;
  let lastVolume = 0;

  for (let i = 0; i < n; i++) {
    const bar = ohlc[i];
    if (lastOpen === null) {
      lastOpen = bar.close;
      lastHigh = bar.high;
      lastLow = bar.low;
      lastClose = bar.close;
      lastVolume = bar.volume ?? 1;
      continue;
    }

    const moveFromClose = Math.abs(bar.close - lastClose);
    const moveFromOpen = Math.abs(bar.close - lastOpen);

    if (moveFromClose >= size && moveFromOpen >= size) {
      const reference = moveFromClose > moveFromOpen ? lastOpen : lastClose;
      const brickHigh = Math.max(lastHigh, bar.high);
      const brickLow = Math.min(lastLow, bar.low); // bug fix: was bar.Low (undefined)
      const brickClose = reference > bar.close ? reference - size : reference + size;

      out.push({
        time: bar.time,
        open: parseFloat(reference.toFixed(4)),
        high: parseFloat(brickHigh.toFixed(4)),
        low: parseFloat(brickLow.toFixed(4)),
        close: parseFloat(brickClose.toFixed(4)),
        volume: lastVolume + (bar.volume ?? 1),
      });

      lastOpen = reference;
      lastHigh = brickClose;
      lastLow = brickClose;
      lastClose = brickClose;
      lastVolume = 0;
    } else {
      lastHigh = Math.max(lastHigh, bar.high);
      lastLow = Math.min(lastLow, bar.low); // bug fix: was bar.Low (undefined)
      lastVolume += bar.volume ?? 1;
    }
  }
  return out;
}

/**
 * Heikin-Ashi — smoothed candle transform.
 * open[0] = (open+close)/2, close[0] = (open+high+low+close)/4, high/low = bar's own.
 * Subsequent bars: open = (prevOpen+prevClose)/2, close = avg(OHLC),
 * high/low = extended to include the new open/close.
 *
 * @param {{time:number,open:number,high:number,low:number,close:number,volume?:number}[]} ohlc
 */
export function heikinAshi(ohlc) {
  const n = ohlc.length;
  const out = new Array(n);
  let lastOpen = null;
  let lastClose = 0;

  for (let i = 0; i < n; i++) {
    const bar = ohlc[i];
    let o, h, l, c;
    if (lastOpen === null) {
      o = (bar.close + bar.open) / 2;
      h = bar.high;
      l = bar.low;
      c = (bar.close + bar.open + bar.high + bar.low) / 4;
    } else {
      c = (bar.close + bar.open + bar.high + bar.low) / 4;
      o = (lastOpen + lastClose) / 2;
      h = Math.max(o, c, bar.high);
      l = Math.min(bar.low, o, c);
    }
    out[i] = {
      time: bar.time,
      open: parseFloat(o.toFixed(4)),
      high: parseFloat(h.toFixed(4)),
      low: parseFloat(l.toFixed(4)),
      close: parseFloat(c.toFixed(4)),
      volume: bar.volume ?? 1,
    };
    lastOpen = o;
    lastClose = c;
  }
  return out;
}
