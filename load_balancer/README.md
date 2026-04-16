# Intelligent Load Balancer with Predictive Auto-Scaling and Edge Caching

A C programming course project — an intelligent HTTP load balancer with a C decision engine, real-time React dashboard, Node.js bridge, backend server cluster, PostgreSQL logging, and load-testing tooling.

---

## Project Architecture

```
LoadC/
├── engine/                    # C decision engine (core algorithms)
│   ├── src/
│   │   ├── main.c             # Entry point — JSON stdin/stdout loop
│   │   ├── server_pool.c/h    # Server registry with health tracking
│   │   ├── load_balancer.c/h  # Weighted Least Connections (WLC) algorithm
│   │   ├── cache.c/h          # LRU edge cache (doubly linked list + hash map)
│   │   ├── predictor.c/h      # EMA traffic predictor with spike detection
│   │   ├── scaler.c/h         # Auto-scaling decision logic
│   │   ├── metrics.c/h        # Metrics collection, p99, history snapshots
│   │   └── compat.h           # Cross-platform threading (Win32 CRITICAL_SECTION)
│   ├── lib/
│   │   ├── cJSON.c/h          # JSON parsing library (MIT)
│   └── Makefile
│
├── bridge/                    # Node.js bridge layer (port 4000)
│   ├── bridge.js              # Spawns engine, HTTP + WebSocket server
│   ├── db.js                  # Async PostgreSQL logger (pg pool)
│   └── package.json
│
├── server/                    # Express backend servers
│   ├── index.js               # 8 endpoints with real CPU/ML/image workloads
│   ├── start-all.js           # Spawns alpha/beta/gamma on ports 3001-3003
│   └── test-endpoints.js      # 24-test endpoint validation suite
│
├── load_balancer/             # React monitoring dashboard
│   └── src/
│       ├── pages/
│       │   ├── TrafficOverview.jsx
│       │   ├── Servers.jsx
│       │   ├── Cache.jsx
│       │   ├── Predictions.jsx
│       │   ├── AutoScaling.jsx
│       │   └── Logs.jsx
│       ├── hooks/
│       │   └── useLiveData.js  # WebSocket client, mock fallback
│       └── services/
│           └── mockData.js
│
├── db/
│   └── init.sql               # PostgreSQL schema
│
└── loadtest/
    └── stress.js              # 5-phase load testing tool
```

---

## How to Run

### 1. Start the backend servers

```bash
cd server
npm install
node start-all.js
# Starts server-alpha:3001, server-beta:3002, server-gamma:3003
```

### 2. Build the C engine (requires MinGW on Windows)

```bash
cd engine
mingw32-make
# Produces engine/build/engine.exe
```

### 3. Start the bridge

```bash
cd bridge
npm install
node bridge.js
# HTTP + WebSocket on http://localhost:4000
```

### 4. Start the React dashboard

```bash
cd load_balancer
npm install
npm run dev
# Runs at http://localhost:5173
```

---

## Phases

### Phase 1 — React Dashboard
Real-time SPA built with React 19, Vite 8, Tailwind CSS v4, Recharts, and React Router DOM v7. Six pages: Traffic Overview, Servers, Cache, Predictions, Auto-Scaling, Logs.

### Phase 2 — C Decision Engine
Core engine with 7 modules communicating via JSON over stdin/stdout:
- **WLC load balancer** — 2-pass (healthy-first, degraded fallback), `compute_score()` tiebreaker
- **LRU cache** — doubly-linked list + FNV-1a hash map, TTL, 1024-entry capacity
- **EMA predictor** — α=0.3, 60-sample window, spike detection (2σ), trend classification
- **Auto-scaler** — threshold-based (scale up >80%, scale down <30%), 30s cooldown, spike fast-path (+2)
- **Metrics collector** — per-interval counters, p99 via qsort, lifetime totals

### Phase 3 — Backend Servers
Express server with 8 endpoints delivering real computational workloads:

| Endpoint | Workload |
|----------|----------|
| `GET /health` | Status + active connections |
| `GET /cpu` | Matrix multiply + prime factorization + fibonacci(35) |
| `GET /ml` | Gradient descent, 500 samples |
| `GET /image` | 512×512 Gaussian blur + Sobel edge detection |
| `GET /data` | Static cacheable JSON |
| `POST /api/train` | Multi-feature regression, 1000 samples |
| `POST /api/predict` | Batch inference |
| `GET /api/datasets` | Dataset metadata |

