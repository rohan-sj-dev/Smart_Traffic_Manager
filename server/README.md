# LoadC Backend Servers

Simulated backend servers that produce real CPU, ML, and image-processing workloads. The C load-balancer engine routes traffic across these instances.

---

## Quick Start (No Docker Required)

```bash
cd server
npm install

# Launch all 3 servers in one command
npm run start:all
```

This spawns **3 local processes** on ports 3001 / 3002 / 3003, identical to how docker-compose would run them.

### Run the Test Suite

With servers running in one terminal, open another and:

```bash
npm test
```

Output:

```
  PASS  :3001 /health           Health Check                         [server-alpha]
  PASS  :3001 /cpu              CPU Workload                   73ms  [server-alpha]
  PASS  :3001 /ml               ML Gradient Descent             8ms  [server-alpha]
  PASS  :3001 /image            Image Processing               27ms  [server-alpha]
  ... (24 tests across 3 servers)
  Results: 24 passed, 0 failed, 0 skipped out of 24
```

### Run a Single Server

```bash
# Custom port and ID
SERVER_ID=my-server PORT=4000 npm start

# PowerShell
$env:SERVER_ID="my-server"; $env:PORT="4000"; npm start
```

---

## With Docker

```bash
# From project root (LoadC/)
docker-compose up --build
```

| Container | Port | Server ID |
|---|---|---|
| loadc-server-alpha | 3001 | server-alpha |
| loadc-server-beta | 3002 | server-beta |
| loadc-server-gamma | 3003 | server-gamma |

Each container is capped at 0.5 CPU / 256 MB RAM.

---

## API Endpoints

Every response includes `server_id` and `timestamp`. Workload endpoints wrap output in a `result` object with `processing_time_ms`.

### `GET /health`

Health check used by the C engine for polling.

```json
{
  "status": "healthy",
  "server_id": "server-alpha",
  "cpu": 3.46,
  "memory": 79.91,
  "active_connections": 1,
  "uptime": 120,
  "timestamp": 1775225858058
}
```

### `GET /cpu`

**Heavy CPU workload** ΓÇö matrix multiplication (100├ù100), prime factorization, recursive Fibonacci(35).

```json
{
  "result": {
    "workload": "cpu",
    "matrix_top_left": 2780.02,
    "prime_factors_of_1234567890": [2, 3, 3, 5, 3607, 3803],
    "fibonacci_35": 9227465,
    "processing_time_ms": 73
  },
  "server_id": "server-alpha"
}
```

### `GET /ml`

**ML simulation** ΓÇö gradient descent linear regression on `y = 3x + 7`, 500 samples, 1000 epochs.

```json
{
  "result": {
    "workload": "ml_gradient_descent",
    "target": "y = 3x + 7",
    "learned_weight": 3.001,
    "learned_bias": 7.033,
    "final_loss": 0.333,
    "epochs_trained": 1000,
    "processing_time_ms": 7
  },
  "server_id": "server-alpha"
}
```

### `GET /image`

**Image processing** ΓÇö generates 512├ù512 pixel array, applies Gaussian blur (3├ù3 kernel), then Sobel edge detection.

```json
{
  "result": {
    "workload": "image_processing",
    "image_size": "512x512",
    "total_pixels": 262144,
    "operations": ["gaussian_blur_3x3", "sobel_edge_detection"],
    "edge_pixels_detected": 215107,
    "max_gradient": 767.0,
    "processing_time_ms": 27
  },
  "server_id": "server-alpha"
}
```

### `GET /data`

**Static cacheable data** ΓÇö returns the same JSON every time (for testing the C engine's LRU cache).

### `GET /api/train`

**Heavy ML training** ΓÇö multi-feature regression (`y = 2xΓéü + 3xΓéé ΓêÆ 1.5xΓéâ + 10`), 1000 samples, 2000 epochs.

### `GET /api/predict`

**Batch inference** ΓÇö runs 100 predictions through a pre-trained model.

### `GET /api/datasets`

Lists available training datasets (alias for `/data`).

---

## How the C Engine Uses These Servers

1. **Health polling** ΓÇö Engine calls `GET /health` every second on each server, updates CPU/memory/connection counts in `server_pool`
2. **Request routing** ΓÇö Bridge forwards client requests to the engine, which picks a server via Weighted Least Connections (WLC), then the bridge forwards to that server's workload endpoint
3. **Cache integration** ΓÇö `/data` responses are cached by the engine's LRU cache; subsequent requests return cache hits without hitting the backend
4. **Auto-scaling** ΓÇö When CPU/connection metrics cross thresholds, the engine's scaler module emits scale-up/down commands; the bridge can spawn/kill additional server processes

---

## File Structure

```
server/
Γö£ΓöÇΓöÇ index.js             Express server (all endpoints)
Γö£ΓöÇΓöÇ start-all.js         Launches 3 instances locally (Docker alternative)
Γö£ΓöÇΓöÇ test-endpoints.js    Automated test suite
Γö£ΓöÇΓöÇ package.json
Γö£ΓöÇΓöÇ Dockerfile           Node.js 20 Alpine container image
ΓööΓöÇΓöÇ .dockerignore
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_ID` | `server-<hostname>` | Unique identifier returned in every response |
| `PORT` | `3000` | Listen port |