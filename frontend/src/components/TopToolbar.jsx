import React, { useEffect, useRef, useState } from "react";
import { Search, Plus, LineChart, CandlestickChart, Activity } from "lucide-react";
import { useChartStore } from "../store/chartStore";
import { useSchemeSearch } from "../hooks/useSchemeSearch";

const INTERVALS = ["1D", "1W", "1M"];

export default function TopToolbar({ onOpenIndicators }) {
  const activeScheme = useChartStore((s) => s.activeScheme);
  const setActiveScheme = useChartStore((s) => s.setActiveScheme);
  const activeInterval = useChartStore((s) => s.activeInterval);
  const setActiveInterval = useChartStore((s) => s.setActiveInterval);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const { results, total, loading } = useSchemeSearch(q);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const onClick = (e) => {
      if (!e.target.closest(".search-pop") && !e.target.closest(".tt-fund")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (r) => {
    setActiveScheme(r.schemeCode, r.schemeName);
    setOpen(false);
    setQ("");
  };

  return (
    <div className="top-toolbar" style={{ position: "relative" }} data-testid="top-toolbar">
      <button
        className="tt-fund"
        onClick={() => setOpen((v) => !v)}
        data-testid="fund-selector-btn"
        title="Search funds"
      >
        <Search size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
          {activeScheme?.name || "Select a fund"}
        </span>
        <span className="tt-fund-code">#{activeScheme?.code}</span>
      </button>

      {open && (
        <div className="search-pop" data-testid="search-dropdown">
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search by fund name, AMC, or scheme code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="search-input"
          />
          <div className="search-results">
            {loading && <div className="search-meta">Searching…</div>}
            {!loading && q && results.length === 0 && (
              <div className="search-meta">No funds found.</div>
            )}
            {results.map((r) => (
              <div
                key={r.schemeCode}
                className="search-row"
                onClick={() => pick(r)}
                data-testid={`search-result-${r.schemeCode}`}
              >
                <div className="name" title={r.schemeName}>{r.schemeName}</div>
                <div className="code">#{r.schemeCode}</div>
              </div>
            ))}
            {total > results.length && (
              <div className="search-meta">{total - results.length} more — refine your search</div>
            )}
          </div>
        </div>
      )}

      <div className="tt-divider" />

      <div className="tt-interval" data-testid="interval-group">
        {INTERVALS.map((iv) => (
          <button
            key={iv}
            className={`tt-btn ${activeInterval === iv ? "active" : ""}`}
            onClick={() => setActiveInterval(iv)}
            data-testid={`interval-${iv}`}
          >
            {iv}
          </button>
        ))}
      </div>

      <div className="tt-divider" />

      <button
        className="tt-btn"
        onClick={onOpenIndicators}
        data-testid="add-indicator-btn"
      >
        <Plus size={14} />
        Indicators
      </button>

      <div style={{ flex: 1 }} />

      <div className="tt-btn" style={{ pointerEvents: "none", color: "var(--tv-text-dim)" }}>
        <Activity size={14} />
        MF Chart
      </div>
    </div>
  );
}