### Phase 4 — Node.js Bridge Layer
`bridge/bridge.js` connects everything:
- Spawns `engine.exe` as a child process, communicates via JSON stdin/stdout
- HTTP + WebSocket server on port 4000
- Polls `/health` on all backends every 2s, feeds normalized CPU/memory to engine
- Generates synthetic traffic every 1.5s
- Forwards routed requests to actual backends via HTTP
- Transforms engine status into dashboard-shaped JSON
- Broadcasts live updates to all WebSocket clients
- `useLiveData.js` hook connects React dashboard, auto-reconnects every 3s, falls back to mock data

### Phase 5 — Edge Caching Integration
End-to-end cache-first request flow:
- Engine checks cache by URL before routing — returns `cache_response` on hit, short-circuits backend
- Bridge uses URL-only cache keys (fixed from broken `serverId:url` format)
- Endpoint-specific TTLs: `/data`=120s, `/api/datasets`=120s, `/api/predict`=30s, `/cpu`=10s, `/ml`=15s, `/image`=20s, `/api/train`=uncached
- Only GET responses are cached; POST/PUT/DELETE send `cache_remove` before routing
- Achieved ~38% cache hit rate under normal traffic

### Phase 6 — Database & Logging
Async PostgreSQL logging via `pg` pool in `bridge/db.js`:
- **`request_logs`** — every routed request (method, URL, server, latency, cache hit)
- **`scaling_events`** — every autoscaler decision with before/after counts
- **`metric_snapshots`** — full system snapshot every 5s (RPS, latency, cache hit rate, prediction)
- Gracefully no-ops if `DATABASE_URL`/`PGHOST` is not set

To initialise the database:
```bash
psql -U postgres -f db/init.sql
# Then set DATABASE_URL=postgres://user:pass@localhost/loadbalancer
```

### Phase 7 — Load Testing & Real Autoscaling Actuator

#### Load Testing (`loadtest/stress.js`)
5-phase traffic simulator:

| Phase | Duration | Load |
|-------|----------|------|
| warm-up | 20s | 1→10 req/s |
| steady | 20s | 10 req/s |
| ramp-up | 20s | 10→50 req/s |
| flash-crowd | 10s | 100 req/s |
| cool-down | 20s | 5 req/s |

```bash
node loadtest/stress.js                        # full run
node loadtest/stress.js --phase flash-crowd    # single phase
node loadtest/stress.js --rps 30 --duration 60 # custom constant load
```

Reports p50/p95/p99 latency, cache hits, success rate, and throughput per phase.

#### Real Autoscaling Actuator
The bridge now **actually spawns and kills server processes** in response to engine decisions:
- `scale_command: scale_up` → `fork(server/index.js)` on next port (3004, 3005...), send `add_server` to engine
- `scale_command: scale_down` → send `remove_server` to engine, `kill()` the child process
- Engine's scaler counter synced via `set_server_count` message after each action
- Scaling event history persisted in bridge memory, served to dashboard on reconnect
- Dashboard AutoScaling page shows real-time capacity gauge and event log

Verified: flash-crowd test at 100 req/s triggered `scale_up`, spawned `server-delta:3004`, engine registered and began routing to it.

---

## Engine Message Protocol

| Direction | Message | Fields |
|-----------|---------|--------|
| → Engine | `route_request` | `request_id`, `url`, `method` |
| → Engine | `request_done` | `request_id`, `server_id`, `latency_ms`, `status_code`, `cache_hit` |
| → Engine | `health_update` | `server_id`, `cpu`, `memory`, `healthy` |
| → Engine | `add_server` | `id`, `name`, `ip`, `port`, `weight`, `max_connections` |
| → Engine | `remove_server` | `server_id` |
| → Engine | `cache_put` | `key`, `value`, `size`, `ttl` |
| → Engine | `cache_get` | `key` |
| → Engine | `cache_remove` | `key` |
| → Engine | `set_server_count` | `count` |
| → Engine | `get_status` | — |
| → Engine | `shutdown` | — |
| ← Engine | `route_response` | `server_id`, `url`, `algorithm`, `score` |
| ← Engine | `cache_response` | `cache_hit`, `value`/`cached_value`, `url` |
| ← Engine | `scale_command` | `action`, `delta`, `current_count` |
| ← Engine | `status` | `servers`, `cache`, `cache_items`, `prediction`, `scaling`, `metrics`, `system` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Decision engine | C (MinGW GCC 6.3.0), cJSON v1.7.19 |
| Bridge | Node.js 22, Express, ws, pg |
| Frontend | React 19, Vite 8, Tailwind CSS v4, Recharts, React Router DOM v7 |
| Backend servers | Node.js, Express |
| Database | PostgreSQL (optional) |
| Load testing | Node.js (stdlib only) |

---

## License

MIT
