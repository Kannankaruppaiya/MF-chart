import React, { useEffect, useMemo, useRef, useState } from "react";
import { createChart, LineStyle, CrosshairMode } from "lightweight-charts";
import { LineChart as LineIcon, CandlestickChart, AreaChart, BrickWall, Waves, Settings2, Eye, EyeOff, X } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { buildOHLC } from "../lib/mfapi";
import {
  sma, ema, wma, bollingerBands, vwap, psar, keltnerChannels, chandelierExit, ichimokuCloud,
  pickSource, applyOffset,
} from "../lib/indicators";
import { detectAllPatterns } from "../lib/candlePatterns";
import { renko, heikinAshi } from "../lib/chartTypes";
import { chartSync, PRICE_SCALE_MIN_WIDTH } from "../lib/chartSync";

const lsToTV = (style) => ({
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
}[style] || LineStyle.Solid);

const visibleRangeDays = {
  "1D": 1, "5D": 5, "1M": 31, "3M": 93, "6M": 186,
  YTD: -1, "1Y": 365, "5Y": 365 * 5, All: -2,
};

export default function ChartPane({ id, style, isBottom, series, loading }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const mainSeriesRef = useRef(null);
  const overlaySeriesRef = useRef({}); // id → series

  const activeScheme = useChartStore((s) => s.activeScheme);
  const chartType = useChartStore((s) => s.chartType);
  const setChartType = useChartStore((s) => s.setChartType);
  const activeInterval = useChartStore((s) => s.activeInterval);
  const visibleRange = useChartStore((s) => s.visibleRange);
  const indicators = useChartStore((s) => s.indicators);
  const updateIndicator = useChartStore((s) => s.updateIndicator);
  const removeIndicator = useChartStore((s) => s.removeIndicator);
  const openSettings = useChartStore((s) => s.openSettings);
  const activeTool = useChartStore((s) => s.activeTool);
  const setActiveTool = useChartStore((s) => s.setActiveTool);
  const pendingPoint = useChartStore((s) => s.pendingPoint);
  const setPendingPoint = useChartStore((s) => s.setPendingPoint);
  const drawings = useChartStore((s) => s.drawings);
  const addDrawing = useChartStore((s) => s.addDrawing);
  const removeDrawing = useChartStore((s) => s.removeDrawing);
  const drawingSeriesRef = useRef({}); // id → series or priceLine
  const [measure, setMeasure] = useState(null);

  const [readout, setReadout] = useState(null);

  const ohlc = useMemo(() => buildOHLC(series), [series]);

  // Renko / Heikin-Ashi are alternate candle renderings of the same OHLC data,
  // selected via the same chart-type toggle as line/candle/area.
  const isCandleLike = chartType === "candle" || chartType === "renko" || chartType === "heikinashi";
  const displayOhlc = useMemo(() => {
    if (chartType === "renko") return renko(ohlc);
    if (chartType === "heikinashi") return heikinAshi(ohlc);
    return ohlc;
  }, [ohlc, chartType]);

  const seriesRef2 = useRef([]);
  useEffect(() => {
    seriesRef2.current = isCandleLike ? displayOhlc : series;
  }, [series, displayOhlc, isCandleLike]);

  // ---- Setup chart once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
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
      timeScale: { borderColor: "#363a45", timeVisible: false, secondsVisible: false, visible: isBottom },
      crosshair: { mode: CrosshairMode.Normal },
      autoSize: false,
      attributionLogo: false,
      watermark: {
        visible: true,
        fontSize: 24,
        horzAlign: "center",
        vertAlign: "center",
        color: "rgba(255, 255, 255, 0.04)",
        text: "",
      },
    });
    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData?.size) {
        setReadout(null);
        return;
      }
      const v = param.seriesData.get(mainSeriesRef.current);
      if (!v) return;
      const val = typeof v === "number" ? v : v.close ?? v.value;
      setReadout({ time: param.time, value: val });
    });

    // Click handler for drawing tools (uses latest store state)
    chart.subscribeClick((param) => {
      if (!param || !param.time || !mainSeriesRef.current) return;
      const tool = useChartStore.getState().activeTool;
      if (tool === "cursor" || tool === "crosshair" || tool === "text") return;
      // Resolve y price at the clicked event coordinate
      const point = param.point;
      if (!point) return;
      const price = mainSeriesRef.current.coordinateToPrice(point.y);
      if (price === null) return;

      // Bug fix: the drawings-render effect and drawings-list panel below both
      // read `.value` off each point (e.g. `d.points[0].value.toFixed(2)`), not
      // `.price` — storing under `price` here caused a crash ("Cannot read
      // properties of undefined (reading 'toFixed')") as soon as a drawing was
      // actually placed.
      const pt = { time: param.time, value: price };

      const pending = useChartStore.getState().pendingPoint;
      // Bug fix: these must match DrawToolRail's actual tool ids ("trendline"/
      // "ruler"/"hline") and the drawings-render effect below, which expect
      // the same strings. The previous checks ("trend"/"ray"/"arrow"/
      // "horizontal") never matched any real tool id, so no click tool ever
      // placed a drawing.
      if (tool === "trendline" || tool === "ruler") {
        if (!pending) {
          useChartStore.getState().setPendingPoint(pt);
        } else {
          useChartStore.getState().addDrawing({
            id: String(Date.now()),
            type: tool,
            points: [pending, pt],
            color: "#2962FF",
            thickness: 2,
          });
          useChartStore.getState().setPendingPoint(null);
          useChartStore.getState().setActiveTool("cursor");
        }
      } else if (tool === "hline") {
        useChartStore.getState().addDrawing({
          id: String(Date.now()),
          type: tool,
          points: [pt],
          color: "#2962FF",
          thickness: 2,
        });
        useChartStore.getState().setActiveTool("cursor");
      }
    });

    // Keyboard delete key listener to remove selected drawing
    const onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = useChartStore.getState().selectedDrawingId;
        if (sel) {
          useChartStore.getState().removeDrawing(sel);
          useChartStore.getState().setSelectedDrawingId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);

    // Sync: register + push visible logical range changes to sub-panes.
    chartSync.registerMain(chart, () => mainSeriesRef.current, () => seriesRef2.current, containerRef.current);
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      chartSync.syncLogicalRange(chart, range);
    });
    chart.subscribeCrosshairMove((param) => {
      chartSync.syncCrosshair(chart, param);
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        chartSync.requestResizeAll();
      }
    });
    ro.observe(containerRef.current);

    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      chartSync.unregisterMain();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      overlaySeriesRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dynamically update timeScale visibility when isBottom changes
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ visible: isBottom });
  }, [isBottom]);

  // Dynamically update watermark text
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const namePart = activeScheme?.name ? activeScheme.name.split(" - ")[0] : "";
    const shortName = namePart.length > 30 ? namePart.substring(0, 30) + "..." : namePart;
    chart.applyOptions({
      watermark: {
        text: `${shortName} (${activeInterval})`,
      },
    });
  }, [activeScheme, activeInterval]);

  // ---- (Re)create main series whenever chartType changes ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current);
      mainSeriesRef.current = null;
    }
    let s;
    if (chartType === "candle" || chartType === "renko" || chartType === "heikinashi") {
      s = chart.addCandlestickSeries({
        upColor: "#089981", downColor: "#f23645",
        borderUpColor: "#089981", borderDownColor: "#f23645",
        wickUpColor: "#089981", wickDownColor: "#f23645",
      });
    } else if (chartType === "area") {
      s = chart.addAreaSeries({
        lineColor: "#2962FF", topColor: "rgba(41,98,255,0.35)", bottomColor: "rgba(41,98,255,0.02)",
        lineWidth: 2,
      });
    } else {
      s = chart.addLineSeries({ color: "#2962FF", lineWidth: 2 });
    }
    mainSeriesRef.current = s;
  }, [chartType]);

  // ---- Push data to main series ----
  useEffect(() => {
    const s = mainSeriesRef.current;
    if (!s) return;
    if (isCandleLike) s.setData(displayOhlc);
    else s.setData(series);
    if (series.length) chartRef.current?.timeScale().fitContent();
    chartSync.syncPriceScaleWidths();
  }, [series, displayOhlc, isCandleLike]);

  // ---- Overlay indicators (SMA / EMA / WMA / BBANDS / VWAP / PSAR / KELT / CHANDELIER / ICHIMOKU / CANDLE_PAT) ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const OVERLAY_TYPES = new Set([
      "SMA", "EMA", "WMA", "BBANDS", "VWAP", "PSAR", "KELT", "CHANDELIER", "ICHIMOKU", "CANDLE_PAT",
    ]);
    const MULTI_KEYS = {
      BBANDS: [":upper", ":lower"],
      KELT: [":upper", ":lower"],
      CHANDELIER: [":long", ":short"],
      ICHIMOKU: [":base", ":spanA", ":spanB"],
    };

    // Collect all live series keys for overlay indicators
    const liveKeys = new Set();
    for (const ind of indicators) {
      if (!OVERLAY_TYPES.has(ind.type)) continue;
      if (ind.type === "CANDLE_PAT") continue; // rendered as markers, not a series
      if (ind.type === "CHANDELIER") {
        liveKeys.add(ind.id + ":long");
        liveKeys.add(ind.id + ":short");
      } else {
        liveKeys.add(ind.id);
        for (const suffix of MULTI_KEYS[ind.type] || []) liveKeys.add(ind.id + suffix);
      }
    }
    // Remove deleted series
    for (const key of Object.keys(overlaySeriesRef.current)) {
      if (!liveKeys.has(key)) {
        try { chart.removeSeries(overlaySeriesRef.current[key]); }
        catch (err) { console.warn("[ChartPane] removeSeries overlay failed:", err); }
        delete overlaySeriesRef.current[key];
      }
    }

    const sourceOhlc = buildOHLC(series);
    const patternMarkers = [];

    const ensureLine = (key, color, width, style) => {
      let s = overlaySeriesRef.current[key];
      if (!s) {
        s = chart.addLineSeries({
          color, lineWidth: width, lineStyle: style,
          priceLineVisible: false, lastValueVisible: false,
        });
        overlaySeriesRef.current[key] = s;
      } else {
        s.applyOptions({ color, lineWidth: width, lineStyle: style });
      }
      return s;
    };

    for (const ind of indicators) {
      if (!OVERLAY_TYPES.has(ind.type)) continue;
      const showTF = ind.showOnTimeframes || ["1D", "1W", "1M"];
      const visibleHere = ind.visible && showTF.includes(activeInterval);

      // ── SMA / EMA / WMA ────────────────────────────────────────
      if (ind.type === "SMA" || ind.type === "EMA" || ind.type === "WMA") {
        const s = ensureLine(ind.id, ind.color, ind.thickness, lsToTV(ind.lineStyle));
        if (!visibleHere) { s.setData([]); continue; }
        const values = pickSource(sourceOhlc, ind.source);
        const fn = ind.type === "SMA" ? sma : ind.type === "EMA" ? ema : wma;
        const out = fn(values, ind.length);
        let pts = series.map((p, i) => ({ time: p.time, ...(out[i] != null ? { value: out[i] } : {}) }));
        if (ind.offset) pts = applyOffset(pts, ind.offset);
        s.setData(pts);
        continue;
      }

      // ── BBANDS ─────────────────────────────────────────────────
      if (ind.type === "BBANDS") {
        const keys   = [ind.id, ind.id + ":upper", ind.id + ":lower"];
        const colors = [ind.color, ind.color2 || "#26A69A", ind.color2 || "#26A69A"];
        keys.forEach((key, ki) => ensureLine(
          key, colors[ki], ki === 0 ? ind.thickness : 1,
          ki === 0 ? lsToTV(ind.lineStyle) : LineStyle.Dashed,
        ));
        if (!visibleHere) { keys.forEach(k => overlaySeriesRef.current[k]?.setData([])); continue; }
        const values = pickSource(sourceOhlc, ind.source);
        const bbOut = bollingerBands(values, ind.length, 2);
        overlaySeriesRef.current[ind.id]           .setData(series.map((p, i) => ({ time: p.time, ...(bbOut[i] ? { value: bbOut[i].middle } : {}) })));
        overlaySeriesRef.current[ind.id + ":upper"].setData(series.map((p, i) => ({ time: p.time, ...(bbOut[i] ? { value: bbOut[i].upper  } : {}) })));
        overlaySeriesRef.current[ind.id + ":lower"].setData(series.map((p, i) => ({ time: p.time, ...(bbOut[i] ? { value: bbOut[i].lower  } : {}) })));
        continue;
      }

      // ── VWAP ───────────────────────────────────────────────────
      if (ind.type === "VWAP") {
        const s = ensureLine(ind.id, ind.color, ind.thickness, lsToTV(ind.lineStyle));
        if (!visibleHere) { s.setData([]); continue; }
        const vwapOut = vwap(
          sourceOhlc.map(b => b.high), sourceOhlc.map(b => b.low),
          sourceOhlc.map(b => b.close), sourceOhlc.map(b => b.volume ?? 1),
        );
        s.setData(series.map((p, i) => ({ time: p.time, ...(vwapOut[i] != null ? { value: vwapOut[i] } : {}) })));
        continue;
      }

      // ── PSAR ───────────────────────────────────────────────────
      if (ind.type === "PSAR") {
        let s = overlaySeriesRef.current[ind.id];
        if (!s) {
          s = chart.addLineSeries({
            color: ind.color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 2,
            priceLineVisible: false, lastValueVisible: false,
          });
          overlaySeriesRef.current[ind.id] = s;
        } else {
          s.applyOptions({ color: ind.color });
        }
        if (!visibleHere) { s.setData([]); continue; }
        const psarOut = psar(sourceOhlc.map(b => b.high), sourceOhlc.map(b => b.low));
        s.setData(series.map((p, i) => ({ time: p.time, ...(psarOut[i] != null ? { value: psarOut[i] } : {}) })));
        continue;
      }

      // ── Keltner Channels ─────────────────────────────────────────
      if (ind.type === "KELT") {
        const keys   = [ind.id, ind.id + ":upper", ind.id + ":lower"];
        const colors = [ind.color, ind.color2 || "#00BCD4", ind.color2 || "#00BCD4"];
        keys.forEach((key, ki) => ensureLine(
          key, colors[ki], ki === 0 ? ind.thickness : 1,
          ki === 0 ? lsToTV(ind.lineStyle) : LineStyle.Dashed,
        ));
        if (!visibleHere) { keys.forEach(k => overlaySeriesRef.current[k]?.setData([])); continue; }
        const keltOut = keltnerChannels(
          sourceOhlc.map(b => b.high), sourceOhlc.map(b => b.low), sourceOhlc.map(b => b.close), ind.length,
        );
        overlaySeriesRef.current[ind.id]           .setData(series.map((p, i) => ({ time: p.time, ...(keltOut[i] ? { value: keltOut[i].middle } : {}) })));
        overlaySeriesRef.current[ind.id + ":upper"].setData(series.map((p, i) => ({ time: p.time, ...(keltOut[i] ? { value: keltOut[i].upper  } : {}) })));
        overlaySeriesRef.current[ind.id + ":lower"].setData(series.map((p, i) => ({ time: p.time, ...(keltOut[i] ? { value: keltOut[i].lower  } : {}) })));
        continue;
      }

      // ── Chandelier Exit (long/short stop lines) ──────────────────
      if (ind.type === "CHANDELIER") {
        const keys   = [ind.id + ":long", ind.id + ":short"];
        const colors = [ind.color, ind.color2 || "#F44336"];
        keys.forEach((key, ki) => ensureLine(key, colors[ki], ind.thickness, LineStyle.Dashed));
        if (!visibleHere) { keys.forEach(k => overlaySeriesRef.current[k]?.setData([])); continue; }
        const chOut = chandelierExit(
          sourceOhlc.map(b => b.high), sourceOhlc.map(b => b.low), sourceOhlc.map(b => b.close), ind.length,
        );
        overlaySeriesRef.current[ind.id + ":long"] .setData(series.map((p, i) => ({ time: p.time, ...(chOut[i] ? { value: chOut[i].exitLong  } : {}) })));
        overlaySeriesRef.current[ind.id + ":short"].setData(series.map((p, i) => ({ time: p.time, ...(chOut[i] ? { value: chOut[i].exitShort } : {}) })));
        continue;
      }

      // ── Ichimoku Cloud (conversion / base / spanA / spanB) ────────
      if (ind.type === "ICHIMOKU") {
        const keys   = [ind.id, ind.id + ":base", ind.id + ":spanA", ind.id + ":spanB"];
        const colors = [ind.color, ind.color2 || "#FF5722", ind.color3 || "#9C27B0", ind.color4 || "#4CAF50"];
        keys.forEach((key, ki) => ensureLine(key, colors[ki], 1, LineStyle.Solid));
        if (!visibleHere) { keys.forEach(k => overlaySeriesRef.current[k]?.setData([])); continue; }
        const ichOut = ichimokuCloud(sourceOhlc.map(b => b.high), sourceOhlc.map(b => b.low), ind.length);
        overlaySeriesRef.current[ind.id]            .setData(series.map((p, i) => ({ time: p.time, ...(ichOut[i] ? { value: ichOut[i].conversion } : {}) })));
        overlaySeriesRef.current[ind.id + ":base"]  .setData(series.map((p, i) => ({ time: p.time, ...(ichOut[i] ? { value: ichOut[i].base       } : {}) })));
        overlaySeriesRef.current[ind.id + ":spanA"] .setData(series.map((p, i) => ({ time: p.time, ...(ichOut[i] ? { value: ichOut[i].spanA      } : {}) })));
        overlaySeriesRef.current[ind.id + ":spanB"] .setData(series.map((p, i) => ({ time: p.time, ...(ichOut[i] ? { value: ichOut[i].spanB      } : {}) })));
        continue;
      }

      // ── Candlestick pattern markers ───────────────────────────────
      if (ind.type === "CANDLE_PAT") {
        if (!visibleHere) continue;
        const hits = detectAllPatterns({
          open: sourceOhlc.map(b => b.open), high: sourceOhlc.map(b => b.high),
          low: sourceOhlc.map(b => b.low), close: sourceOhlc.map(b => b.close),
        });
        // Bars here are synthesized from a single daily NAV value (no real
        // intraday OHLC), so every bar has zero wick/shadow by construction.
        // Wick-dependent patterns (Tweezer, Doji, Hammer, ...) can legitimately
        // fire on most local reversal points as a result. We keep the detector
        // math untouched (it matches the source) but drop inline text labels
        // and cap to one marker per bar, so a long, active range still renders
        // as readable shapes instead of overlapping label soup.
        const seenBarTimes = new Set();
        for (const hit of hits) {
          const bar = series[hit.index];
          if (!bar || seenBarTimes.has(bar.time)) continue;
          seenBarTimes.add(bar.time);
          patternMarkers.push({
            time: bar.time,
            position: hit.sentiment === "bearish" ? "aboveBar" : "belowBar",
            color: hit.sentiment === "bullish" ? "#089981" : hit.sentiment === "bearish" ? "#f23645" : "#787b86",
            shape: hit.sentiment === "bullish" ? "arrowUp" : hit.sentiment === "bearish" ? "arrowDown" : "circle",
          });
        }
        continue;
      }
    }

    if (mainSeriesRef.current) {
      patternMarkers.sort((a, b) => a.time - b.time);
      mainSeriesRef.current.setMarkers(patternMarkers);
    }

    chartSync.syncPriceScaleWidths();
  }, [indicators, series, activeInterval, chartType]);

  // ---- Crosshair mode follows the "crosshair" tool ----
  useEffect(() => {
    chartRef.current?.applyOptions({
      crosshair: { mode: activeTool === "crosshair" ? CrosshairMode.Magnet : CrosshairMode.Normal },
    });
  }, [activeTool]);

  // ---- Render drawings (trendline / hline / ruler) ----
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !mainSeriesRef.current) return;
    const liveIds = new Set(drawings.map((d) => d.id));
    // Remove deleted drawings
    for (const id of Object.keys(drawingSeriesRef.current)) {
      if (!liveIds.has(id)) {
        const ref = drawingSeriesRef.current[id];
        try {
          if (ref.kind === "series") chart.removeSeries(ref.obj);
          else if (ref.kind === "priceLine") mainSeriesRef.current.removePriceLine(ref.obj);
        } catch (err) { console.warn("[ChartPane] remove drawing failed:", err); }
        delete drawingSeriesRef.current[id];
      }
    }
    // Add new drawings
    for (const d of drawings) {
      if (drawingSeriesRef.current[d.id]) continue;
      if (d.type === "hline") {
        const pl = mainSeriesRef.current.createPriceLine({
          price: d.points[0].value,
          color: d.color,
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `H @ ${d.points[0].value.toFixed(2)}`,
        });
        drawingSeriesRef.current[d.id] = { kind: "priceLine", obj: pl };
      } else if (d.type === "trendline" || d.type === "ruler") {
        // Order points ascending by time
        const pts = [...d.points].sort((a, b) => a.time - b.time);
        const up = pts[1].value >= pts[0].value;
        const lineColor = d.type === "ruler" ? (up ? "#089981" : "#f23645") : d.color;
        const s = chart.addLineSeries({
          color: lineColor,
          lineWidth: 2,
          lineStyle: d.type === "ruler" ? LineStyle.Solid : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(pts);
        // Endpoint markers (circles) for both trendline & ruler
        const markers = [
          { time: pts[0].time, position: "inBar", color: lineColor, shape: "circle", size: 1 },
          { time: pts[1].time, position: "inBar", color: lineColor, shape: "circle", size: 1 },
        ];
        // For ruler — append measurement label as a text marker at the end point
        if (d.type === "ruler") {
          const delta = pts[1].value - pts[0].value;
          const pct = pts[0].value ? (delta / pts[0].value) * 100 : 0;
          const t0 = pts[0].time * 1000;
          const t1 = pts[1].time * 1000;
          const days = Math.round((t1 - t0) / 86400000);
          markers.push({
            time: pts[1].time,
            position: up ? "aboveBar" : "belowBar",
            color: lineColor,
            shape: "arrowRight",
            text: `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%) · ${days}d`,
          });
        }
        s.setMarkers(markers);
        drawingSeriesRef.current[d.id] = { kind: "series", obj: s, drawing: d };
      }
    }
    chartSync.syncPriceScaleWidths();
  }, [drawings]);

  // ---- Apply visibleRange (date range zoom) ----
  useEffect(() => {
    if (!series.length || !chartRef.current) return;
    const ts = chartRef.current.timeScale();
    const days = visibleRangeDays[visibleRange];
    if (days === -2 || !days) { ts.fitContent(); return; }
    if (days === -1) {
      const yr = new Date().getUTCFullYear();
      const fromTime = Math.floor(Date.UTC(yr, 0, 1) / 1000);
      ts.setVisibleRange({ from: fromTime, to: series[series.length - 1].time });
      return;
    }
    const lastTime = series[series.length - 1].time;
    const lastDate = new Date(lastTime * 1000);
    const fromDate = new Date(lastDate.getTime() - days * 86400000);
    const fromTime = Math.floor(fromDate.getTime() / 1000);
    ts.setVisibleRange({ from: fromTime, to: lastTime });
  }, [series, visibleRange]);

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    const d = new Date(timestamp * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  // Compute change for readout — follows crosshair when hovering, else last bar
  const lastIdx = series.length - 1;
  const lastBar = series[lastIdx];
  // Resolve hovered index by matching readout.time to series time
  let hoverIdx = -1;
  if (readout?.time && series.length) {
    hoverIdx = series.findIndex((p) => p.time === readout.time);
  }
  const refIdx = hoverIdx >= 0 ? hoverIdx : lastIdx;
  const cur = series[refIdx];
  const prev = refIdx > 0 ? series[refIdx - 1] : null;
  const dayChg = cur && prev ? cur.value - prev.value : 0;
  const dayChgPct = cur && prev && prev.value ? (dayChg / prev.value) * 100 : 0;

  const overlayInds = indicators.filter((i) =>
    ["SMA", "EMA", "WMA", "BBANDS", "VWAP", "PSAR", "KELT", "CHANDELIER", "ICHIMOKU", "CANDLE_PAT"].includes(i.type)
  );

  return (
    <div id={id} style={style} className="chart-pane" data-testid="chart-pane">
      <div className="chart-controls" data-testid="chart-type-group">
        <button
          className={`ct-btn ${chartType === "line" ? "active" : ""}`}
          onClick={() => setChartType("line")}
          title="Line chart"
          data-testid="chart-type-line"
        >
          <LineIcon size={14} />
        </button>
        <button
          className={`ct-btn ${chartType === "candle" ? "active" : ""}`}
          onClick={() => setChartType("candle")}
          title="Candlestick chart"
          data-testid="chart-type-candle"
        >
          <CandlestickChart size={14} />
        </button>
        <button
          className={`ct-btn ${chartType === "area" ? "active" : ""}`}
          onClick={() => setChartType("area")}
          title="Area chart"
          data-testid="chart-type-area"
        >
          <AreaChart size={14} />
        </button>
        <button
          className={`ct-btn ${chartType === "renko" ? "active" : ""}`}
          onClick={() => setChartType("renko")}
          title="Renko chart"
          data-testid="chart-type-renko"
        >
          <BrickWall size={14} />
        </button>
        <button
          className={`ct-btn ${chartType === "heikinashi" ? "active" : ""}`}
          onClick={() => setChartType("heikinashi")}
          title="Heikin-Ashi chart"
          data-testid="chart-type-heikinashi"
        >
          <Waves size={14} />
        </button>
      </div>

      {cur && (
        <div className="chart-readout" data-testid="chart-readout">
          <span className="name">{activeScheme?.name?.slice(0, 30)}</span>
          {" · "}
          <span className="nav">{(readout?.value ?? cur.value).toFixed(4)}</span>
          {" "}
          <span className={`chg ${dayChg >= 0 ? "up" : "down"}`}>
            {dayChg >= 0 ? "+" : ""}{dayChg.toFixed(4)} ({dayChgPct >= 0 ? "+" : ""}{dayChgPct.toFixed(2)}%)
          </span>
          {" · "}
          <span style={{ color: "var(--tv-text-dim)" }}>{formatDate(cur.time)}</span>
        </div>
      )}

      <div className="ind-labels">
        {overlayInds.map((ind) => (
          <div key={ind.id} className="ind-chip" data-testid={`ind-chip-${ind.id}`}>
            <span className="dot" style={{ background: ind.color }} />
            <span>{ind.type}({ind.length})</span>
            <button onClick={() => updateIndicator(ind.id, { visible: !ind.visible })} title="Toggle visibility">
              {ind.visible ? <Eye size={11} /> : <EyeOff size={11} />}
            </button>
            <button onClick={() => openSettings(ind.id)} title="Settings"><Settings2 size={11} /></button>
            <button className="rm" onClick={() => removeIndicator(ind.id)} title="Remove"><X size={11} /></button>
          </div>
        ))}
      </div>

      <div ref={containerRef} className="chart-host"
           style={{ cursor: activeTool === "cursor" || activeTool === "crosshair" ? "default" : "crosshair" }} />

      {/* Drawing tool status banner */}
      {activeTool !== "cursor" && activeTool !== "crosshair" && (
        <div className="tool-banner" data-testid="tool-banner">
          <span className="dot" style={{ background: activeTool === "trendline" ? "#FF6D00" : activeTool === "ruler" ? "#26A69A" : "#2962FF" }} />
          <strong>{activeTool === "hline" ? "Horizontal Line" : activeTool === "trendline" ? "Trend Line" : activeTool === "ruler" ? "Ruler" : "Text"}</strong>
          <span>·&nbsp;
            {activeTool === "hline" && "Click the chart to place a horizontal line."}
            {activeTool === "trendline" && (pendingPoint ? "Click the second point to draw the line." : "Click the first point.")}
            {activeTool === "ruler" && (pendingPoint ? "Click the second point to measure." : "Click the first point.")}
            {activeTool === "text" && "Text annotations are coming soon."}
          </span>
          <button onClick={() => { setActiveTool("cursor"); setPendingPoint(null); }} title="Cancel (Esc)">
            <X size={11} />
          </button>
        </div>
      )}

      {/* Drawings list (right side, below indicators) */}
      {drawings.length > 0 && (
        <div className="drawings-list" data-testid="drawings-list">
          {drawings.map((d) => {
            const isRuler = d.type === "ruler";
            const up = isRuler && d.points[1].value >= d.points[0].value;
            const dotColor = isRuler ? (up ? "#089981" : "#f23645") : d.color;
            const label =
              d.type === "hline" ? `Hline @ ${d.points[0].value.toFixed(2)}` :
              d.type === "trendline" ? `Trend ${d.points[0].value.toFixed(2)}→${d.points[1].value.toFixed(2)}` :
              `Ruler Δ${(d.points[1].value - d.points[0].value).toFixed(2)} (${(((d.points[1].value - d.points[0].value)/d.points[0].value)*100).toFixed(2)}%)`;
            return (
              <div key={d.id} className="ind-chip" data-testid={`drawing-${d.id}`}>
                <span className="dot" style={{ background: dotColor }} />
                <span>{label}</span>
                <button className="rm" onClick={() => removeDrawing(d.id)} title="Remove">
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {loading && (
        <div className="chart-loading"><div className="spinner" /></div>
      )}
    </div>
  );
}
