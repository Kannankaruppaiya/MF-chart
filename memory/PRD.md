# MF Chart — Product Requirements

## Original Problem Statement
A TradingView-inspired Mutual Fund NAV Charting Platform for Indian Mutual Funds, backed by MFapi.in (37,000+ schemes). Users can search funds, chart NAV (Line/Candle/Area), switch intervals (1D/1W/1M), add SMA/EMA overlays and ROC/RSI sub-pane indicators with full Inputs/Style/Visibility settings, watchlist with persisted localStorage, fund detail card with metadata + CAGR, date-range zoom (1D…All), and IST clock.

## Architecture (adapted to platform standard)
- **Backend**: FastAPI on port 8001 — proxies https://api.mfapi.in with TTL in-memory cache; preloads 37,000+ scheme index at startup for instant in-memory all-words match search.
- **Frontend**: React (CRA) on port 3000 — lightweight-charts v4, zustand (persisted to localStorage), lucide-react icons. Pure CSS dark TradingView theme.
- **Data source**: MFapi.in (no auth)
- **DB**: MongoDB (configured but currently unused — watchlist lives in localStorage only)

## User Personas
- Retail investor tracking personal MF watchlist & technical signals
- DIY analyst comparing momentum & moving averages across MFs

## Core Requirements (static)
1. Search any of 37k+ MF schemes by name or AMC
2. Render Line / Candle / Area chart of full NAV history
3. Resample to 1D / 1W / 1M intervals
4. Add overlay indicators SMA, EMA (drawn on price chart)
5. Add sub-pane indicators ROC, RSI (with 70/30 / 0 guide lines)
6. Configure every indicator: length, source price (close/open/high/low/hl2/hlc3/ohlc4), offset bars, timeframe override, wait-for-close, color, thickness (1–4px), line style (solid/dashed/dotted), per-interval visibility checkboxes
7. Watchlist with live NAV + day-change %, persisted across reload (max 20 items)
8. Fund detail card: fund house, category, type, ISIN, NAV points, CAGR since inception, plan badges
9. Date range zoom buttons: 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, All
10. Bottom bar: live IST clock + AMFI feed indicator

## What's been implemented (2026-06-29)
- ✅ Backend `/api/health`, `/api/mf/search`, `/api/mf/{code}`, `/api/mf/{code}/latest` with TTL cache (24h history, 15m latest) and 37,647-scheme in-memory index
- ✅ TopToolbar: fund search dropdown (300ms debounce, top-15 results, "N more" hint), interval 1D/1W/1M, indicator picker button
- ✅ ChartPane: lightweight-charts canvas with Line / Candle / Area types, crosshair readout (NAV + Δ + Δ%), SMA/EMA overlay series, keyboard zoom (+ / - / Esc), ResizeObserver, indicator chips (eye/settings/remove)
- ✅ IndicatorSubPane: dedicated ROC/RSI chart with guide lines, settings/visibility/remove
- ✅ IndicatorPicker modal & IndicatorSettingsModal (Inputs / Style / Visibility tabs, live preview line)
- ✅ RightSidebar: Watchlist (sortable rows w/ trash, persists 20 items max), Fund Detail card (fund house, category, type, ISIN, NAV points, CAGR, plan badges), Market News
- ✅ BottomBar: 9 range pills (1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y, All) + live IST clock
- ✅ DrawToolRail (cursor/crosshair/trendline/hline/ruler/text icons — interactive selection only)
- ✅ Backend `_prev_nav` self-warms history cache if cold, so day-change % is correct on first call
- ✅ Frontend FundDetail derives prev NAV from history as fallback
- ✅ Tested by automation: 100% backend pass, ~90% frontend pass

## Prioritized backlog
- P1: Multiple simultaneous sub-pane indicators (currently shows only most-recently added ROC/RSI)
- P2: Compare mode (overlay multiple funds on same chart, percent-rebased)
- P2: Drawing tool persistence (trendlines / hlines) — currently only icon UI
- P2: Server-side watchlist sync (would need auth) for cross-device
- P3: News feed from a real RSS source
- P3: PDF/PNG export of chart snapshot

## Next tasks
- Optionally call testing agent to verify the _prev_nav fix & day-change accuracy across newly switched funds
- Productionize: production build, deployment

## Known constraints
- Upstream MFapi.in may be slow on cold cache (mitigated by 24h TTL)
- Search uses all-words match — "SBI Bluechip" returns 0 because no scheme literally contains both tokens (try "SBI Large Cap" instead)
- "Wait for timeframe closes" is stored in indicator config but treated as informational (no impact on current real-time-only NAV data)
