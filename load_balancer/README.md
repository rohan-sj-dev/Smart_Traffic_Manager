# Intelligent Load Balancer with Predictive Auto-Scaling and Edge Caching

A C programming course project implementing an intelligent HTTP load balancer with a core decision engine written in C, a real-time monitoring dashboard in React, and a planned Docker-based backend cluster.

---

## Project Architecture

```
LoadC/
├── engine/                  # C decision engine (core algorithms)
│   ├── src/
│   │   ├── main.c           # Entry point — JSON stdin/stdout message loop
│   │   ├── server_pool.c/h  # Server registry with health tracking
│   │   ├── load_balancer.c/h# Weighted Least Connections algorithm
│   │   ├── cache.c/h        # LRU edge cache (doubly linked list + hash table)
│   │   ├── predictor.c/h    # EMA traffic predictor with spike detection
│   │   ├── scaler.c/h       # Auto-scaling decision engine
│   │   ├── metrics.c/h      # Metrics collection and history
│   │   └── compat.h         # Cross-platform threading (Win32 / POSIX)
│   ├── lib/
│   │   ├── cJSON.c          # JSON parsing library (MIT)
│   │   └── cJSON.h
│   ├── build/
│   │   └── engine.exe       # Compiled binary
│   └── Makefile
│
└── load_balancer/           # React monitoring dashboard (Phase 1)
    └── src/
        ├── pages/
        │   ├── TrafficOverview.jsx
        │   ├── Servers.jsx
        │   ├── Cache.jsx
        │   ├── Predictions.jsx
        │   ├── AutoScaling.jsx
        │   └── Logs.jsx
        ├── components/
        │   ├── Sidebar.jsx
        │   └── MetricCard.jsx
        ├── hooks/
        │   └── useLiveData.js
        └── services/
            └── mockData.js
```

---


## Phase 1 React Load Balancer Dashboard

A real-time single-page application built with React 19, Vite, and Tailwind CSS v4. Provides live visibility into the load balancer's state via mock data that mirrors the real engine's output format, ready to be swapped for live WebSocket data in Phase 4.

### Tech Stack

- **React 19** + **Vite 8**
- **Tailwind CSS v4** (via `@tailwindcss/vite` plugin)
- **Recharts** — Area, Line, and Pie charts
- **React Router DOM v7** — client-side routing
- **Lucide React** — icons

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Traffic Overview | RPS, latency, active servers, load gauges, actual vs predicted chart |
| `/servers` | Servers | Container table with CPU/memory bars, WLC scores, connection counts |
| `/cache` | Cache | Hit/miss donut chart, top cached items, edge caching flow diagram |
| `/predictions` | Predictions | EMA line chart, spike detection status, recommended scaling action |
| `/autoscaling` | Auto-Scaling | Config panel, capacity gauge, scaling events history |
| `/logs` | Logs | Scrollable request log with status, latency, and cache badges |

### Running the Dashboard

```bash
cd load_balancer
npm install
npm run dev
```

Runs at `http://localhost:5173` (or next available port).

---



## License

MIT
