import React, { useEffect, useRef } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { buildOHLC } from "../lib/mfapi";
import { roc, rsi, pickSource, applyOffset } from "../lib/indicators";
import { chartSync, PRICE_SCALE_MIN_WIDTH } from "../lib/chartSync";

const lsToTV = (s) => ({ solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }[s] || LineStyle.Solid);

export default function IndicatorSubPane({ id, style, indicator, isBottom, mainSeries }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
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
    const s = chart.addLineSeries({
      color: indicator.color,
      lineWidth: indicator.thickness,
      lineStyle: lsToTV(indicator.lineStyle),
      priceLineVisible: false,
      lastValueVisible: true,
    });
    seriesRef.current = s;

    // Add guide lines
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.type]);

  // Dynamically update timeScale visibility when isBottom changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ visible: isBottom });
  }, [isBottom]);

  // Apply style changes
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    s.applyOptions({
      color: indicator.color,
      lineWidth: indicator.thickness,
      lineStyle: lsToTV(indicator.lineStyle),
      visible: indicator.visible,
    });
  }, [indicator.color, indicator.thickness, indicator.lineStyle, indicator.visible]);

  // Compute values — always on mainSeries (same length + timestamps as price chart)
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (!mainSeries.length) { s.setData([]); ptsRef.current = []; return; }

    const o = buildOHLC(mainSeries);
    const values = pickSource(o, indicator.source);
    const timestamps = mainSeries.map((p) => p.time);

    let out;
    if (indicator.type === "RSI") {
      out = rsi(values, indicator.length);
    } else {
      // ROC: pass timestamps + intervals so calendarLookback activates for timeframe override
      out = roc(values, indicator.length, timestamps, activeInterval, indicator.timeframe);
    }

    let pts = mainSeries.map((p, i) => {
      const pt = { time: p.time };
      if (out[i] != null) {
        pt.value = out[i];
      }
      return pt;
    });
    if (indicator.offset) pts = applyOffset(pts, indicator.offset);
    ptsRef.current = pts;
    // Guard the setData so any auto-range emitted by lightweight-charts
    // does NOT propagate back to the main chart (main is source of truth
    // for the time axis; sub-panes must only follow). Immediately after
    // setData, re-align the sub-pane to the main chart's current range.
    chartSync.withGuard(() => {
      s.setData(pts);
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

  return (
    <div id={id} style={style} className="sub-pane" data-testid={`sub-pane-${indicator.id}`}>
      <div className="sub-toolbar">
        <span className="dot" style={{ background: indicator.color }} />
        <strong>{indicator.type}</strong> ({indicator.length})
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
