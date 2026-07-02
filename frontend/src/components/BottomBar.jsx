import React, { useEffect, useState } from "react";
import { useChartStore } from "../store/chartStore";

const RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "All"];

export default function BottomBar() {
  const visibleRange = useChartStore((s) => s.visibleRange);
  const setVisibleRange = useChartStore((s) => s.setVisibleRange);

  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      // IST = UTC + 5:30
      const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000 + now.getTimezoneOffset() * 60000);
      const hh = String(ist.getUTCHours()).padStart(2, "0");
      const mm = String(ist.getUTCMinutes()).padStart(2, "0");
      const ss = String(ist.getUTCSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss} IST`);
    };
    tick();
    const h = setInterval(tick, 1000);
    return () => clearInterval(h);
  }, []);

  return (
    <div className="bottom-bar" data-testid="bottom-bar">
      <div className="range-pills" data-testid="range-pills">
        {RANGES.map((r) => (
          <button
            key={r}
            className={`range-pill ${visibleRange === r ? "active" : ""}`}
            onClick={() => setVisibleRange(r)}
            data-testid={`range-${r}`}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="bb-status">
        <span><span className="live-dot" />AMFI feed</span>
        <span className="clock" data-testid="ist-clock">{clock}</span>
      </div>
    </div>
  );
}
