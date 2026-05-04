# Engine Architecture — File-by-File Reference

The engine is the C core of the load balancer. It is launched as a child process by the Node bridge and communicates over **JSON lines on stdin/stdout** — no sockets, no shared memory. Every external interaction (route a request, add a server, get status) is a single line of JSON in, one or more JSON lines out.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         NODE BRIDGE  (bridge.js)                      │
│   forks engine.exe, pipes stdin/stdout, exposes WS to React UI        │
└────────────────┬───────────────────────────────────┬────────────────┘
                 │ stdin (JSON in)                   │ stdout (JSON out)
                 ▼                                   ▲
┌──────────────────────────────────────────────────────────────────────┐
│                          ENGINE (this dir)                            │
│                                                                       │
│  main.c  ── message dispatch + 1-Hz tick thread                       │
│       │                                                               │
│       ├── server_pool.{c,h}   ── pool of backends, health, status     │
│       ├── load_balancer.{c,h} ── WLC routing decision                 │
│       ├── cache.{c,h}         ── LRU + hash cache w/ TTL eviction     │
│       ├── predictor.{c,h}     ── EMA predictor, trend, spike detect   │
│       ├── scaler.{c,h}        ── threshold-based autoscaler           │
│       ├── metrics.{c,h}       ── per-second snapshots, p99, lifetime  │
│       ├── compat.h            ── pthread/Win32 thread abstraction     │
│       └── lib/cJSON.{c,h}     ── (vendored) JSON library              │
└──────────────────────────────────────────────────────────────────────┘
```

`main.c` is the only translation unit that owns global state (`g_pool`, `g_cache`, `g_predictor`, `g_scaler`, `g_metrics`). All other modules are *libraries* that operate on a pointer the caller provides.

---

## Threading model

There are **exactly two threads of execution** inside the engine:

| Thread | Source | Purpose | Cadence |
|---|---|---|---|
| **Main** | `main()` in [main.c](src/main.c) | Reads JSON lines from stdin, dispatches to handlers, writes responses to stdout. | Whenever a line arrives — driven by the bridge. |
| **Tick** | `tick_thread()` in [main.c](src/main.c) | Aggregates per-server CPU/mem/connections into a composite load, feeds the predictor, evaluates the scaler, evicts expired cache entries. | Every 1000 ms. |

Both threads access **all five subsystems** concurrently. Each subsystem owns its own mutex; locking is fine-grained, never global. The only multi-lock path is `scaler_evaluate` which acquires `scaler->lock` then `predictor->lock` ([scaler.c:37-38](src/scaler.c#L37)) — no other code path locks them in the opposite order, so deadlock is impossible.

The bridge spawns the engine and drives both stdin (commands) and the tick rhythm indirectly (`get_status` arrives every 1 s). The tick thread runs autonomously regardless of bridge activity.

---

## File-by-file reference

### [src/compat.h](src/compat.h) — threading abstraction

**Role:** single header that hides the difference between Windows and POSIX so the rest of the engine builds the same on both.

**Provides:**
- `compat_mutex_t` — `CRITICAL_SECTION` on Win32, `pthread_mutex_t` on POSIX.
- `compat_thread_t` — `HANDLE` on Win32, `pthread_t` on POSIX.
- `compat_mutex_init / lock / unlock / destroy` — direct mappings.
- `compat_thread_create / join` — same signature on both platforms.
- `compat_sleep_ms` — wraps `Sleep()` / `nanosleep()`.

All inline `static` functions, header-only, zero linker overhead. Every other `.h` in the tree includes this so `compat_mutex_t` becomes a plain struct member.

**Used by:** every subsystem that has a lock or starts a thread — i.e. all of them.

---

### [src/main.c](src/main.c) — entry point, dispatcher, tick loop

**Role:** owns the engine's lifecycle and global state. Everything else is glue around the five subsystems it instantiates.

**Globals (file-static):**
```c
static ServerPool       g_pool;       // backends
static Cache            g_cache;      // edge cache
static Predictor        g_predictor;  // EMA + trend
static AutoScaler       g_scaler;     // scaling decisions
static MetricsCollector g_metrics;    // per-interval snapshots
static volatile bool    g_running;    // shutdown flag
```

**Threads it owns:** the **tick thread** (`tick_thread()`). The main thread is the one `main()` runs in.

**Message dispatch (`process_message`)** routes incoming JSON `type` strings to handlers:

| Inbound `type` | Handler | What it does |
|---|---|---|
| `route_request` | `handle_route_request` | Cache lookup first; on miss, call `route_request()` from load_balancer.c. Emits `cache_response` or `route_response`. |
| `request_done` | `handle_request_done` | Releases the routed server, updates per-server EMA latency, records metrics. |
| `health_update` | `handle_health_update` | Updates a server's CPU/mem and recomputes its status. |
| `add_server` / `remove_server` | `handle_add_server` / `handle_remove_server` | Pool mutation. |
| `cache_put` / `cache_get` / `cache_remove` | passthroughs into cache.c | Emits `cache_response`. |
| `set_server_count` | `handle_set_server_count` | Sync the scaler's `current_count` with the bridge's actual pool size. |
| `get_status` | `handle_get_status` | Builds a single big `status` JSON containing servers, cache stats, top items, prediction, scaling config + events, metrics, system stats. |
| `shutdown` | inline | Sets `g_running = false`. |

**The tick thread** ([main.c:285-359](src/main.c#L285)) runs every 1000 ms and does, in order:
1. Iterates `g_pool` under its lock to compute per-status totals (healthy/degraded contribute real values; overloaded pinned at 100 % — fix from the degraded-server audit).
2. Computes `avg_cpu`, `avg_mem`, `conn_util`, `rps_score`.
3. Computes the **composite load score** (current weights: 40 % conn_util, 25 % rps, 20 % cpu, 15 % mem — favors real-time signals over /health-derived ones).
4. `predictor_update(&g_predictor, composite)` — pushes the observation, EMA recomputed, trend/spike updated.
5. `scaler_evaluate(&g_scaler, &g_predictor)` — returns a delta; if non-zero, sends a `scale_command` to the bridge.
6. `cache_evict_expired(&g_cache)` — TTL sweep.
7. Sleeps 1 s.

**Connections:** depends on every other module. No module depends on `main.c` (it has no public API).

**stdin buffer:** `static char line_buf[524288]` — 512 KB, kept off the stack to survive Windows' default 1 MB stack under deeply nested cJSON parsing.

---

### [src/server_pool.h](src/server_pool.h) / [src/server_pool.c](src/server_pool.c) — backend registry

**Role:** central directory of backends. Every other subsystem reads or mutates this through its API.

**Structures:**
```c
typedef enum { healthy, overloaded, degraded } Status;

