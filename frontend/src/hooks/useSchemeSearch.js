import { useEffect, useState } from "react";
import { mfapi } from "../lib/mfapi";

export function useSchemeSearch(query) {
  const [state, setState] = useState({ loading: false, results: [], total: 0 });

  useEffect(() => {
    const q = (query || "").trim();
    if (!q) {
      setState({ loading: false, results: [], total: 0 });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    const handle = setTimeout(() => {
      mfapi
        .search(q, 15)
        .then((d) => {
          if (!alive) return;
          setState({ loading: false, results: d.results || [], total: d.total || 0 });
        })
        .catch(() => alive && setState({ loading: false, results: [], total: 0 }));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query]);

  return state;
}
