import { create } from "zustand";
import { persist } from "zustand/middleware";

const WATCHLIST_MAX = 20;

const nextId = () => `ind-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

// Supported indicators: SMA/EMA overlays on the price pane, ROC/RSI sub-panes.
const defaultsByType = {
  SMA: { length: 20, color: "#2962FF" },
  EMA: { length: 50, color: "#FF6D00" },
  ROC: { length: 9,  color: "#26A69A" },
  RSI: { length: 14, color: "#AB47BC" },
};

export const INDICATOR_TYPES = Object.keys(defaultsByType);

const makeIndicator = (type) => ({
  id: nextId(),
  type,
  length: defaultsByType[type].length,
  source: "close",
  color: defaultsByType[type].color,
  lineStyle: "solid",
  // Default to a thin 1px line (matches TradingView's default indicator
  // weight). A thicker stroke visually rounds off sharp peaks/troughs on
  // fast-moving oscillators like ROC — confirmed by A/B screenshot comparison
  // at 1px vs 2px on the same data. Still user-adjustable via Settings > Style.
  thickness: 1,
  visible: true,
  showOnTimeframes: ["1D", "1W", "1M"],
  offset: 0,
  // Calculation timeframe (TradingView-style MTF): undefined = chart interval.
  // waitForClose: only emit confirmed values at higher-timeframe closes.
  timeframe: undefined,
  waitForClose: true,
});


export const useChartStore = create(
  persist(
    (set, get) => ({
      // Layout state
      paneWeights: {},
      setPaneWeights: (weights) => set({ paneWeights: weights }),

      // Active fund being charted
      activeScheme: { code: 119551, name: "Aditya Birla Sun Life Banking & PSU Debt Fund - DIRECT - IDCW" },
      setActiveScheme: (code, name) => {
        set({ activeScheme: { code, name } });
        get().addToWatchlist(code, name);
      },

      // Chart config
      chartType: "line", // "line" | "candle" | "area"
      setChartType: (t) => set({ chartType: t }),

      activeInterval: "1D",
      setActiveInterval: (i) => set({ activeInterval: i }),

      visibleRange: "1Y",
      setVisibleRange: (r) => set({ visibleRange: r }),

      // Watchlist (persisted)
      watchlist: [],
      addToWatchlist: (code, name) => {
        const wl = get().watchlist;
        if (wl.find((w) => w.schemeCode === code)) return;
        const next = [...wl, { schemeCode: code, schemeName: name, addedAt: Date.now() }];
        if (next.length > WATCHLIST_MAX) next.shift();
        set({ watchlist: next });
      },
      removeFromWatchlist: (code) =>
        set({ watchlist: get().watchlist.filter((w) => w.schemeCode !== code) }),

      // Indicators
      indicators: [],
      addIndicator: (type) => {
        if (!defaultsByType[type]) return;
        set({ indicators: [...get().indicators, makeIndicator(type)] });
      },
      removeIndicator: (id) =>
        set({ indicators: get().indicators.filter((ind) => ind.id !== id) }),
      updateIndicator: (id, patch) =>
        set({
          indicators: get().indicators.map((ind) =>
            ind.id === id ? { ...ind, ...patch } : ind
          ),
        }),

      // Modal state (not persisted)
      settingsModalId: null,
      openSettings: (id) => set({ settingsModalId: id }),
      closeSettings: () => set({ settingsModalId: null }),

      pickerOpen: false,
      setPickerOpen: (v) => set({ pickerOpen: v }),

      // Drawing tools
      activeTool: "cursor", // cursor | crosshair | trendline | hline | ruler | text
      setActiveTool: (t) => set({ activeTool: t }),
      drawings: [], // { id, type, points: [{time, value}], color }
      pendingPoint: null, // first click for 2-point tools
      setPendingPoint: (p) => set({ pendingPoint: p }),
      addDrawing: (d) => set({ drawings: [...get().drawings, d], pendingPoint: null }),
      removeDrawing: (id) => set({ drawings: get().drawings.filter((d) => d.id !== id) }),
      clearDrawings: () => set({ drawings: [], pendingPoint: null }),
    }),
    {
      name: "mf-chart-store",
      version: 3,
      // v3: only SMA/EMA/ROC/RSI survive; drop removed indicator types and
      // their multi-line colors from previously persisted sessions, plus pane
      // weights for panes that no longer exist.
      migrate: (persisted) => {
        if (!persisted) return persisted;
        const indicators = (persisted.indicators || [])
          .filter((ind) => defaultsByType[ind.type])
          .map(({ color2, color3, color4, ...rest }) => ({
            waitForClose: true,
            ...rest,
          }));
        const liveIds = new Set(["main", ...indicators.map((i) => i.id)]);
        const paneWeights = {};
        for (const [k, v] of Object.entries(persisted.paneWeights || {})) {
          if (liveIds.has(k)) paneWeights[k] = v;
        }
        return { ...persisted, indicators, paneWeights };
      },
      partialize: (state) => ({
        watchlist: state.watchlist,
        chartType: state.chartType,
        activeInterval: state.activeInterval,
        visibleRange: state.visibleRange,
        indicators: state.indicators,
        activeScheme: state.activeScheme,
        drawings: state.drawings,
        paneWeights: state.paneWeights,
      }),
    }
  )
);