typedef struct {
    char id[64], name[50], ip[46];
    int port;
    Status status;
    double weight;                    // for WLC: lower wlc = active/weight
    int active_connections;           // tracked atomically through inc/dec
    int max_connections;
    int total_connections;            // lifetime
    int requests;
    double cpu, memory, score;
    double ema_latency;               // alpha=0.2 EMA of response latency
} Server;

typedef struct {
    Server servers[MAX_SERVERS];      // MAX_SERVERS = 100, fixed array
    int count;
    compat_mutex_t lock;
} ServerPool;
```

The pool is a **fixed-size array** rather than a linked list — server count is small and bounded, locality matters more than insertion cost. `server_pool_remove` shifts elements to keep them contiguous.

**Key public functions:**
- `add_server / server_pool_remove` — pool mutation.
- `server_pool_find` — linear search by id (returns pointer; caller must hold pool lock).
- `server_pool_update_health` — sets cpu/mem then calls `update_status` which derives `Status` from the 70 / 90 thresholds.
- `server_pool_inc_connections / dec_connections` — used during routing and release.
- `server_pool_update_latency` — per-server EMA on response time, used as a tiebreaker in WLC.
- `compute_score` — weighted blend of load, cpu, memory, history with a `status_factor` multiplier (degraded × 3, overloaded × 2). Stored on the Server struct so it can be exported.
- `update_status` — applies CPU/mem thresholds: > 90 → overloaded, > 70 → degraded, else healthy.
- `server_pool_to_json` — serializes the entire pool for the dashboard.

**Threading:** every public mutator/reader takes `pool->lock`. Helpers like `server_pool_find` and `compute_score` *don't* take the lock — they're meant to be called from inside an already-locked region.

**Used by:** main.c (everywhere), load_balancer.c (during routing), metrics.c (`get_average_score`).

---

### [src/load_balancer.h](src/load_balancer.h) / [src/load_balancer.c](src/load_balancer.c) — routing decisions

**Role:** picks one server per incoming request using **Weighted Least Connections** with two tiebreakers (EMA latency, composite score).

**No own state, no own thread.** A pure decision function over `ServerPool *`.

**Algorithm (`get_best_server`):**
```c
score = (active_connections / weight) * 1000   // primary: WLC
      + (ema_latency / 500.0) * 50             // tiebreak 1: latency
      + compute_score(s) * 0.001;              // tiebreak 2: full composite
