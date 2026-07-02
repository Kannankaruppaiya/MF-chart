"""
MF Chart Backend — FastAPI proxy to MFapi.in
- Preloads all 37k+ Indian mutual fund schemes into memory at startup
- Provides fast in-memory search (<5ms)
- Caches NAV history (24h) and latest NAV (15m)
"""
from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import asyncio
import os
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
import httpx
from nselib import capital_market as nse_cm

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("mf-chart")

MFAPI_BASE = "https://api.mfapi.in"
HISTORY_TTL = 60 * 60 * 24      # 24 hours
LATEST_TTL = 60 * 15            # 15 minutes
SCHEME_LIST_RETRY_DELAY = 60    # 1 minute

# --- In-memory caches ---------------------------------------------------------
class TTLCache:
    def __init__(self):
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str):
        item = self._store.get(key)
        if not item:
            return None
        expiry, value = item
        if expiry < time.time():
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl: int):
        self._store[key] = (time.time() + ttl, value)

    def size(self):
        return len(self._store)


cache = TTLCache()

# Master scheme index: list of {schemeCode, schemeName}
SCHEME_INDEX: list[dict] = []
# Lowercase tokens cache for fast filtering
SCHEME_TOKENS: list[tuple[int, str, list[str]]] = []  # (code, name, tokens)
INDEX_READY = False


async def load_scheme_index():
    """Background task — download all schemes and index them."""
    global SCHEME_INDEX, SCHEME_TOKENS, INDEX_READY
    attempts = 0
    while True:
        attempts += 1
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                logger.info("[scheme-index] fetching master list from MFapi.in ...")
                r = await client.get(f"{MFAPI_BASE}/mf")
                r.raise_for_status()
                data = r.json()
                SCHEME_INDEX = data
                SCHEME_TOKENS = [
                    (int(s["schemeCode"]),
                     s["schemeName"],
                     s["schemeName"].lower().split())
                    for s in data
                ]
                INDEX_READY = True
                logger.info(f"[scheme-index] loaded {len(SCHEME_INDEX)} schemes")
                return
        except Exception as e:
            logger.warning(f"[scheme-index] attempt {attempts} failed: {e}")
            await asyncio.sleep(SCHEME_LIST_RETRY_DELAY)


# NSE equity index (preloaded for fast search)
NSE_EQUITY_LIST: list[dict] = []
NSE_READY = False


