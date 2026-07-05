import React from "react";
import { X } from "lucide-react";
import { useChartStore } from "../store/chartStore";

const OVERLAY_TYPES = [
  { type: "SMA",        name: "SMA — Simple Moving Average",        desc: "Arithmetic mean of last N values. Overlay on price pane." },
  { type: "EMA",        name: "EMA — Exponential Moving Average",   desc: "Weighted average favoring recent values. Overlay on price pane." },
  { type: "WMA",        name: "WMA — Weighted Moving Average",      desc: "Linearly weighted MA; most-recent bar has max weight. Overlay." },
  { type: "BBANDS",     name: "BB — Bollinger Bands",               desc: "Upper/middle/lower bands at ±N std deviations. Overlay." },
  { type: "VWAP",       name: "VWAP — Vol. Weighted Avg. Price",    desc: "Cumulative volume-weighted average price. Overlay." },
  { type: "PSAR",       name: "PSAR — Parabolic SAR",               desc: "Trailing stop-loss dots following price trend. Overlay." },
  { type: "KELT",       name: "Keltner Channels",                   desc: "EMA ± multiplier × ATR bands. Overlay on price pane." },
  { type: "CHANDELIER", name: "Chandelier Exit",                    desc: "ATR-based long/short stop-loss lines. Overlay." },
  { type: "ICHIMOKU",   name: "Ichimoku Cloud",                     desc: "Conversion, base, Span A/B lines. Overlay on price pane." },
  { type: "CANDLE_PAT", name: "Candlestick Patterns",               desc: "Detects 32 patterns (Doji, Engulfing, Stars…) as price markers." },
];

const OSCILLATOR_TYPES = [
  { type: "RSI",      name: "RSI — Relative Strength Index",       desc: "Wilder's momentum oscillator (0–100). Sub-pane." },
  { type: "MACD",     name: "MACD — Moving Avg. Convergence/Div.", desc: "MACD line, signal line, and histogram. Sub-pane." },
  { type: "ROC",      name: "ROC — Rate of Change",                desc: "% momentum over N bars. Sub-pane oscillator." },
  { type: "STOCH",    name: "Stochastic — %K/%D Oscillator",       desc: "%K and %D lines (0–100). Sub-pane." },
  { type: "ADX",      name: "ADX — Avg. Directional Index",        desc: "ADX with +DI/-DI trend strength lines. Sub-pane." },
  { type: "WPCTR",    name: "Williams %R",                         desc: "Momentum oscillator (-100–0). Sub-pane." },
  { type: "ATR",      name: "ATR — Average True Range",            desc: "Wilder's volatility measure. Sub-pane." },
  { type: "OBV",      name: "OBV — On Balance Volume",             desc: "Cumulative volume-direction indicator. Sub-pane." },
  { type: "CCI",      name: "CCI — Commodity Channel Index",       desc: "(TP − SMA) / (0.015 × Mean Dev). Overbought/sold. Sub-pane." },
  { type: "AO",       name: "AO — Awesome Oscillator",             desc: "SMA(5) − SMA(34) of midprice. Bill Williams. Sub-pane." },
  { type: "MFI",      name: "MFI — Money Flow Index",              desc: "Volume-weighted RSI (0–100). Sub-pane." },
  { type: "ADL",      name: "ADL — Accumulation/Distribution",     desc: "Cumulative vol × money-flow multiplier. Sub-pane." },
  { type: "FORCEIDX", name: "Force Index",                         desc: "EMA of (ΔClose × Volume). Elder's indicator. Sub-pane." },
  { type: "STOCHRSI", name: "StochRSI — Stochastic RSI",           desc: "Stochastic of RSI — %K and %D lines. Sub-pane." },
  { type: "TRIX",     name: "TRIX — Triple EMA ROC",               desc: "1-bar % change of triple-smoothed EMA. Sub-pane." },
  { type: "KST",      name: "KST — Know Sure Thing",               desc: "Weighted sum of 4 smoothed ROC values. Sub-pane." },
];


export default function IndicatorPicker() {
  const open = useChartStore((s) => s.pickerOpen);
  const setOpen = useChartStore((s) => s.setPickerOpen);
  const addIndicator = useChartStore((s) => s.addIndicator);

  if (!open) return null;

  const add = (t) => {
    addIndicator(t);
    setOpen(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)} data-testid="indicator-picker">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Add Indicator</span>
          <button onClick={() => setOpen(false)} data-testid="picker-close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="picker-section-label">Overlays — render on price pane</div>
          <div className="picker-grid">
            {OVERLAY_TYPES.map((t) => (
              <button
                key={t.type}
                className="picker-card"
                onClick={() => add(t.type)}
                data-testid={`picker-${t.type}`}
              >
                <div className="pc-name">{t.name}</div>
                <div className="pc-desc">{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="picker-section-label" style={{ marginTop: 14 }}>Oscillators — render in sub-pane</div>
          <div className="picker-grid">
            {OSCILLATOR_TYPES.map((t) => (
              <button
                key={t.type}
                className="picker-card"
                onClick={() => add(t.type)}
                data-testid={`picker-${t.type}`}
              >
                <div className="pc-name">{t.name}</div>
                <div className="pc-desc">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