```
Two-pass:
1. First pass considers only `healthy` servers and skips any that are at `max_connections`.
2. If no healthy server is eligible, falls back to *any non-overloaded* server (degraded acceptable). This is what keeps the system serving during partial outages.

**`route_request` (the public entry):**
1. Acquires `pool->lock`.
2. Calls `get_best_server` (still inside the lock).
3. On success: increments `active_connections`, increments `total_connections`, `requests`, sets `score`. Builds a `route_response` JSON with `server_id`, `server_name`, `server_ip`, `server_port`, `algorithm: "WLC"`, `score`, `status`, `timestamp`.
4. On no eligible server: returns a `route_response` with `error: "no_healthy_server"`.

**`release_server`:** decrements `active_connections`. Called from `handle_request_done` in main.c when the bridge tells us a request finished.

**Connections:**
- Called from `handle_route_request` in main.c (after a cache miss).
- Calls `server_pool_inc_connections` and `compute_score` from server_pool.c.

---

### [src/cache.h](src/cache.h) / [src/cache.c](src/cache.c) — edge cache

**Role:** in-memory key/value cache with TTL eviction and LRU ordering. Sits in front of routing — a cache hit short-circuits the WLC pass entirely.

**Structures:**
```c
typedef struct Node {
    char key[256], value[4096];
    size_t size;
    time_t created_at;
    int ttl_seconds;
    int hit_count;
    struct Node *prev, *next;        // doubly-linked LRU chain
    struct Node *hash_next;          // separate-chaining bucket
} Node;

typedef struct {
    Node *head, *tail;               // LRU: head = most recently used
    Node *hash_table[1024];          // 1024-bucket open hash with chaining
    int count, capacity;
    long total_hits, total_misses, total_evictions;
    compat_mutex_t lock;
} Cache;
```

**Two data structures, one node:**
- A **doubly-linked list** in MRU-first order (`head` = most recent, `tail` = LRU victim).
- A **separate-chaining hash table** keyed by FNV-1a (`hash_key` returns `hash % 1024`) — buckets thread through `hash_next`.

Each `Node` participates in *both* structures simultaneously, so lookup is O(1) and eviction is O(1).

**Core operations:**
- `cache_get` — hash lookup; if expired, evict and report miss; if hit, bump `hit_count`, move node to head, copy value out via `snprintf`.
- `cache_put` — if key exists, overwrite + move to head; else evict tail until count < capacity, allocate, link in both structures.
- `cache_remove` — explicit removal (used when bridge sees POST/PUT/DELETE).
- `cache_evict_expired` — sweep from tail (oldest entries are most likely expired) and free anything past TTL. Called once per second from the tick thread.

**Threading:** every public function takes `cache->lock`. The lock covers the entire critical section because both data structures must stay consistent.

**Connections:**
- `handle_route_request` in main.c calls `cache_get` first and only routes on miss.
- `handle_cache_put / get / remove` are direct passthroughs.
- Tick thread calls `cache_evict_expired`.
- `cache_stats_to_json` and `cache_top_items_json` produce the cache page on the dashboard.

---

### [src/predictor.h](src/predictor.h) / [src/predictor.c](src/predictor.c) — EMA predictor

**Role:** smooths the per-tick composite load score, detects trend (rising / falling / stable) and spikes, predicts the next observation.

**Structures:**
```c
typedef enum { TREND_STABLE, TREND_RISING, TREND_FALLING } Trend;
typedef enum { ACTION_NONE, ACTION_SCALE_UP, ACTION_SCALE_DOWN } RecommendedAction;