async def load_nse_equity_list():
    """Background: load NSE equity list once at startup."""
    global NSE_EQUITY_LIST, NSE_READY
    loop = asyncio.get_event_loop()
    try:
        df = await loop.run_in_executor(None, nse_cm.equity_list)
        # Columns: SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, ...
        rows = []
        for _, r in df.iterrows():
            sym = str(r.get("SYMBOL", "")).strip()
            name = str(r.get("NAME OF COMPANY", "")).strip()
            if sym:
                rows.append({"symbol": sym, "name": name})
        NSE_EQUITY_LIST = rows
        NSE_READY = True
        logger.info(f"[nse] loaded {len(NSE_EQUITY_LIST)} equities")
    except Exception as e:
        logger.warning(f"[nse] equity list load failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off background loads (don't block startup)
    asyncio.create_task(load_scheme_index())
    asyncio.create_task(load_nse_equity_list())
    yield


app = FastAPI(title="MF Chart Backend", lifespan=lifespan)
api_router = APIRouter(prefix="/api")


# --- Routes -------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "MF Chart Backend", "ok": True}


@api_router.get("/health")
async def health():
    return {
        "ok": True,
        "scheme_index_ready": INDEX_READY,
        "schemes_count": len(SCHEME_INDEX),
        "nse_ready": NSE_READY,
        "nse_count": len(NSE_EQUITY_LIST),
        "cache_entries": cache.size(),
        "uptime_ts": time.time(),
    }


# --- NSE endpoints (powered by nselib) ----------------------------------------
@api_router.get("/nse/search")
async def nse_search(q: str = Query("", min_length=0), limit: int = 50):
    """Search NSE equities by symbol or company name (in-memory)."""
    query = q.strip().lower()
    if not query:
        return {"ready": NSE_READY, "total": 0, "results": []}
    if not NSE_READY:
        return {"ready": False, "total": 0, "results": []}
    tokens = query.split()
    matches = []
    for row in NSE_EQUITY_LIST:
        hay = f"{row['symbol']} {row['name']}".lower()
        if all(tok in hay for tok in tokens):
            matches.append(row)
            if len(matches) >= 300:
                break
    return {"ready": True, "total": len(matches), "results": matches[:limit]}


@api_router.get("/nse/{symbol}/history")
async def nse_history(symbol: str, period: str = "1Y"):
    """Daily OHLC + volume history for an NSE equity.

    period: 1M | 3M | 6M | 1Y | 5Y (default 1Y).
    """
    period = period.upper()
    days_map = {"1M": 31, "3M": 93, "6M": 186, "1Y": 365, "5Y": 365 * 5}
    days = days_map.get(period, 365)

    key = f"nse:{symbol.upper()}:{period}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    to_d = datetime.now()
    from_d = to_d - timedelta(days=days)
    to_str = to_d.strftime("%d-%m-%Y")
    from_str = from_d.strftime("%d-%m-%Y")

    loop = asyncio.get_event_loop()
    try:
        df = await loop.run_in_executor(
            None,
            lambda: nse_cm.price_volume_data(symbol=symbol.upper(), from_date=from_str, to_date=to_str),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NSE upstream error: {e}")

    if df is None or df.empty:
        raise HTTPException(status_code=404, detail=f"No data for symbol '{symbol}'")

    # Normalize → ascending series of { time, open, high, low, close, volume }
    def _num(v):
        try:
            return float(str(v).replace(",", ""))
        except Exception:
            return None

    series = []
    for _, r in df.iterrows():
        d = str(r.get("Date", "")).strip()
        # nselib returns dates like "01-Jan-2025"
        try:
            iso = datetime.strptime(d, "%d-%b-%Y").strftime("%Y-%m-%d")
        except Exception:
            continue
        series.append({
            "time": iso,
            "open": _num(r.get("OpenPrice")),
            "high": _num(r.get("HighPrice")),
            "low": _num(r.get("LowPrice")),
            "close": _num(r.get("ClosePrice")),
            "volume": _num(r.get("TotalTradedQuantity")),
        })
    series.sort(key=lambda x: x["time"])

    payload = {
        "symbol": symbol.upper(),
        "period": period,
        "points": len(series),
        "data": series,
    }
    cache.set(key, payload, LATEST_TTL)  # NSE history changes intraday → 15m TTL
    return payload


@api_router.get("/mf/search")
async def search_schemes(q: str = Query("", min_length=0), limit: int = 50):
    """Fast in-memory all-words match search. Falls back to upstream if index not ready."""
    query = q.strip().lower()
    if not query:
        return {"ready": INDEX_READY, "total": 0, "results": []}

    if not INDEX_READY:
        # Fallback: hit upstream search (slow but works during cold start)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(f"{MFAPI_BASE}/mf/search", params={"q": q})
                r.raise_for_status()
                items = r.json()
                results = [
                    {"schemeCode": int(s["schemeCode"]), "schemeName": s["schemeName"]}
                    for s in items[:limit]
                ]
                return {"ready": False, "total": len(items), "results": results}
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"Index loading; upstream failed: {e}")

    # All-words match — every token in query must appear in scheme name
    query_tokens = query.split()
    matches = []
    for code, name, tokens in SCHEME_TOKENS:
        name_lower = name.lower()
        if all(qt in name_lower for qt in query_tokens):
            matches.append({"schemeCode": code, "schemeName": name})
            if len(matches) >= 200:  # cap raw matches
                break

    total = len(matches)
    return {"ready": True, "total": total, "results": matches[:limit]}


@api_router.get("/mf/{scheme_code}")
async def get_scheme_history(scheme_code: int):
    """Full NAV history + metadata. Cached 24h."""
    key = f"hist:{scheme_code}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{MFAPI_BASE}/mf/{scheme_code}")
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    # Detect "not found" — MFapi returns 200 with empty data + scheme_code 0
    meta = payload.get("meta") or {}
    data = payload.get("data") or []
    if (not data) and int(meta.get("scheme_code") or 0) == 0:
        raise HTTPException(status_code=404, detail=f"Scheme {scheme_code} not found")

    cache.set(key, payload, HISTORY_TTL)
    return payload


@api_router.get("/mf/{scheme_code}/latest")
async def get_scheme_latest(scheme_code: int):
    """Latest NAV. Cached 15 min."""
    key = f"latest:{scheme_code}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(f"{MFAPI_BASE}/mf/{scheme_code}/latest")
            r.raise_for_status()
            payload = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    meta = payload.get("meta") or {}
    data = payload.get("data") or []
    if (not data) and int(meta.get("scheme_code") or 0) == 0:
        raise HTTPException(status_code=404, detail=f"Scheme {scheme_code} not found")

    # Augment with previous day NAV (for day-change %). Prefer cached history;
    # otherwise fetch upstream once and cache so subsequent calls are fast.
    hist = cache.get(f"hist:{scheme_code}")
    if not hist:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r2 = await client.get(f"{MFAPI_BASE}/mf/{scheme_code}")
                if r2.status_code == 200:
                    hist = r2.json()
                    if hist.get("data"):
                        cache.set(f"hist:{scheme_code}", hist, HISTORY_TTL)
        except Exception:
            hist = None

    prev_nav = None
    if hist and hist.get("data") and len(hist["data"]) >= 2:
        try:
            prev_nav = float(hist["data"][1]["nav"])
        except Exception:
            prev_nav = None
    payload["_prev_nav"] = prev_nav

    cache.set(key, payload, LATEST_TTL)
    return payload


# Wire up
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
