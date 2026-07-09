import React, { useMemo, useState, useEffect } from "react";
import "./App.css";
import TopToolbar from "./components/TopToolbar";
import DrawToolRail from "./components/DrawToolRail";
import ChartPane from "./components/ChartPane";
import IndicatorSubPane from "./components/IndicatorSubPane";
import RightSidebar from "./components/RightSidebar";
import BottomBar from "./components/BottomBar";
import IndicatorPicker from "./components/IndicatorPicker";
import IndicatorSettingsModal from "./components/IndicatorSettingsModal";
import { useChartStore } from "./store/chartStore";
import { useSchemeNavHistory } from "./hooks/useSchemeNavHistory";
import { adaptNavHistoryToSeries } from "./lib/mfapi";
import { resampleNavSeries } from "./lib/navAggregation";

// Default weight rules: main chart = 300, sub-panes = 150 each
const defaultWeight = (id) => (id === "main" ? 300 : 150);

// Distribute / normalize weights across active panels
function recomputeWeights(activePaneIds, persistedWeights) {
  const nextWeights = {};
  const existingIds = activePaneIds.filter((id) => persistedWeights[id] !== undefined);
  const newIds = activePaneIds.filter((id) => persistedWeights[id] === undefined);

  if (newIds.length === 0) {
    // Normalize existing weights to sum up to 100%
    const sum = existingIds.reduce((s, id) => s + persistedWeights[id], 0);
    if (sum > 0) {
      for (const id of activePaneIds) {
        nextWeights[id] = (persistedWeights[id] / sum) * 100;
      }
    } else {
      const equalShare = 100 / activePaneIds.length;
      for (const id of activePaneIds) nextWeights[id] = equalShare;
    }
  } else {
    // Distribute weights proportionally when indicators are added/removed
    if (existingIds.length === 0) {
      const equalShare = 100 / activePaneIds.length;
      for (const id of activePaneIds) nextWeights[id] = equalShare;
    } else {
      // Sum the default heights of all active panes
      let sumDefaults = 0;
      const defaults = {};
      for (const id of activePaneIds) {
        defaults[id] = defaultWeight(id);
        sumDefaults += defaults[id];
      }
      for (const id of activePaneIds) {
        nextWeights[id] = (defaults[id] / sumDefaults) * 100;
      }
    }
  }

  return nextWeights;
}

const EMPTY_OBJ = {};

function App() {
  const activeScheme = useChartStore((s) => s.activeScheme);
  const activeInterval = useChartStore((s) => s.activeInterval);
  const { data: rawData, loading } = useSchemeNavHistory(activeScheme?.code);

  const series = useMemo(() => {
    if (!rawData?.data) return [];
    const s = adaptNavHistoryToSeries(rawData.data);
    return resampleNavSeries(s, activeInterval);
  }, [rawData, activeInterval]);

  const indicators = useChartStore((s) => s.indicators);
  const setPickerOpen = useChartStore((s) => s.setPickerOpen);
  const settingsModalId = useChartStore((s) => s.settingsModalId);
  const persistedWeights = useChartStore((s) => s.paneWeights) || EMPTY_OBJ;
  const setPaneWeights = useChartStore((s) => s.setPaneWeights);

  const SUB_PANE_TYPES = new Set(["ROC", "RSI"]);
  const subPaneIndicators = indicators.filter((i) => SUB_PANE_TYPES.has(i.type));
  const activePaneIds = useMemo(() => ["main", ...subPaneIndicators.map((i) => i.id)], [subPaneIndicators]);



  const needsRecompute = useMemo(() => {
    const persistedKeys = Object.keys(persistedWeights);
    if (persistedKeys.length !== activePaneIds.length) return true;
    return activePaneIds.some((id) => persistedWeights[id] === undefined);
  }, [activePaneIds, persistedWeights]);

  const defaultWeights = useMemo(() => {
    if (needsRecompute) {
      return recomputeWeights(activePaneIds, persistedWeights);
    }
    return persistedWeights;
  }, [needsRecompute, activePaneIds, persistedWeights]);

  // Local dragWeights state handles real-time fluid rendering during dragging without triggering disk/storage writes
  const [dragWeights, setDragWeights] = useState(null);

  const currentWeights = dragWeights || defaultWeights;

  // Persist weights when default weights change (e.g., indicator added/removed)
  useEffect(() => {
    if (needsRecompute) {
      setPaneWeights(defaultWeights);
    }
  }, [needsRecompute, defaultWeights, setPaneWeights]);

  const handleMouseDown = (e, idA, idB) => {
    e.preventDefault();
    const startY = e.clientY;

    const elA = document.getElementById(`pane-${idA}`);
    const elB = document.getElementById(`pane-${idB}`);
    if (!elA || !elB) return;

    const hA = elA.clientHeight;
    const hB = elB.clientHeight;
    const hCombined = hA + hB;

    const wA = currentWeights[idA];
    const wB = currentWeights[idB];
    const wSum = wA + wB;

    // Minimum boundary clamps: main chart must be >= 250px, sub-panes >= 120px
    const minA = idA === "main" ? 250 : 120;
    const minB = idB === "main" ? 250 : 120;

    const onMouseMove = (moveEvent) => {
      const deltaY = moveEvent.clientY - startY;
      let newHA = hA + deltaY;
      let newHB = hB - deltaY;

      // Enforce bounds
      if (newHA < minA) {
        newHA = minA;
        newHB = hCombined - minA;
      } else if (newHB < minB) {
        newHB = minB;
        newHA = hCombined - minB;
      }

      // Calculate weight distribution
      const pctA = newHA / hCombined;
      const pctB = newHB / hCombined;

      setDragWeights((prev) => {
        const next = { ...(prev || defaultWeights) };
        next[idA] = pctA * wSum;
        next[idB] = pctB * wSum;
        return next;
      });
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setDragWeights((latest) => {
        if (latest) {
          setPaneWeights(latest);
        }
        return null;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div className="app-root" data-testid="app-root">
      <TopToolbar onOpenIndicators={() => setPickerOpen(true)} />
      <div className="app-content">
        <DrawToolRail />
        <div className="chart-area">
          {activePaneIds.map((paneId, idx) => {
            const isMain = paneId === "main";
            const indicator = isMain ? null : subPaneIndicators.find((i) => i.id === paneId);
            const isBottom = idx === activePaneIds.length - 1;
            const weight = currentWeights[paneId] || (100 / activePaneIds.length);

            const style = {
              flexGrow: weight,
              flexShrink: 1,
              flexBasis: 0,
            };

            return (
              <React.Fragment key={paneId}>
                {isMain ? (
                  <ChartPane
                    id={`pane-main`}
                    style={style}
                    isBottom={isBottom}
                    series={series}
                    rawData={rawData}
                  />
                ) : (
                  <IndicatorSubPane
                    id={`pane-${paneId}`}
                    style={style}
                    indicator={indicator}
                    isBottom={isBottom}
                    mainSeries={series}
                    rawData={rawData}
                  />
                )}
                {!isBottom && (
                  <div
                    className="pane-divider"
                    onMouseDown={(e) => handleMouseDown(e, paneId, activePaneIds[idx + 1])}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <RightSidebar />
      </div>
      <BottomBar />
      <IndicatorPicker />
      {settingsModalId && <IndicatorSettingsModal />}
    </div>
  );
}

export default App;
