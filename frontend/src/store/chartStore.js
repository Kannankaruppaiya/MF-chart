import { create } from "zustand";
import { persist } from "zustand/middleware";

const WATCHLIST_MAX = 20;

const nextId = () => `ind-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

const defaultsByType = {
  SMA:    { length: 20,  color: "#2962FF" },
  EMA:    { length: 50,  color: "#FF6D00" },
  ROC:    { length: 9,   color: "#26A69A" },
  RSI:    { length: 14,  color: "#AB47BC" },
  // Pre-existing indicators
  MACD:   { length: 26,  color: "#2962FF",  color2: "#FF6D00",  color3: "#26A69A" },
  BBANDS: { length: 20,  color: "#2962FF",  color2: "#26A69A",  color3: "#26A69A" },
  ATR:    { length: 14,  color: "#F06292" },
  STOCH:  { length: 14,  color: "#2962FF",  color2: "#FF6D00" },
  ADX:    { length: 14,  color: "#2962FF",  color2: "#26A69A",  color3: "#F06292" },
  WPCTR:  { length: 14,  color: "#AB47BC" },
  OBV:    { length: 1,   color: "#26C6DA" },
  VWAP:   { length: 1,   color: "#E040FB" },
  // New overlay indicators
  WMA:         { length: 20,  color: "#FF9800" },
  PSAR:        { length: 1,   color: "#E91E63" },
  KELT:        { length: 20,  color: "#00BCD4",  color2: "#00BCD4" },
  CHANDELIER:  { length: 22,  color: "#4CAF50",  color2: "#F44336" },
  ICHIMOKU:    { length: 9,   color: "#2196F3",  color2: "#FF5722",  color3: "#9C27B0",  color4: "#4CAF50" },
  // New oscillator indicators
  CCI:         { length: 20,  color: "#FF9800" },
  AO:          { length: 5,   color: "#00BCD4" },
  MFI:         { length: 14,  color: "#E040FB" },
  ADL:         { length: 1,   color: "#26C6DA" },
  FORCEIDX:    { length: 13,  color: "#F06292" },
  STOCHRSI:    { length: 14,  color: "#2962FF",  color2: "#FF6D00" },
  TRIX:        { length: 18,  color: "#AB47BC" },
  KST:         { length: 10,  color: "#26A69A",  color2: "#FF9800" },
  // Candlestick patterns (overlay on price pane, no sub-pane)
  CANDLE_PAT:  { length: 1,   color: "#FFD700" },
};

const makeIndicator = (type) => ({
  id: nextId(),
  type,
  length: defaultsByType[type].length,
  source: "close",
  color: defaultsByType[type].color,
  color2: defaultsByType[type].color2 || undefined,
  color3: defaultsByType[type].color3 || undefined,
  color4: defaultsByType[type].color4 || undefined,
  lineStyle: "solid",
  // Default to a thin 1px line (matches TradingView's default indicator
  // weight). A thicker stroke visually rounds off sharp peaks/troughs on
  // fast-moving oscillators like ROC — confirmed by A/B screenshot comparison
  // at 1px vs 2px on the same data. Still user-adjustable via Settings > Style.
  thickness: 1,
  visible: true,
  timeframe: undefined,
  showOnTimeframes: ["1D", "1W", "1M"],
  waitForClose: false,
  offset: 0,
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
      addIndicator: (type) => set({ indicators: [...get().indicators, makeIndicator(type)] }),
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