typedef struct {
    double window[60];               // 60-second sliding window (circular)
    int window_count, window_index;
    double ema, alpha;               // alpha=0.5 currently — fast reaction
    double predicted_load;           // ema + rate_of_change
    double confidence;               // window_count / 60
    double rate_of_change;           // ema_now - ema_prev
    Trend trend;
    bool spike_detected;
    RecommendedAction action;
    compat_mutex_t lock;
} Predictor;
```

**`predictor_update(p, observed)` (called every tick):**
1. Push `observed` into the circular window, advance `window_index`.
2. Update EMA: `ema = α·observed + (1-α)·ema`. First observation seeds `ema = observed`.
3. `rate_of_change = ema_now - ema_prev`.
4. Trend: |rate_of_change| > 0.5 sets rising/falling; else stable.
5. Spike: `observed > mean + 2·stddev` (computed over the window).
6. `predicted_load = ema + rate_of_change` — linear extrapolation one tick ahead.
7. Confidence rises with `window_count`, capped at 1.0.
8. Recommended action: `predicted_load > 70 || spike` → up; `< 25 && !rising` → down; else none.

**Threading:** single mutex covers the entire `update`. Nothing else writes to the predictor.

**Connections:**
- `tick_thread` in main.c calls `predictor_update` once per second with the composite score.
- `scaler_evaluate` reads `predicted_load`, `spike_detected`, and `trend` from the predictor — and locks the predictor under the scaler's lock (the only multi-lock path in the engine).
- `predictor_to_json` exports state for the dashboard's Predictions page.

---

### [src/scaler.h](src/scaler.h) / [src/scaler.c](src/scaler.c) — autoscaling decisions

**Role:** turns the predictor's view of load into a +N / −N delta on server count, gated by a cooldown, and records an audit trail.

**Structures:**
```c
typedef enum { SCALE_EVENT_UP, SCALE_EVENT_DOWN } ScaleEventType;

typedef struct {
    ScaleEventType type;
    int from_count, to_count;
    double trigger_load;
    const char *reason;              // string literal, never freed
    time_t timestamp;
} ScaleEvent;

typedef struct {
    int min_servers, max_servers;
    int current_count;               // synced with bridge after each scale
    double scale_up_threshold;       // currently 20.0
    double scale_down_threshold;     // currently 12.0
    int cooldown_seconds;            // currently 4
    time_t last_scale_time;
    ScaleEvent events[100];          // ring buffer of last 100 events
    int event_count, event_index;
    compat_mutex_t lock;
} AutoScaler;
```

**`scaler_evaluate(s, p) → int delta` (called once per tick):**
1. Locks scaler then predictor.
2. If now − last_scale_time < cooldown, returns 0 immediately.
3. Reads `predicted_load` and `spike_detected` from the predictor.
4. **Scale-up branch** (`load > up_threshold || spike`):
   `delta = (load - up_threshold) / 15 + 1`, plus 1 more if spike. Clamped to `max_servers - current_count`.
5. **Scale-down branch** (`load < down_threshold && trend != RISING`):
   `delta = -((down_threshold - load) / 4 + 1)`. Clamped to `min_servers - current_count`.
6. Records a `ScaleEvent` in the ring buffer with from/to/load/reason.
7. Returns the delta. Caller (tick thread) builds a `scale_command` JSON and sends it to stdout; the bridge consumes it and actually spawns/kills server processes.

Both branches are **proportional** — far above threshold scales harder, far below collapses faster. This is what keeps the demo responsive.

**`scaler_set_count(s, n)`:** called from `handle_set_server_count` to keep the scaler's view in sync with the bridge's actual pool. Necessary because the bridge may reject a scale (e.g. limits changed) or add servers slower than the engine commanded.

**Threading:** scaler's mutex covers the read of all fields. The double-lock with the predictor is the only nested-lock site in the engine — and the order is fixed (scaler first, predictor second), so deadlock is impossible.

**Connections:**
- Tick thread calls `scaler_evaluate` after `predictor_update`.
- `scaler_config_to_json`, `scaler_events_to_json`, `scaler_decision_to_json` build payloads for the bridge.
- `should_scale_up / should_scale_down` are convenience wrappers for diagnostics (not on the hot path).

---

### [src/metrics.h](src/metrics.h) / [src/metrics.c](src/metrics.c) — metrics collector

**Role:** counts requests, errors, latencies; produces per-second snapshots and exports current/historical/system views.

**Structures:**
```c
typedef struct {
    double rps, avg_latency_ms, p99_latency_ms;
    long total_requests, total_errors;
    long cache_hits, cache_misses;
    int active_servers;
    double total_cpu, total_memory;
    time_t timestamp;
} MetricSnapshot;

