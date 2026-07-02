import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Silence CRA dev-overlay for the benign "ResizeObserver loop..." warning.
// This is not an application error — browsers emit it when a RO callback
// causes layout that would trigger another observation on the same frame.
// It never affects functionality; only the dev overlay treats it as an error.
const RO_ERROR_RE = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;
window.addEventListener("error", (e) => {
  if (e?.message && RO_ERROR_RE.test(e.message)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e?.reason?.message || String(e?.reason || "");
  if (RO_ERROR_RE.test(msg)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
