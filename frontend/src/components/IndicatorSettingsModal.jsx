import React, { useState } from "react";
import { X } from "lucide-react";
import { useChartStore } from "../store/chartStore";

const SOURCES = [
  { v: "close", label: "Close" },
  { v: "open", label: "Open" },
  { v: "high", label: "High" },
  { v: "low", label: "Low" },
  { v: "hl2", label: "HL2" },
  { v: "hlc3", label: "HLC3" },
  { v: "ohlc4", label: "OHLC4" },
];
const TIMEFRAMES = [
  { v: "", label: "Inherit chart interval" },
  { v: "1D", label: "1D — Daily" },
  { v: "1W", label: "1W — Weekly" },
  { v: "1M", label: "1M — Monthly" },
];
const TFS = ["1D", "1W", "1M"];

export default function IndicatorSettingsModal() {
  const id = useChartStore((s) => s.settingsModalId);
  const close = useChartStore((s) => s.closeSettings);
  const ind = useChartStore((s) => s.indicators.find((i) => i.id === id));
  const update = useChartStore((s) => s.updateIndicator);

  const [tab, setTab] = useState("inputs");

  if (!ind) return null;
  const set = (p) => update(ind.id, p);
  const dashArray = ind.lineStyle === "dashed" ? "8 4" : ind.lineStyle === "dotted" ? "2 4" : "0";

  return (
    <div className="modal-backdrop" onClick={close} data-testid="indicator-settings-modal">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{ind.type} ({ind.length}) · Settings</span>
          <button onClick={close} data-testid="settings-close"><X size={16} /></button>
        </div>
        <div className="modal-tabs">
          {["inputs", "style", "visibility"].map((t) => (
            <button
              key={t}
              className={`modal-tab ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
              data-testid={`settings-tab-${t}`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "inputs" && (
            <>
              <div className="field-row">
                <div className="field">
                  <label>Length</label>
                  <input
                    type="number"
                    min={1} max={500}
                    value={ind.length}
                    onChange={(e) => set({ length: Math.max(1, parseInt(e.target.value) || 1) })}
                    data-testid="setting-length"
                  />
                </div>
                <div className="field">
                  <label>Source</label>
                  <select
                    value={ind.source}
                    onChange={(e) => set({ source: e.target.value })}
                    data-testid="setting-source"
                  >
                    {SOURCES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Offset (bars)</label>
                  <input
                    type="number" min={-100} max={100}
                    value={ind.offset ?? 0}
                    onChange={(e) => set({ offset: parseInt(e.target.value) || 0 })}
                    data-testid="setting-offset"
                  />
                </div>
                <div className="field">
                  <label>Timeframe override</label>
                  <select
                    value={ind.timeframe || ""}
                    onChange={(e) => set({ timeframe: e.target.value || undefined })}
                    data-testid="setting-timeframe"
                  >
                    {TIMEFRAMES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="field-checkbox">
                  <input
                    type="checkbox"
                    checked={!!ind.waitForClose}
                    onChange={(e) => set({ waitForClose: e.target.checked })}
                    data-testid="setting-wait-close"
                  />
                  <span>Wait for timeframe closes</span>
                </label>
              </div>
            </>
          )}

          {tab === "style" && (
            <>
              <div className="field">
                <label>Line Color</label>
                <div className="field-color">
                  <input
                    type="color"
                    value={ind.color}
                    onChange={(e) => set({ color: e.target.value })}
                    data-testid="setting-color"
                  />
                  <span style={{ color: "var(--tv-text-dim)", fontFamily: "monospace" }}>{ind.color}</span>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Line Width</label>
                  <select
                    value={ind.thickness}
                    onChange={(e) => set({ thickness: parseInt(e.target.value) })}
                    data-testid="setting-thickness"
                  >
                    <option value={1}>1px — Thin</option>
                    <option value={2}>2px — Normal</option>
                    <option value={3}>3px — Bold</option>
                    <option value={4}>4px — Extra Bold</option>
                  </select>
                </div>
                <div className="field">
                  <label>Line Style</label>
                  <select
                    value={ind.lineStyle}
                    onChange={(e) => set({ lineStyle: e.target.value })}
                    data-testid="setting-line-style"
                  >
                    <option value="solid">Solid ───</option>
                    <option value="dashed">Dashed - - -</option>
                    <option value="dotted">Dotted · · ·</option>
                  </select>
                </div>
              </div>
              <div className="preview-bar">
                <svg width="300" height="20">
                  <line
                    x1="0" y1="10" x2="300" y2="10"
                    stroke={ind.color}
                    strokeWidth={ind.thickness}
                    strokeDasharray={dashArray}
                  />
                </svg>
              </div>
            </>
          )}

          {tab === "visibility" && (
            <div className="field">
              <label>Show indicator on these chart intervals</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TFS.map((tf) => {
                  const checked = (ind.showOnTimeframes || TFS).includes(tf);
                  return (
                    <label className="field-checkbox" key={tf}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const arr = new Set(ind.showOnTimeframes || TFS);
                          if (e.target.checked) arr.add(tf); else arr.delete(tf);
                          set({ showOnTimeframes: Array.from(arr) });
                        }}
                        data-testid={`setting-show-${tf}`}
                      />
                      <span>{tf} — {tf === "1D" ? "Daily" : tf === "1W" ? "Weekly" : "Monthly"}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn ghost" onClick={close} data-testid="settings-cancel">Cancel</button>
          <button className="modal-btn primary" onClick={close} data-testid="settings-ok">OK</button>
        </div>
      </div>
    </div>
  );
}
