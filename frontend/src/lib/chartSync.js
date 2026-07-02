// Shared, non-React ref registry so ChartPane <-> IndicatorSubPane can sync
// their time-scale visible range and crosshair without prop-drilling.

const state = {
  main: null,        // { chart, series, getData }
  subs: new Map(),   // id -> { chart, series, getData }
  syncing: false,    // reentrancy guard
};

function logicalRangesAreEqual(r1, r2) {
  if (!r1 || !r2) return r1 === r2;
  return r1.from === r2.from && r1.to === r2.to;
}



export const PRICE_SCALE_MIN_WIDTH = 95;

let resizeRequested = false;

export const chartSync = {
  registerMain(chart, series, getData, container) {
    state.main = { chart, series, getData, container };
    this.syncPriceScaleWidths();
  },
  unregisterMain() {
    state.main = null;
  },
  registerSub(id, chart, series, getData, container) {
    state.subs.set(id, { chart, series, getData, container });
    this.syncPriceScaleWidths();
  },
  unregisterSub(id) {
    state.subs.delete(id);
  },
  getMain() {
    return state.main;
  },
  getSubs() {
    return Array.from(state.subs.values());
  },
  withGuard(fn) {
    if (state.syncing) return;
    state.syncing = true;
    try { fn(); } finally { state.syncing = false; }
  },
  requestResizeAll() {
    if (resizeRequested) return;
    resizeRequested = true;
    requestAnimationFrame(() => {
      resizeRequested = false;
      this.resizeAll();
    });
  },
  resizeAll() {
    this.withGuard(() => {
      if (state.main && state.main.container) {
        const { clientWidth, clientHeight } = state.main.container;
        if (clientWidth > 0 && clientHeight > 0) {
          try {
            state.main.chart.resize(clientWidth, clientHeight);
          } catch (err) {
            console.warn("[chartSync] main resize failed:", err);
          }
        }
      }
      for (const sub of state.subs.values()) {
        if (sub.container) {
          const { clientWidth, clientHeight } = sub.container;
          if (clientWidth > 0 && clientHeight > 0) {
            try {
              sub.chart.resize(clientWidth, clientHeight);
            } catch (err) {
              console.warn("[chartSync] sub resize failed:", err);
            }
          }
        }
      }
      if (state.main) {
        const range = state.main.chart.timeScale().getVisibleLogicalRange();
        if (range) {
          for (const sub of state.subs.values()) {
            try {
              sub.chart.timeScale().setVisibleLogicalRange(range);
            } catch (err) {
              console.warn("[chartSync] post-resize align failed:", err);
            }
          }
        }
      }
    });
    this.syncPriceScaleWidths();
  },
  // Synchronize crosshair from any source chart (main or sub) to all other charts.
  // All series share identical timestamps, so an exact-time lookup always succeeds.
  syncCrosshair(sourceChart, param) {
    this.withGuard(() => {
      const time = param && param.time;
      if (state.main && state.main.chart !== sourceChart) {
        try {
          if (time !== undefined && time !== null) {
            const data = state.main.getData();
            const pt = data ? data.find((d) => d.time === time) : null;
            const val = pt ? (pt.value !== undefined ? pt.value : pt.close) : undefined;
            if (val !== undefined) {
              state.main.chart.setCrosshairPosition(val, time, state.main.series());
            } else {
              state.main.chart.clearCrosshairPosition();
            }
          } else {
            state.main.chart.clearCrosshairPosition();
          }
        } catch (err) {
          console.warn("[chartSync] main crosshair sync failed:", err);
        }
      }
      for (const sub of state.subs.values()) {
        if (sub.chart === sourceChart) continue;
        try {
          if (time !== undefined && time !== null) {
            const data = sub.getData();
            const pt = data ? data.find((d) => d.time === time) : null;
            const val = pt ? (pt.value !== undefined ? pt.value : pt.close) : undefined;
            if (val !== undefined) {
              sub.chart.setCrosshairPosition(val, time, sub.series());
            } else {
              sub.chart.clearCrosshairPosition();
            }
          } else {
            sub.chart.clearCrosshairPosition();
          }
        } catch (err) {
          console.warn("[chartSync] sub crosshair sync failed:", err);
        }
      }
    });
  },
  // Synchronize visible logical range from any source chart to all other charts
  syncLogicalRange(sourceChart, range) {
    if (!range) return;
    this.withGuard(() => {
      if (state.main && state.main.chart !== sourceChart) {
        try {
          const cur = state.main.chart.timeScale().getVisibleLogicalRange();
          if (!logicalRangesAreEqual(cur, range)) {
            state.main.chart.timeScale().setVisibleLogicalRange(range);
          }
        } catch (err) {
          console.warn("[chartSync] main logical range sync failed:", err);
        }
      }
      for (const sub of state.subs.values()) {
        if (sub.chart === sourceChart) continue;
        try {
          const cur = sub.chart.timeScale().getVisibleLogicalRange();
          if (!logicalRangesAreEqual(cur, range)) {
            sub.chart.timeScale().setVisibleLogicalRange(range);
          }
        } catch (err) {
          console.warn("[chartSync] sub logical range sync failed:", err);
        }
      }
    });
    this.syncPriceScaleWidths();
  },
  // Synchronize visible time range from any source chart to all other charts
  syncTimeRange(sourceChart, range) {
    if (!range) return;
    this.withGuard(() => {
      if (state.main && state.main.chart !== sourceChart) {
        try {
          const cur = state.main.chart.timeScale().getVisibleRange();
          if (!cur || cur.from !== range.from || cur.to !== range.to) {
            state.main.chart.timeScale().setVisibleRange(range);
          }
        } catch (err) {
          console.warn("[chartSync] main time range sync failed:", err);
        }
      }
      for (const sub of state.subs.values()) {
        if (sub.chart === sourceChart) continue;
        try {
          const cur = sub.chart.timeScale().getVisibleRange();
          if (!cur || cur.from !== range.from || cur.to !== range.to) {
            sub.chart.timeScale().setVisibleRange(range);
          }
        } catch (err) {
          console.warn("[chartSync] sub time range sync failed:", err);
        }
      }
    });
    this.syncPriceScaleWidths();
  },
  // Dynamically synchronize the price scale width across all active charts
  syncPriceScaleWidths() {
    requestAnimationFrame(() => {
      this.withGuard(() => {
        let maxWidth = PRICE_SCALE_MIN_WIDTH;

        if (state.main && state.main.chart) {
          try {
            const w = state.main.chart.priceScale("right").width();
            if (w > maxWidth) maxWidth = w;
          } catch (e) {}
        }

        for (const sub of state.subs.values()) {
          if (sub.chart) {
            try {
              const w = sub.chart.priceScale("right").width();
              if (w > maxWidth) maxWidth = w;
            } catch (e) {}
          }
        }

        // Apply calculated maxWidth as the new minimumWidth to all scales if changed
        if (state.main && state.main.chart) {
          try {
            const currentMin = state.main.chart.priceScale("right").options().minimumWidth;
            if (currentMin !== maxWidth) {
              state.main.chart.priceScale("right").applyOptions({ minimumWidth: maxWidth });
            }
          } catch (e) {}
        }

        for (const sub of state.subs.values()) {
          if (sub.chart) {
            try {
              const currentMin = sub.chart.priceScale("right").options().minimumWidth;
              if (currentMin !== maxWidth) {
                sub.chart.priceScale("right").applyOptions({ minimumWidth: maxWidth });
              }
            } catch (e) {}
          }
        }
      });
    });
  },
};
