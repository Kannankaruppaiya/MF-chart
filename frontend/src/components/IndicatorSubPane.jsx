import React, { useEffect, useRef } from "react";
import { createChart, LineStyle } from "lightweight-charts";
import { Eye, EyeOff, Settings2, X } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { buildOHLC } from "../lib/mfapi";
import { roc, rsi, pickSource, applyOffset, computeOnTimeframe, isHigherTimeframe } from "../lib/indicators";
import { chartSync, PRICE_SCALE_MIN_WIDTH } from "../lib/chartSync";

const lsToTV = (s) => ({ solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }[s] || LineStyle.Solid);

export default function IndicatorSubPane({ id, style, indicator, isBottom, mainSeries }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
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
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
    });
    seriesRef.current = s;

    // Guide lines: RSI overbought/oversold bands, ROC zero line
    if (indicator.type === "RSI") {
      s.createPriceLine({ price: 70, color: "#f23645", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "70" });
      s.createPriceLine({ price: 30, color: "#089981", lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true, title: "30" });
      s.createPriceLine({ price: 50, color: "#363a45", lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false });
    } else if (indicator.type === "ROC") {
      s.createPriceLine({ price: 0, color: "#787b86", lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true, title: "0" });
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
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicator.type]);

  // Dynamically update timeScale visibility when isBottom changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ visible: isBottom });
  }, [isBottom]);

  // Apply style changes
  useEffect(() => {
    seriesRef.current?.applyOptions({
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
    if (!mainSeries.length) {
      s.setData([]);
      ptsRef.current = [];
      return;
    }

    const values = pickSource(buildOHLC(mainSeries), indicator.source);
    const computeFn = (vals) =>
      indicator.type === "RSI" ? rsi(vals, indicator.length) : roc(vals, indicator.length);

    // TradingView-style MTF: when the indicator's calculation timeframe is
    // higher than the chart interval, compute on resampled HTF bars and
    // project back; otherwise calculate directly on the chart bars.
    const out =
      indicator.timeframe && isHigherTimeframe(indicator.timeframe, activeInterval)
        ? computeOnTimeframe(
            mainSeries, values, indicator.timeframe,
            indicator.waitForClose !== false, computeFn,
          )
        : computeFn(values);

    let pts = mainSeries.map((p, i) => {
      const pt = { time: p.time };
      if (out[i] != null) pt.value = out[i];
      return pt;
    });
    if (indicator.offset) pts = applyOffset(pts, indicator.offset);
    ptsRef.current = pts;

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
  }, [mainSeries, indicator.length, indicator.source, indicator.type, indicator.offset,
      indicator.timeframe, indicator.waitForClose, activeInterval]);

  return (
    <div id={id} style={style} className="sub-pane" data-testid={`sub-pane-${indicator.id}`}>
      <div className="sub-toolbar">
        <span className="dot" style={{ background: indicator.color }} />
        <strong>
          {indicator.type}
          {indicator.timeframe && isHigherTimeframe(indicator.timeframe, activeInterval)
            ? ` · ${indicator.timeframe} `
            : "("}
          {indicator.length}
          {indicator.timeframe && isHigherTimeframe(indicator.timeframe, activeInterval)
            ? ` ${indicator.source || "close"}`
            : ")"}
        </strong>
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
