import { useEffect, useState } from "react";
import { mfapi } from "../lib/mfapi";

const TTL = 1000 * 60 * 15; // 15m
const cache = new Map();

export function useLatestNav(code) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const cached = cache.get(code);
    if (cached && Date.now() - cached.ts < TTL) {
      setState({ loading: false, data: cached.data, error: null });
      return;
    }
    mfapi
      .latest(code)
      .then((data) => {
        if (!alive) return;
        cache.set(code, { ts: Date.now(), data });
        setState({ loading: false, data, error: null });
      })
      .catch((e) => {
        if (!alive) return;
        setState({ loading: false, data: null, error: e?.message || "fetch error" });
      });
    return () => {
      alive = false;
    };
  }, [code]);

  return state;
}
