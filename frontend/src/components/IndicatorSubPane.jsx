import React, { useEffect, useRef } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { buildOHLC } from "../lib/mfapi";
import { roc, rsi, macd, atr, stochastic, adx, williamsR, obv, cci, awesomeOscillator, mfi, adl, forceIndex, stochasticRSI, trix, kst, pickSource, applyOffset } from "../lib/indicators";
import { chartSync, PRICE_SCALE_MIN_WIDTH } from "../lib/chartSync";

const lsToTV = (s) => ({ solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }[s] || LineStyle.Solid);

// Sub-pane indicator types that render as oscillators (not overlays)
const SUB_PANE_TYPES = new Set([
  "ROC", "RSI", "MACD", "ATR", "STOCH", "ADX", "WPCTR", "OBV",
  "CCI", "AO", "MFI", "ADL", "FORCEIDX", "STOCHRSI", "TRIX", "KST",
]);

export default function IndicatorSubPane({ id, style, indicator, isBottom, mainSeries }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);    // primary line
  const series2Ref = useRef(null);   // secondary line (signal / %D / +DI / hist)
  const series3Ref = useRef(null);   // tertiary line (histogram / ADX / -DI)
  const guideRefs = useRef([]);
  const ptsRef = useRef([]);

  const activeInterval = useChartStore((s) => s.activeInterval);
  const updateIndicator = useChartStore((s) => s.updateIndicator);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const openSettings = useChartStore((s) => s.openSettings);


  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d4dc",
        fontSize: 11,
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "#1e222d", style: LineStyle.Dashed },
        horzLines: { color: "#1e222d", style: LineStyle.Dashed },
      },
      rightPriceScale: { borderColor: "#363a45", minimumWidth: PRICE_SCALE_MIN_WIDTH },
      timeScale: { borderColor: "#363a45", visible: isBottom, timeVisible: false, secondsVisible: false },
      autoSize: false,
      attributionLogo: false,
    });
    chartRef.current = chart;

    // ── Primary line series ──────────────────────────────────────────────────
    const s = chart.addLineSeries({
      color: indicator.color,
      lineWidth: indicator.thickness,
      lineStyle: lsToTV(indicator.lineStyle),
      priceLineVisible: false,
      lastValueVisible: true,
    });
    seriesRef.current = s;

    // ── Secondary line (MACD signal / Stoch %D / ADX +DI) ────────────────────
    if (["MACD", "STOCH", "ADX", "STOCHRSI", "KST"].includes(indicator.type)) {
      series2Ref.current = chart.addLineSeries({
        color: indicator.color2 || "#FF6D00",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
      });
    }

    // ── Tertiary line (MACD histogram / ADX -DI) ─────────────────────────────
    if (["MACD", "ADX"].includes(indicator.type)) {
      series3Ref.current = chart.addLineSeries({
        color: indicator.color3 || "#26A69A",
        lineWidth: 1,
        lineStyle: indicator.type === "MACD" ? LineStyle.Dotted : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: true,
      });
    }

    // ── Guide lines per type ─────────────────────────────────────────────────
    if (indicator.type === "RSI") {
      guideRefs.current = [
        s.createPriceLine({ price: 70, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "70" }),
        s.createPriceLine({ price: 30, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "30" }),
        s.createPriceLine({ price: 50, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    } else if (indicator.type === "ROC") {
      guideRefs.current = [
        s.createPriceLine({ price: 0, color: "#787b86", lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true, title: "0" }),
      ];
    } else if (indicator.type === "STOCH") {
      guideRefs.current = [
        s.createPriceLine({ price: 80, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "80" }),
        s.createPriceLine({ price: 20, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "20" }),
        s.createPriceLine({ price: 50, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    } else if (indicator.type === "WPCTR") {
      guideRefs.current = [
        s.createPriceLine({ price: -20,  color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "-20" }),
        s.createPriceLine({ price: -80,  color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "-80" }),
        s.createPriceLine({ price: -50,  color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    } else if (indicator.type === "ADX") {
      guideRefs.current = [
        s.createPriceLine({ price: 25, color: "#787b86", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "25" }),
      ];
    } else if (indicator.type === "MACD") {
      guideRefs.current = [
        s.createPriceLine({ price: 0, color: "#787b86", lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true, title: "0" }),
      ];
    } else if (indicator.type === "CCI") {
      guideRefs.current = [
        s.createPriceLine({ price:  100, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,  title: "+100" }),
        s.createPriceLine({ price: -100, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,  title: "-100" }),
        s.createPriceLine({ price:    0, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    } else if (["AO", "TRIX", "FORCEIDX"].includes(indicator.type)) {
      guideRefs.current = [
        s.createPriceLine({ price: 0, color: "#787b86", lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true, title: "0" }),
      ];
    } else if (indicator.type === "MFI") {
      guideRefs.current = [
        s.createPriceLine({ price: 80, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,  title: "80" }),
        s.createPriceLine({ price: 20, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,  title: "20" }),
        s.createPriceLine({ price: 50, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    } else if (indicator.type === "STOCHRSI") {
      guideRefs.current = [
        s.createPriceLine({ price: 80, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "80" }),
        s.createPriceLine({ price: 20, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "20" }),
        s.createPriceLine({ price: 50, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false }),
      ];
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        chartSync.requestResizeAll();
      }
    });
    ro.observe(ref.current);

    // Sync: register + push visible logical range changes
    chartSync.registerSub(indicator.id, chart, () => seriesRef.current, () => ptsRef.current, ref.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      chartSync.syncLogicalRange(chart, range);
    });
    // Sync crosshair
    chart.subscribeCrosshairMove((param) => {
      chartSync.syncCrosshair(chart, param);
    });

    // Align to main's current visible logical range on mount
    const main = chartSync.getMain();
    if (main) {
      const cur = main.chart.timeScale().getVisibleLogicalRange();
      if (cur) {
        try { chart.timeScale().setVisibleLogicalRange(cur); }
        catch (err) { console.warn("[SubPane] initial range align failed:", err); }
      }
    }

    return () => {
      chartSync.unregisterSub(indicator.id);
      ro.disconnect();
      chart.remove();
      series2Ref.current = null;
      series3Ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.type]);

  // Dynamically update timeScale visibility when isBottom changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ visible: isBottom });
  }, [isBottom]);

  // Apply style changes to primary series
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({
      color: indicator.color,
      lineWidth: indicator.thickness,
      lineStyle: lsToTV(indicator.lineStyle),
      visible: indicator.visible,
    });
    if (series2Ref.current) {
      series2Ref.current.applyOptions({ color: indicator.color2 || "#FF6D00", visible: indicator.visible });
    }
    if (series3Ref.current) {
      series3Ref.current.applyOptions({ color: indicator.color3 || "#26A69A", visible: indicator.visible });
    }
  }, [indicator.color, indicator.color2, indicator.color3, indicator.thickness, indicator.lineStyle, indicator.visible]);

  // Compute values — always on mainSeries (same length + timestamps as price chart)
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (!mainSeries.length) {
      s.setData([]);
      series2Ref.current?.setData([]);
      series3Ref.current?.setData([]);
      ptsRef.current = [];
      return;
    }

    const o = buildOHLC(mainSeries);
    const values = pickSource(o, indicator.source);
    const timestamps = mainSeries.map((p) => p.time);

    // Helper to map output array to lightweight-charts point array
    const toPts = (arr) =>
      mainSeries.map((p, i) => {
        const pt = { time: p.time };
        if (arr[i] != null) pt.value = arr[i];
        return pt;
      });

    let primaryPts, secondaryPts = null, tertiaryPts = null;

    // ── RSI ────────────────────────────────────────────────────────────────
    if (indicator.type === "RSI") {
      const out = rsi(values, indicator.length);
      primaryPts = toPts(out);

    // ── ROC ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "ROC") {
      const out = roc(values, indicator.length, timestamps, activeInterval, indicator.timeframe);
      primaryPts = toPts(out);

    // ── MACD ───────────────────────────────────────────────────────────────
    // length is used as slowLen; fastLen = length/2 rounded, sigLen = 9
    } else if (indicator.type === "MACD") {
      const slowLen = indicator.length || 26;
      const fastLen = Math.max(2, Math.round(slowLen / 2));
      const sigLen  = 9;
      const out = macd(values, fastLen, slowLen, sigLen);
      primaryPts   = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].macd      } : {}) }));
      secondaryPts = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].signal    } : {}) }));
      tertiaryPts  = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].histogram } : {}) }));

    // ── ATR ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "ATR") {
      const out = atr(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), indicator.length);
      primaryPts = toPts(out);

    // ── Stochastic ─────────────────────────────────────────────────────────
    } else if (indicator.type === "STOCH") {
      const kLen = indicator.length || 14;
      const dLen = 3;
      const out = stochastic(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), kLen, dLen);
      primaryPts   = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].k } : {}) }));
      secondaryPts = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] && out[i].d != null ? { value: out[i].d } : {}) }));

    // ── ADX ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "ADX") {
      const out = adx(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), indicator.length);
      // Primary = ADX, Secondary = +DI, Tertiary = -DI
      primaryPts   = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].adx } : {}) }));
      secondaryPts = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].pdi } : {}) }));
      tertiaryPts  = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].mdi } : {}) }));

    // ── Williams %R ────────────────────────────────────────────────────────
    } else if (indicator.type === "WPCTR") {
      const out = williamsR(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), indicator.length);
      primaryPts = toPts(out);

    // ── OBV ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "OBV") {
      const out = obv(o.map(b => b.close), o.map(b => b.volume ?? 1));
      primaryPts = toPts(out);

    // ── CCI ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "CCI") {
      const out = cci(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), indicator.length);
      primaryPts = toPts(out);

    // ── AO — Awesome Oscillator ────────────────────────────────────────────
    } else if (indicator.type === "AO") {
      // length = fastPeriod; slowPeriod = length * 6 capped at 34
      const fast = indicator.length || 5;
      const slow = Math.min(fast * 6, 34);
      const out = awesomeOscillator(o.map(b => b.high), o.map(b => b.low), fast, slow);
      primaryPts = toPts(out);

    // ── MFI ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "MFI") {
      const out = mfi(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), o.map(b => b.volume ?? 1), indicator.length);
      primaryPts = toPts(out);

    // ── ADL ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "ADL") {
      const out = adl(o.map(b => b.high), o.map(b => b.low), o.map(b => b.close), o.map(b => b.volume ?? 1));
      primaryPts = toPts(out);

    // ── ForceIndex ─────────────────────────────────────────────────────────
    } else if (indicator.type === "FORCEIDX") {
      const out = forceIndex(o.map(b => b.close), o.map(b => b.volume ?? 1), indicator.length);
      primaryPts = toPts(out);

    // ── StochasticRSI ──────────────────────────────────────────────────────
    } else if (indicator.type === "STOCHRSI") {
      const rsiLen   = indicator.length || 14;
      const stochLen = indicator.length || 14;
      const out = stochasticRSI(values, rsiLen, stochLen, 3, 3);
      primaryPts   = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].k } : {}) }));
      secondaryPts = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] && out[i].d != null ? { value: out[i].d } : {}) }));

    // ── TRIX ───────────────────────────────────────────────────────────────
    } else if (indicator.type === "TRIX") {
      const out = trix(values, indicator.length);
      primaryPts = toPts(out);

    // ── KST ────────────────────────────────────────────────────────────────
    } else if (indicator.type === "KST") {
      const out = kst(values);
      primaryPts   = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] ? { value: out[i].kst    } : {}) }));
      secondaryPts = mainSeries.map((p, i) => ({ time: p.time, ...(out[i] && out[i].signal != null ? { value: out[i].signal } : {}) }));

    } else {
      return;
    }

    if (indicator.offset && primaryPts) primaryPts = applyOffset(primaryPts, indicator.offset);
    ptsRef.current = primaryPts;

    chartSync.withGuard(() => {
      s.setData(primaryPts);
      if (series2Ref.current && secondaryPts) series2Ref.current.setData(secondaryPts);
      if (series3Ref.current && tertiaryPts)  series3Ref.current.setData(tertiaryPts);

      const main = chartSync.getMain();
      const chart = chartRef.current;
      if (main && chart) {
        const cur = main.chart.timeScale().getVisibleLogicalRange();
        if (cur) {
          try { chart.timeScale().setVisibleLogicalRange(cur); }
          catch (err) { console.warn("[SubPane] re-align after setData failed:", err); }
        }
      }
    });
    chartSync.syncPriceScaleWidths();
  }, [mainSeries, indicator.length, indicator.source, indicator.type, indicator.offset, activeInterval, indicator.timeframe]);

  // Human-readable label for sub-pane toolbar
  const label = {
    MACD:     `MACD(${Math.max(2, Math.round((indicator.length || 26) / 2))},${indicator.length || 26},9)`,
    STOCH:    `Stoch(%K:${indicator.length || 14},%D:3)`,
    ADX:      `ADX(${indicator.length})`,
    WPCTR:    `%R(${indicator.length})`,
    AO:       `AO(${indicator.length || 5},${Math.min((indicator.length || 5) * 6, 34)})`,
    STOCHRSI: `StochRSI(${indicator.length || 14})`,
    KST:      `KST`,
  }[indicator.type] || `${indicator.type}(${indicator.length})`;

  return (
    <div id={id} style={style} className="sub-pane" data-testid={`sub-pane-${indicator.id}`}>
      <div className="sub-toolbar">
        <span className="dot" style={{ background: indicator.color }} />
        {["MACD", "STOCH", "ADX", "STOCHRSI", "KST"].includes(indicator.type) && (
          <>
            <span className="dot" style={{ background: indicator.color2 || "#FF6D00" }} />
            {["MACD", "ADX"].includes(indicator.type) && (
              <span className="dot" style={{ background: indicator.color3 || "#26A69A" }} />
            )}
          </>
        )}
        <strong>{label}</strong>
        <button
          onClick={() => updateIndicator(indicator.id, { visible: !indicator.visible })}
          title="Toggle visibility"
          style={{ color: "var(--tv-text-dim)", display: "inline-flex" }}
          data-testid={`sub-toggle-${indicator.id}`}
        >
          {indicator.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button
          onClick={() => openSettings(indicator.id)}
          title="Settings"
          style={{ color: "var(--tv-text-dim)", display: "inline-flex" }}
          data-testid={`sub-settings-${indicator.id}`}
        >
          <Settings2 size={12} />
        </button>
        <button
          onClick={() => removeIndicator(indicator.id)}
          title="Remove"
          style={{ color: "var(--tv-text-dim)", display: "inline-flex" }}
          data-testid={`sub-remove-${indicator.id}`}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--tv-red)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--tv-text-dim)")}
        >
          <X size={12} />
        </button>
      </div>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
