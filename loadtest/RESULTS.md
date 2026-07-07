# Benchmark Results — WLC vs Round-Robin

Measured on 2026-07-07 with `loadtest/benchmark.js` against the full stack:
benchmark client → bridge (`POST /api/proxy`) → routing decision → backend → response.

Both algorithms share the identical forwarding pipeline in the bridge; the only
difference is the routing decision (C engine WLC vs plain round-robin), so the
deltas below are attributable to the algorithm alone. Every request carries a
unique query string so the engine cache never hits (cache is not part of this
comparison). Autoscaling was pinned to exactly 3 servers for the duration.

## Environment

| | |
|---|---|
| CPU | Intel Core i5-12500H (12 cores / 16 threads) |
| RAM | 16 GB |
| OS | Windows 11 |
| Node | v22.15.1 |
| Engine | C (gcc -O2), weighted-least-connections + EMA latency feedback |
| Pool | 3 heterogeneous backends — capacity 1.0 / 0.6 / 0.3, connection caps 100 / 60 / 30 |
| Method | Closed-loop (each worker sends its next request when the previous completes) |

## 1. Mixed workload — WLC vs round-robin (concurrency 100, 30 s)

Workload: 60% cheap reads (`/data`, `/api/datasets`, `/api/predict`),
40% CPU-bound (`/cpu`, `/ml`, `/image`). Slow backends simulate reduced capacity
by busy-waiting, so bad placement queues up — this is where routing quality shows.

| Metric | Round-Robin | WLC (engine) | Change |
|---|---|---|---|
| Throughput | 71.1 req/s | **338.6 req/s** | **+376% (4.8×)** |
| Avg latency | 1,337 ms | **291 ms** | **−78%** |
| p95 latency | 4,443 ms | 658 ms | −85% |
| p99 latency | 7,076 ms | **934 ms** | **−87%** |
| Errors | 0% | 0% | — |

Request distribution (why it wins): round-robin splits blindly 33/33/33 across
unequal servers; WLC shifted traffic to match real capacity:

| | alpha (fast) | beta (medium) | gamma (slow) |
|---|---|---|---|
| Round-robin | 33.3% | 33.3% | 33.3% |
| WLC | **73.2%** | 19.3% | 7.4% |

## 2. Light workload — pipeline throughput ceiling (reads only, 20 s)

| Metric | Round-Robin | WLC (engine) | Change |
|---|---|---|---|
| Throughput (C=100) | 2,636 req/s | 2,665 req/s | +1% |
| Avg latency (C=100) | 37.9 ms | 37.5 ms | −1% |
| p99 latency (C=100) | 62.1 ms | 53.8 ms | **−13%** |
| At C=30 | — | **3,176 req/s, 9.4 ms avg / 17.5 ms p99** | |

On a homogeneous cheap workload the algorithms converge on throughput (as
expected — there is nothing to rebalance), but WLC still trims the tail.

## 3. Concurrency sweep — max stable connections (WLC, mixed workload)

| Concurrency | Throughput | Avg | p99 | Errors |
|---|---|---|---|---|
| 50 | 277 req/s | 176 ms | 978 ms | 0% |
| 100 | 317 req/s | 302 ms | 987 ms | 0% |
| **150** | **315 req/s** | **450 ms** | **1,225 ms** | **0%** |
| 200 | — | — | — | 88% (load-shed) |
| 250–300 | — | — | — | ~90% (load-shed) |

The pool's configured capacity is 190 connection slots (100+60+30).
**150 concurrent closed-loop clients were held stably with 0% errors**; past the
configured cap the engine rejects immediately rather than queueing into
collapse, sustaining ~2,900 routing decisions/sec while shedding load.

## Resume-ready bullets

> - Engineered a load balancer in C (weighted least-connections with EMA latency
>   feedback) fronting heterogeneous Node.js backends; versus a round-robin
>   baseline on the identical pipeline it delivered **4.8× throughput
>   (71 → 339 req/s)** and cut **p99 latency 87% (7.1 s → 934 ms)** on a
>   CPU-bound workload.
> - Sustained **2,700+ req/s** end-to-end (**9.4 ms avg / 17.5 ms p99** at
>   moderate concurrency) through the Node bridge + C routing engine.
> - Held **150 concurrent connections with 0% errors** on a 3-server pool;
>   beyond the pool's 190-slot capacity the engine sheds load with immediate
>   rejections (~2,900 routing decisions/sec) instead of collapsing.

## Reproduce

```bash
# 1. Build the engine
cd engine && make

# 2. Start the stack (spawns the 3 backends + engine) with synthetic dashboard traffic off
TRAFFIC_GEN=0 node bridge/bridge.js

# 3. In another terminal
node loadtest/benchmark.js --sweep              # full comparison + concurrency sweep
node loadtest/benchmark.js --workload light     # pipeline throughput ceiling
```

Raw per-run JSON (including per-server distributions) is written to
`loadtest/results/benchmark-<timestamp>.json`.
