import React from "react";
import { MousePointer2, TrendingUp, Minus, Ruler, Type, Crosshair, Trash2 } from "lucide-react";
import { useChartStore } from "../store/chartStore";

const TOOLS = [
  { id: "cursor", icon: MousePointer2, label: "Cursor" },
  { id: "crosshair", icon: Crosshair, label: "Magnet Crosshair" },
  { id: "trendline", icon: TrendingUp, label: "Trend Line (click 2 points)" },
  { id: "hline", icon: Minus, label: "Horizontal Line (click 1 point)" },
  { id: "ruler", icon: Ruler, label: "Measure (click 2 points)" },
  { id: "text", icon: Type, label: "Text (coming soon)" },
];

export default function DrawToolRail() {
  const active = useChartStore((s) => s.activeTool);
  const setActive = useChartStore((s) => s.setActiveTool);
  const setPending = useChartStore((s) => s.setPendingPoint);
  const clearDrawings = useChartStore((s) => s.clearDrawings);
  const drawings = useChartStore((s) => s.drawings);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setActive("cursor");
        setPending(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive, setPending]);

  return (
    <div className="draw-rail" data-testid="draw-rail">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`dr-btn ${active === t.id ? "active" : ""}`}
          title={t.label}
          onClick={() => { setActive(t.id); setPending(null); }}
          data-testid={`draw-tool-${t.id}`}
        >
          <t.icon size={16} />
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        className="dr-btn"
        title={`Clear all drawings (${drawings.length})`}
        onClick={clearDrawings}
        disabled={drawings.length === 0}
        data-testid="draw-tool-clear"
        style={{ opacity: drawings.length ? 1 : 0.4 }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
