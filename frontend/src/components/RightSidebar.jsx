import React from "react";
import { Trash2 } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { useSchemeNavHistory } from "../hooks/useSchemeNavHistory";
import { useLatestNav } from "../hooks/useLatestNav";

function WatchlistRow({ item, active, onClick, onRemove }) {
  const { data } = useLatestNav(item.schemeCode);
  const nav = data?.data?.[0]?.nav ? parseFloat(data.data[0].nav) : null;
  const prev = data?._prev_nav;
  const chgPct = nav && prev ? ((nav - prev) / prev) * 100 : null;
  const navDate = data?.data?.[0]?.date || "";
  return (
    <div
      className={`wl-row ${active ? "active" : ""}`}
      onClick={onClick}
      data-testid={`watchlist-row-${item.schemeCode}`}
      data-testid-alias={`watchlist-item-${item.schemeCode}`}
    >
      <div>
        <div className="fund-name" title={item.schemeName}>{item.schemeName}</div>
        <div className="fund-date">{navDate}</div>
      </div>
      <div className="nav">{nav ? nav.toFixed(4) : "…"}</div>
      <div className={`chg ${chgPct >= 0 ? "up" : "down"}`}>
        {chgPct == null ? "—" : `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%`}
      </div>
      <button
        className="rm-btn"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove from watchlist"
        data-testid={`watchlist-remove-${item.schemeCode}`}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function planBadges(name) {
  const n = name.toLowerCase();
  const out = [];
  if (n.includes("direct")) out.push({ cls: "direct", text: "Direct" });
  if (n.includes("growth")) out.push({ cls: "growth", text: "Growth" });
  if (n.includes("idcw") || n.includes("dividend")) out.push({ cls: "idcw", text: "IDCW" });
  return out;
}

function FundDetail() {
  const activeScheme = useChartStore((s) => s.activeScheme);
  const { data: hist } = useSchemeNavHistory(activeScheme?.code);
  const { data: latest } = useLatestNav(activeScheme?.code);

  if (!activeScheme) return null;
  const meta = hist?.meta || {};
  const nav = latest?.data?.[0]?.nav ? parseFloat(latest.data[0].nav) : null;
  const prev =
    latest?._prev_nav ??
    (hist?.data && hist.data.length >= 2 ? parseFloat(hist.data[1].nav) : null);
  const navDate = latest?.data?.[0]?.date || "";
  const chg = nav && prev ? nav - prev : 0;
  const chgPct = nav && prev ? (chg / prev) * 100 : 0;

  // CAGR
  let cagr = null;
  let firstDate = null;
  if (hist?.data?.length >= 2) {
    const newest = parseFloat(hist.data[0].nav);
    const oldest = parseFloat(hist.data[hist.data.length - 1].nav);
    const [dd, mm, yyyy] = hist.data[hist.data.length - 1].date.split("-");
    firstDate = `${yyyy}-${mm}-${dd}`;
    const years = (Date.now() - new Date(firstDate + "T00:00:00Z").getTime()) / (365.25 * 86400000);
    if (years > 0.1 && oldest > 0) {
      cagr = (Math.pow(newest / oldest, 1 / years) - 1) * 100;
    }
  }

  return (
    <div className="rs-section" data-testid="fund-detail">
      <div className="title">Fund Detail</div>
      <div className="fd-name">{activeScheme.name}</div>
      <div className="fd-nav">{nav ? `₹${nav.toFixed(4)}` : "—"}</div>
      <div className={`fd-change ${chg >= 0 ? "up" : "down"}`}>
        {chg >= 0 ? "+" : ""}{chg.toFixed(4)} ({chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%) · {navDate}
      </div>
      <div className="fd-badges">
        {planBadges(activeScheme.name).map((b, i) => (
          <span key={i} className={`fd-badge ${b.cls}`}>{b.text}</span>
        ))}
      </div>
      <div className="fd-rows">
        <div className="label">Fund House</div>
        <div className="value">{meta.fund_house || "—"}</div>
        <div className="label">Category</div>
        <div className="value">{meta.scheme_category || "—"}</div>
        <div className="label">Type</div>
        <div className="value">{meta.scheme_type || "—"}</div>
        <div className="label">ISIN (Growth)</div>
        <div className="value">{meta.isin_growth || "—"}</div>
        <div className="label">NAV Points</div>
        <div className="value">{hist?.data?.length || 0}</div>
        <div className="label">CAGR (inception)</div>
        <div className="value" style={{ color: cagr >= 0 ? "var(--tv-green)" : "var(--tv-red)" }}>
          {cagr != null ? `${cagr.toFixed(2)}%` : "—"}
        </div>
      </div>
    </div>
  );
}

const NEWS = [
  { title: "SEBI's new MF disclosure norms take effect", meta: "Moneycontrol · 2h ago" },
  { title: "Equity inflows hit a 6-month high in Indian MFs", meta: "Economic Times · 5h ago" },
  { title: "RBI rate decision: implications for debt funds", meta: "Mint · 1d ago" },
  { title: "Small-cap funds: still room to run?", meta: "LiveMint · 2d ago" },
];

export default function RightSidebar() {
  const watchlist = useChartStore((s) => s.watchlist);
  const activeScheme = useChartStore((s) => s.activeScheme);
  const setActiveScheme = useChartStore((s) => s.setActiveScheme);
  const removeFromWatchlist = useChartStore((s) => s.removeFromWatchlist);

  return (
    <aside className="right-sidebar" data-testid="right-sidebar">
      <div className="rs-section">
        <div className="title">Watchlist · {watchlist.length}</div>
        <div className="wl-header">
          <span>FUND</span>
          <span style={{ textAlign: "right" }}>NAV</span>
          <span style={{ textAlign: "right" }}>CHG%</span>
          <span />
        </div>
        {watchlist.length === 0 && (
          <div style={{ color: "var(--tv-text-dim)", padding: "12px 0", fontSize: 11 }}>
            Search and select a fund to add it here.
          </div>
        )}
        {watchlist.map((item) => (
          <WatchlistRow
            key={item.schemeCode}
            item={item}
            active={activeScheme?.code === item.schemeCode}
            onClick={() => setActiveScheme(item.schemeCode, item.schemeName)}
            onRemove={() => removeFromWatchlist(item.schemeCode)}
          />
        ))}
      </div>

      <FundDetail />

      <div className="rs-section">
        <div className="title">Market News</div>
        {NEWS.map((n, i) => (
          <div key={i} className="news-row">
            <div className="news-title">{n.title}</div>
            <div className="news-meta">{n.meta}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