typedef struct {
    MetricSnapshot history[300];          // 5 minutes at 1s intervals
    int history_count, history_index;     // ring buffer indices
    long interval_requests, interval_errors;
    double interval_latency_sum, interval_latency_max;
    double interval_latencies[10000];     // raw samples for p99 qsort
    int interval_latency_count;
    time_t start_time;
    long lifetime_requests, lifetime_errors;
    compat_mutex_t lock;
} MetricsCollector;
```

**Two-tier counting:**
- **Per-request:** `metrics_record_request(latency, is_error, cache_hit)` increments interval counters; called from `handle_request_done` on every completed request.
- **Per-interval flush:** `metrics_flush_interval(active, cpu, mem)` rolls the interval into a snapshot. Computes `rps = interval_requests` (the interval is 1 s) and `p99` by `qsort` over `interval_latencies`. Resets the interval accumulators. Called from the tick thread.

**Why `qsort` per tick?** With ≤ 10 000 samples per second, sorting once per second is cheap (~ ms) and gives an exact p99 instead of a streaming estimate. Memory cap of 10 000 samples bounds it.

**Threading:** single mutex on the entire collector. All public functions take it.

**Connections:**
- `handle_request_done` calls `metrics_record_request`.
- Tick thread calls `metrics_flush_interval` and `metrics_current_to_json` (the latter to read the latest RPS for the composite formula).
- `handle_get_status` exports `metrics_current_to_json` and `metrics_system_to_json`.
- `metrics_history_to_json` is exported but unused by the current dashboard; would feed a "last 5 minutes" trend chart.
- `get_average_score(servers, count)` is a helper that walks an array of `Server` and returns the arithmetic mean of `compute_score(s)` — used only as a debugging utility.

---

### [lib/cJSON.h](lib/cJSON.h) / [lib/cJSON.c](lib/cJSON.c) — vendored JSON library

**Role:** parse incoming JSON from stdin, build outgoing JSON for stdout. Vendored, not modified.

**Why this library:**
- Zero dependencies, single .c file.
- C89-compatible.
- Trivial to embed; the Makefile compiles it directly.
- Hidden symbols via `-DCJSON_HIDE_SYMBOLS` so it can't conflict with another cJSON if linked into a larger system.

**Used by:** every subsystem that exports state (`*_to_json` functions) and `main.c` for parsing inbound messages.

---

## Cross-cutting concerns

### Locking discipline — full graph

```
handle_route_request  ──► cache_get  ──► [cache->lock]
                      ──► route_request ──► [pool->lock]

handle_request_done   ──► release_server ──► [pool->lock]
                      ──► server_pool_update_latency ──► [pool->lock]
                      ──► metrics_record_request ──► [metrics->lock]

handle_health_update  ──► server_pool_update_health ──► [pool->lock]

handle_*_server       ──► add_server / server_pool_remove ──► [pool->lock]

handle_cache_*        ──► cache_*  ──► [cache->lock]

handle_set_server_count ──► scaler_set_count ──► [scaler->lock]

