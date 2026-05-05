# Project Presentation Plan

A 19-minute presentation, parallelized between two team members, with explicit talking points for each segment. Read it once before presenting and assign sections.

---

## T-2: Pre-presentation prep (do this *before* presenting)

You can't run a fresh `npm install` on stage — it takes minutes and needs internet. Two ways to handle this:

- **Best:** Have TM1 download and `npm install` once *before* arriving (in `bridge/`, `load_balancer/`, `server/`). Just delete `engine/build/` and pretend you didn't.
- **Acceptable:** Pre-stage a zip with `node_modules` already populated. On stage TM1 only runs `make` (~30 s) and `node bridge.js`.

Verify [server/start-all.js](server/start-all.js) and the dashboard work end-to-end on the demo laptop the day before. If you set `AUTO_SPAWN_INITIAL=1` in the bridge, you don't even need `start-all.js` — the bridge spawns the three backends itself.

---

## Time budget

| Phase | Who | Time | What's on screen |
|---|---|---|---|
| 0. Setup | TM1 (silent) | 0–2 min | Terminal: download → make → `node bridge.js` |
| 1. Project intro | TM2 (talking) | 0–2 min | Optional one-slide architecture diagram |
| 2. UI demo | TM1 (driving), TM2 (narrating) | 2–7 min | Browser at `localhost:5173` |
| 3. Architectural layers | both | 7–13 min | Diagram + folder tree in IDE |
| 4. C code deep-dive | one of them | 13–19 min | IDE on engine/src/*.c |

Total: 19 min. Buffer 2 min for Q&A or technical hiccups.

---

## Phase 0 — Setup script (TM1 runs silently)

Make this a single command sequence if possible:

```bash
mkdir loadc-demo && cd loadc-demo
# Download and unzip from LMS (or git clone)
unzip ~/Downloads/loadc.zip
cd LoadC/engine && make
cd ../bridge && node bridge.js
```

While `make` runs (~30 s), open browser tabs to `http://localhost:5173/` (the Vite dev server). If `npm run dev` for the frontend isn't running, kick that off in a second terminal too.

**Backup:** if `make` fails on stage, TM1 says "we're hitting a build hiccup, let me show you the architecture diagram while we sort it" and switches to phase 3 first. Don't panic-debug on stage.

---

## Phase 1 — Project intro script (TM2, 2 min)

Open with a problem statement, not a feature list.

> Modern web traffic is unpredictable — a Reddit hug-of-death can put 100× normal load on a service in seconds. Static load balancers either over-provision and waste money, or under-provision and crash. Our project is a **predictive load balancer that scales itself**. Three things make it different from off-the-shelf nginx:
>
> 1. The decision-making core is written in **C**, not a script — autoscaling decisions run in microseconds.
> 2. It uses an **exponential moving average predictor** to scale *before* a spike fully lands, not after.
> 3. It has an **edge cache** in front of routing, so cacheable endpoints never even reach a backend.
>
> The system has three layers — a React dashboard, a Node.js bridge, and the C engine — talking to each other over WebSockets and stdio. Let me hand off to TM1 to show it running.

(That's exactly 100 words; you'll fill ~90 seconds reading it conversationally.)

---

## Phase 2 — UI demo script (5 min)

Drive with intent. Don't click around aimlessly. Hit each page with a one-sentence purpose.

| Time | Page | Say |
|---|---|---|
| 0:00 | Traffic Overview (idle) | "Three backends running at different capacities — alpha is fastest, gamma is slowest. Saturation is hovering around 10 % at idle." |
| 0:30 | Servers | "Notice the WLC algorithm prefers higher-weight servers — alpha is taking more traffic than gamma. Each server has its own EMA latency tracker that the router uses to break ties." |
| 1:00 | Cache | "Static endpoints get cached — the hit rate climbs as we hit `/data` repeatedly." (Click 3× /data from Simulator preset to seed it.) |
| 1:30 | Predictions | "This is the EMA predictor: blue is current load, orange is its one-tick-ahead prediction. Trend is `stable` because traffic is uniform." |
| 2:00 | Auto-Scaling | "Min 3, max 10. Scale-up threshold 20 %, scale-down 12 %. Both deltas are proportional — heavier load adds more servers per event." |
| 2:30 | **Simulator** *(this is the hero moment)* | Set `/api/train`, RPS 60, Duration 30. Hit `Sustain`. |
| 3:00 | Switch back to Auto-Scaling | "Watch — composite saturation just crossed threshold, autoscaler fires a +2 event, two new servers spawn with random capacity profiles." |
| 4:00 | Servers | "Delta and Epsilon just appeared. They have different capacities than the originals." |
| 4:30 | Logs | "Filter by last 5 minutes, status 5xx — we can see exactly what failed and where it was routed." |
| 5:00 | Hand off | |

**Backup if scale-up doesn't fire:** bump RPS to 80 and run the burst again. If it still doesn't fire, switch to talking and say "in production we tune these thresholds — for the demo we lean conservative."

---

## Phase 3 — Architectural layers script (6 min)

Open one slide or one terminal showing the folder tree:

```
LoadC/
├── load_balancer/    (UI layer)
├── bridge/           (Communication layer)
├── engine/           (Algorithm layer)
└── server/           (Backend layer)
```

Then 1.5 minutes per layer, in this order:

### UI layer (1.5 min)
- "React + Vite + recharts. Single-page app with seven routes."
- "Key piece: [useLiveData.js](load_balancer/src/hooks/useLiveData.js) — a React hook that holds a WebSocket to the bridge. State updates push automatically; if the WS drops, mock data takes over until reconnect."
- "All charts are live — every tick the WebSocket pushes a new traffic-history snapshot, the chart re-renders."

### Communication layer (1.5 min)
- Open [bridge/bridge.js](bridge/bridge.js) briefly.
- "Node.js process. Owns three pipes: stdin/stdout to the C engine, WebSocket to the React UI, plain HTTP to the backends."
- "Why this layer exists at all: C is great at decisions, terrible at HTTP. The bridge handles network I/O, JSON marshaling, child-process management, and the WebSocket fan-out. The engine never touches a socket."
- "Wire format is **JSON-per-line** on the engine pipe — `route_request`, `route_response`, `scale_command`, etc."

### Algorithm layer (1.5 min)
- "The C engine. We'll dive into this in the next 6 minutes — for now: it's a single binary that ingests JSON commands and emits JSON decisions."
- "Two threads: the main one reads stdin and dispatches; the tick thread runs every second and runs the predictor + autoscaler + cache eviction."
- "All decisions — which server to route to, when to scale, when to evict — happen here, in C, not in the bridge."

### Backend layer (1.5 min)
- "Three Express.js servers, each forked as a separate Node.js process. They expose seven workload endpoints: `/cpu`, `/ml`, `/image`, `/api/train`, etc."
- "Each has a synthetic `CAPACITY` profile — a busy-loop multiplier that simulates weaker hardware. Alpha is at 0.6, beta 0.4, gamma 0.3 — so the same `/api/train` takes about 3× longer on gamma than alpha."
- "Each reports per-process CPU and memory on `/health`. The bridge polls every 500 ms and forwards to the engine."

**Visual cue:** at the end of phase 3, draw an arrow from each layer to the layers it talks to. Reinforce that data flows in both directions and *every* boundary is a JSON message.

---

## Phase 4 — C code deep-dive script (6 min)

Open the engine's source in the IDE. Have these files ready in tabs in this order:

1. [engine/src/main.c](engine/src/main.c) — line ~415 (`main()`)
2. [engine/src/server_pool.h](engine/src/server_pool.h) — top
3. [engine/src/predictor.c](engine/src/predictor.c) — line ~49 (`predictor_update`)
4. [engine/src/scaler.c](engine/src/scaler.c) — line ~36 (`scaler_evaluate`)
5. [engine/src/compat.h](engine/src/compat.h) — top

Six segments, ~1 minute each:

### 4.1 Headers and modular layout (1 min)
- "Each subsystem is one `.h` + one `.c`. Header declares the struct and the public API; the `.c` file is the implementation. Standard, clean."
- Open [server_pool.h](engine/src/server_pool.h). Point at the `Server` struct: `id, status, weight, active_connections, ema_latency`.
- "Status is an enum — `healthy`, `overloaded`, `degraded`. The router and autoscaler both branch on this value."

### 4.2 The five global subsystems (1 min)
- Switch to [main.c](engine/src/main.c) line ~46.
- "Five globals: `g_pool`, `g_cache`, `g_predictor`, `g_scaler`, `g_metrics`. Every other module operates on one of these — passed in as a pointer. No god-object."

### 4.3 Threads and the tick loop (1.5 min) — the most interesting part
- Scroll to [main.c tick_thread](engine/src/main.c).
- "Two threads in the entire engine. Main reads stdin, tick runs every 1000 ms."
- "Every tick we lock the pool, sum CPU/mem/connections across servers, build a *composite saturation score* — currently 40 % conn_util, 25 % RPS, 20 % CPU, 15 % memory."
- "That number goes into the predictor (one EMA call), then the scaler reads the predictor and may emit a `scale_command`."
- "All five subsystems have their own mutex. Only one nested-lock site exists — scaler-then-predictor inside `scaler_evaluate` — and nothing else takes them in the opposite order, so deadlock is impossible."

### 4.4 EMA in action (1 min)
- Open [predictor.c](engine/src/predictor.c) line 63.
- "One line of math: `EMA = α × observed + (1 − α) × EMA`. We use α = 0.5 so it reacts in 2–3 ticks but still filters single-sample noise."
- "EMA + rate of change gives us a one-tick-ahead prediction — that's what triggers scale-up *before* the load fully arrives."

### 4.5 Cache as two data structures, one node (45 s)
- Open [cache.h](engine/src/cache.h) line 13.
- "Each cache entry lives in *both* a doubly-linked LRU list and a hash table — same `Node` struct, three pointer fields. Lookup is O(1), eviction is O(1). FNV-1a hash with separate chaining."

### 4.6 Cross-platform threading (45 s)
- Open [compat.h](engine/src/compat.h).
- "One header that hides the platform. `compat_mutex_t` is `CRITICAL_SECTION` on Windows, `pthread_mutex_t` on POSIX. All inline, header-only. Means every other file just sees a `compat_mutex_t` and doesn't care."

**If you have an extra 30 seconds:** open [engine/ARCHITECTURE.md](engine/ARCHITECTURE.md) and say "this document goes file-by-file in detail; we won't read it now." Shows depth without burning time.

---

## Handoff phrases (rehearse these)

- TM2 → TM1: "...with the build done, let's see it run. TM1, can you bring up the dashboard?"
- TM1 → TM2: "I'll keep the simulator running while you walk through the architecture."
- Either → audience: "We have time for two questions before we wrap." (Only say this if you're ahead of schedule.)

---

## Common questions to expect (and one-line answers)

| Q | A |
|---|---|
| "Why C, not Go/Rust?" | "The engine has zero allocations on the hot path and tight control over locking. C makes that explicit." |
| "How is this different from nginx + autoscaling?" | "nginx is reactive — it scales after the spike lands. Our predictor uses EMA + rate-of-change to scale ahead." |
| "What's your test coverage?" | If unit tests are sparse: "We focused on integration testing through the dashboard — every metric on screen is a live signal from the engine, so end-to-end correctness is observable." |
| "What happens if the engine crashes?" | "The bridge auto-respawns the engine within 3 seconds. Pool state is rebuilt from the bridge's authoritative `BACKENDS` list." |
| "Can it scale-down with in-flight requests?" | Honest answer: "Currently it kills the process — in-flight requests fail. Drain-then-kill is on our roadmap." |

---

## Final tips

- **Don't read this aloud.** Internalize the structure and improvise the words.
- **Don't fight the laptop.** If something breaks, narrate it: "this is a great demonstration of why we have logs — let me show you the bridge output."
- **Watch the clock.** If phase 2 runs long, cut Predictions and Cache page visits — keep the simulator hero moment.
- **End strong.** Last sentence should be the takeaway:
  *"Three layers, two threads, one EMA — and a load balancer that gets out of its own way."*

Good luck.
