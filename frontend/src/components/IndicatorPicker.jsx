import React from "react";
import { X } from "lucide-react";
import { useChartStore } from "../store/chartStore";

const OVERLAY_TYPES = [
  { type: "SMA", name: "SMA — Simple Moving Average",      desc: "Arithmetic mean of last N values. Overlay on price pane." },
  { type: "EMA", name: "EMA — Exponential Moving Average", desc: "Weighted average favoring recent values. Overlay on price pane." },
];

const OSCILLATOR_TYPES = [
  { type: "RSI", name: "RSI — Relative Strength Index", desc: "Wilder's momentum oscillator (0–100). Sub-pane." },
  { type: "ROC", name: "ROC — Rate of Change",          desc: "% momentum over N bars. Sub-pane oscillator." },
];


export default function IndicatorPicker() {
  const open = useChartStore((s) => s.pickerOpen);
  const setOpen = useChartStore((s) => s.setPickerOpen);
  const addIndicator = useChartStore((s) => s.addIndicator);

  if (!open) return null;

  const add = (t) => {
    addIndicator(t);
    setOpen(false);
  };

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)} data-testid="indicator-picker">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Add Indicator</span>
          <button onClick={() => setOpen(false)} data-testid="picker-close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <div className="picker-section-label">Overlays — render on price pane</div>
          <div className="picker-grid">
            {OVERLAY_TYPES.map((t) => (
              <button
                key={t.type}
                className="picker-card"
                onClick={() => add(t.type)}
                data-testid={`picker-${t.type}`}
              >
                <div className="pc-name">{t.name}</div>
                <div className="pc-desc">{t.desc}</div>
              </button>
            ))}
          </div>
          <div className="picker-section-label" style={{ marginTop: 14 }}>Oscillators — render in sub-pane</div>
          <div className="picker-grid">
            {OSCILLATOR_TYPES.map((t) => (
              <button
                key={t.type}
                className="picker-card"
                onClick={() => add(t.type)}
                data-testid={`picker-${t.type}`}
              >
                <div className="pc-name">{t.name}</div>
                <div className="pc-desc">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