handle_get_status     ──► server_pool_to_json ──► [pool->lock]      (released)
                      ──► cache_stats_to_json ──► [cache->lock]    (released)
                      ──► predictor_to_json ──► [predictor->lock]  (released)
                      ──► scaler_*_to_json ──► [scaler->lock]      (released)
                      ──► metrics_*_to_json ──► [metrics->lock]    (released)
                                       (no two locks held simultaneously)

tick_thread:
  ┌── [pool->lock] (read all servers, compute averages, release)
  ├── metrics_flush_interval ──► [metrics->lock] (release)
  ├── metrics_current_to_json ──► [metrics->lock] (release)
  ├── predictor_update ──► [predictor->lock] (release)
  ├── scaler_evaluate ──► [scaler->lock] then [predictor->lock] ◄── ONLY nested case
  └── cache_evict_expired ──► [cache->lock] (release)
```

The only nested lock acquisition is **scaler → predictor** in `scaler_evaluate`. No code path takes them in the opposite order, so deadlock is impossible. All other paths take one lock at a time.

### Message protocol — wire format

Every message is **a single JSON object on one line**, terminated by `\n`. The engine's main loop uses `fgets` into a 512 KB static buffer; the bridge's stdout reader splits on `\n` similarly. Required field on every message: `"type": "<string>"`.

Inbound message types are listed in the dispatch table in [main.c process_message](src/main.c). Outbound messages are emitted by handlers and the tick thread:

| Outbound `type` | Emitted by | Trigger |
|---|---|---|
| `engine_started` | `main()` startup | Once at boot. |
| `route_response` | `handle_route_request` (miss path) | Per request. |
| `cache_response` | `handle_route_request` (hit path), `handle_cache_get` | Per request / per explicit get. |
| `server_added` / `server_removed` | `handle_add_server` / `handle_remove_server` | Per pool mutation. |
| `scale_command` | tick thread, when `scaler_evaluate` returns nonzero delta | At most once per cooldown. |
| `status` | `handle_get_status` | When bridge polls `get_status` (every ~1 s). |
| `error` | various handlers | Malformed / missing fields. |

### Memory model

- `Server[]` and `MetricSnapshot history[]` are fixed arrays inside their parent struct — no allocation on the hot path.
- `Cache` allocates `Node` per entry on `cache_put` and `free`s on eviction/remove/destroy. This is the only subsystem that does heap traffic during normal operation.
- `cJSON` allocates and frees per message. Long-lived objects always end with `cJSON_Delete(obj)` to recursively free children.
- No reference counting, no shared ownership — every cJSON returned from a `*_to_json` function is owned by the caller and deleted after `send_message`.

### Build

[Makefile](Makefile) compiles every `src/*.c` plus `lib/cJSON.c` to `build/*.o`, then links into `build/engine.exe` (Windows) or `build/engine` (POSIX). Single output binary, no shared libs. CFLAGS: `-Wall -Wextra -O2 -DCJSON_HIDE_SYMBOLS -Ilib -Isrc`. Linker: `-lm` for `sqrt` in the predictor.

---

## Lifecycle in one paragraph

The bridge spawns `engine.exe`. `main()` initializes the five subsystems, sends `engine_started`, starts the tick thread, then enters the stdin loop. The bridge sends `add_server` for the initial backends; the engine populates `g_pool`. The bridge sends `route_request` per inbound HTTP request; the engine consults the cache, otherwise picks a server via WLC and emits `route_response`; the bridge forwards to that backend, sends `request_done` on completion. Every 2 s (now 500 ms) the bridge polls each backend's `/health` and forwards CPU/mem as `health_update`; the engine updates per-server status. Every 1 s the engine's tick thread aggregates the pool, runs the predictor, evaluates the scaler, evicts expired cache, and may emit a `scale_command`. The bridge spawns or kills server processes in response and sends `set_server_count` to keep the scaler's view consistent. On `SIGINT`, the bridge sends `shutdown`; `g_running` flips false; the tick thread exits its sleep, joins; subsystems are destroyed; `engine_stopped` is emitted; the process exits.
