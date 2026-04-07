const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');

const BRIDGE_PORT = 4000;
const ENGINE_PATH = path.join(__dirname, '..', 'engine', 'build', 'engine.exe');

const BACKENDS = [
    { id: 'server-alpha', name: 'Alpha', ip: '127.0.0.1', port: 3001, weight: 1.0, max_connections: 100 },
    { id: 'server-beta',  name: 'Beta',  ip: '127.0.0.1', port: 3002, weight: 1.0, max_connections: 100 },
    { id: 'server-gamma', name: 'Gamma', ip: '127.0.0.1', port: 3003, weight: 1.0, max_connections: 100 },
];

const WORKLOAD_ENDPOINTS = ['/cpu', '/ml', '/image', '/data', '/api/train', '/api/predict', '/api/datasets'];
const HEALTH_POLL_MS = 2000;
const STATUS_POLL_MS = 1000;
const TRAFFIC_INTERVAL_MS = 1500;


let engine = null;
let engineReady = false;
let engineBuffer = '';
let requestCounter = 0;
const pendingRequests = new Map();
const serverHealth = new Map();
const recentLogs = [];         
const MAX_LOGS = 200;


let lastStatus = null;

const app = express();
app.use(express.json());


app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/api/health', (_req, res) => {
    res.json({ bridge: 'ok', engine: engineReady, backends: BACKENDS.length });
});

app.get('/api/status', (_req, res) => {
    if (lastStatus) return res.json(buildDashboardState());
    res.status(503).json({ error: 'Engine status not yet available' });
});

app.get('/api/logs', (_req, res) => {
    res.json(recentLogs);
});
app.post('/api/request', (req, res) => {
    const { url, method } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const id = `req-${++requestCounter}`;
    sendToEngine({ type: 'route_request', request_id: id, url, method: method || 'GET' });

    const timer = setTimeout(() => {
        pendingRequests.delete(id);
        res.status(504).json({ error: 'Engine timeout' });
    }, 10000);
    pendingRequests.set(id, { resolve: (data) => { clearTimeout(timer); res.json(data); }, timer, start: Date.now() });
});
app.post('/api/cache/put', (req, res) => {
    const { key, value, ttl } = req.body || {};
    if (!key || !value) return res.status(400).json({ error: 'key and value required' });
    sendToEngine({ type: 'cache_put', key, value, size: value.length, ttl: ttl || 300 });
    res.json({ ok: true });
});

app.get('/api/cache/:key', (req, res) => {
    sendToEngine({ type: 'cache_get', key: req.params.key });
    res.json({ sent: true });
});

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    if (lastStatus) ws.send(JSON.stringify({ type: 'status', data: buildDashboardState() }));
    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw);
            if (msg.type === 'get_status') sendToEngine({ type: 'get_status' });
            if (msg.type === 'route_request') {
                const id = `req-${++requestCounter}`;
                sendToEngine({ type: 'route_request', request_id: id, url: msg.url || '/data', method: msg.method || 'GET' });
            }
        } catch (_) {}
    });
});

function broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(data);
    }
}

function startEngine() {
    console.log(`[bridge] Spawning engine: ${ENGINE_PATH}`);
    engine = spawn(ENGINE_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });

    engine.stdout.on('data', (chunk) => {
        engineBuffer += chunk.toString();
        let newlineIdx;
        while ((newlineIdx = engineBuffer.indexOf('\n')) !== -1) {
            const line = engineBuffer.slice(0, newlineIdx).trim();
            engineBuffer = engineBuffer.slice(newlineIdx + 1);
            if (line) handleEngineMessage(line);
        }
    });

    engine.stderr.on('data', (chunk) => {
        console.error(`[engine stderr] ${chunk.toString().trim()}`);
    });

    engine.on('close', (code) => {
        console.log(`[bridge] Engine exited with code ${code}`);
        engineReady = false;
        broadcast({ type: 'engine_status', connected: false });
        // Auto-restart after 3s
        setTimeout(() => {
            console.log('[bridge] Restarting engine...');
            startEngine();
        }, 3000);
    });

    engine.on('error', (err) => {
        console.error(`[bridge] Failed to spawn engine: ${err.message}`);
    });
}

function sendToEngine(obj) {
    if (!engine || !engine.stdin.writable) return;
    engine.stdin.write(JSON.stringify(obj) + '\n');
}

function handleEngineMessage(line) {
    let msg;
    try { msg = JSON.parse(line); } catch (_) {
        console.log(`[engine raw] ${line}`);
        return;
    }

    switch (msg.type) {
        case 'engine_started':
            console.log(`[bridge] Engine started v${msg.version} (${msg.algorithm})`);
            engineReady = true;
            registerBackends();
            broadcast({ type: 'engine_status', connected: true });
            break;

        case 'server_added':
            console.log(`[bridge] Server registered: ${msg.server_id} (success=${msg.success})`);
            break;

        case 'route_response': {
            const pending = pendingRequests.get(msg.request_id);
            if (pending) {
                pendingRequests.delete(msg.request_id);
                pending.resolve(msg);
            }
            forwardToBackend(msg);
            broadcast({ type: 'route', data: msg });
            break;
        }

        case 'cache_response':
            broadcast({ type: 'cache_event', data: msg });
            if (msg.request_id) {
                const pending = pendingRequests.get(msg.request_id);
                if (pending) {
                    pendingRequests.delete(msg.request_id);
                    pending.resolve(msg);
                }
                addLog({ url: msg.url || msg.key, cacheHit: true, statusCode: 200, latency: 0, serverRouted: 'cache' });
            }
            break;

        case 'status':
            lastStatus = msg;
            broadcast({ type: 'status', data: buildDashboardState() });
            break;

        case 'scale_command':
            broadcast({ type: 'scaling_event', data: msg });
            break;

        case 'error':
            console.error(`[engine error] ${msg.message}`);
            broadcast({ type: 'error', data: msg });
            break;

        default:
            broadcast({ type: msg.type, data: msg });
    }
}


function registerBackends() {
    for (const b of BACKENDS) {
        sendToEngine({ type: 'add_server', id: b.id, name: b.name, ip: b.ip, port: b.port, weight: b.weight, max_connections: b.max_connections });
    }
}

function forwardToBackend(routeMsg) {
    const serverId = routeMsg.server_id;
    const backend = BACKENDS.find(b => b.id === serverId);
    if (!backend) return;

    const url = routeMsg.url || '/data';
    const start = Date.now();

    httpGet(`http://${backend.ip}:${backend.port}${url}`)
        .then((result) => {
            const latency = Date.now() - start;
            sendToEngine({
                type: 'request_done',
                request_id: routeMsg.request_id,
                server_id: serverId,
                latency_ms: latency,
                status_code: 200,
                cache_hit: false,
            });
            sendToEngine({ type: 'cache_put', key: `${serverId}:${url}`, value: JSON.stringify(result).slice(0, 512), ttl: 60 });
            addLog({ url, cacheHit: false, statusCode: 200, latency, serverRouted: serverId, method: 'GET' });
        })
        .catch((err) => {
            const latency = Date.now() - start;
            sendToEngine({
                type: 'request_done',
                request_id: routeMsg.request_id,
                server_id: serverId,
                latency_ms: latency,
                status_code: 500,
                cache_hit: false,
            });
            addLog({ url, cacheHit: false, statusCode: 500, latency, serverRouted: serverId, method: 'GET' });
        });
}

function pollHealth() {
    for (const b of BACKENDS) {
        httpGet(`http://${b.ip}:${b.port}/health`)
            .then((data) => {
                serverHealth.set(b.id, data);

                const jitter = (Math.random() - 0.5) * 10;
                const cpu = Math.min(95, Math.max(1, (data.cpu ?? 5) + jitter));
                const memory = Math.min(95, Math.max(5, 30 + (data.active_connections ?? 0) * 2 + jitter));
                sendToEngine({
                    type: 'health_update',
                    server_id: b.id,
                    cpu,
                    memory,
                    healthy: data.status === 'healthy',
                });
            })
            .catch(() => {
                sendToEngine({ type: 'health_update', server_id: b.id, cpu: 0, memory: 0, healthy: false });
            });
    }
}

// ─── Traffic Generator ───────────────────────────────────────────────────────

function generateTraffic() {
    if (!engineReady) return;
    const url = WORKLOAD_ENDPOINTS[Math.floor(Math.random() * WORKLOAD_ENDPOINTS.length)];
    const id = `req-${++requestCounter}`;
    sendToEngine({ type: 'route_request', request_id: id, url, method: 'GET' });
}

// ─── Dashboard State Builder ─────────────────────────────────────────────────

const trafficHistory = [];  // { time, actual, predicted }
const scalingEvents = [];

function buildDashboardState() {
    const s = lastStatus || {};

    // Build servers array matching frontend shape
    const servers = (s.servers || []).map((srv) => {
        const health = serverHealth.get(srv.id) || {};
        return {
            id: srv.id,
            name: srv.name || srv.id,
            containerId: srv.id.slice(0, 12),
            ip: srv.ip || '127.0.0.1',
            port: srv.port || 0,
            status: srv.status || 'healthy',
            cpu: srv.cpu ?? health.cpu ?? 0,
            memory: srv.memory ?? health.memory ?? 0,
            activeConnections: srv.active_connections ?? 0,
            maxConnections: srv.max_connections ?? 100,
            weight: srv.weight ?? 1.0,
            uptime: health.uptime ?? 0,
            totalRequests: srv.total_requests ?? srv.requests ?? 0,
        };
    });

    // Cache stats
    const cache = s.cache || {};
    const totalHits = cache.total_hits ?? 0;
    const totalMisses = cache.total_misses ?? 0;
    const total = totalHits + totalMisses;
    const cacheStats = {
        hitRate: total > 0 ? ((totalHits / total) * 100).toFixed(1) : '0.0',
        missRate: total > 0 ? ((totalMisses / total) * 100).toFixed(1) : '0.0',
        totalHits,
        totalMisses,
        totalEntries: cache.entries ?? 0,
        maxEntries: cache.capacity ?? 1024,
        memoryUsed: (cache.entries ?? 0) * 0.5,
        maxMemory: 512,
        evictions: cache.total_evictions ?? 0,
        avgTtl: 60,
        topItems: (s.cache_items || []).slice(0, 10).map(item => ({
            url: item.key,
            hits: item.hit_count ?? 0,
            size: ((item.size ?? 0) / 1024).toFixed(1),
            ttl: item.ttl ?? 0,
            lastAccessed: new Date().toISOString(),
        })),
    };

    // Predictions
    const pred = s.prediction || {};
    const scaling = s.scaling || {};
    const predictions = {
        currentLoad: pred.ema ?? pred.current_rps ?? 0,
        predictedLoad: pred.predicted_load ?? pred.predicted_rps ?? 0,
        confidence: pred.confidence ?? 0.85,
        trend: pred.trend ?? 'stable',
        rateOfChange: pred.rate_of_change ?? 0,
        spikeDetected: pred.spike_detected ?? false,
        recommendedAction: pred.recommended_action ?? scaling.recommended_action ?? 'hold',
        emaAlpha: pred.alpha ?? 0.3,
        windowSize: pred.window_size ?? 10,
    };

    // Traffic history (keep last 60 data points)
    trafficHistory.push({
        time: new Date().toISOString(),
        timestamp: Date.now(),
        actual: predictions.currentLoad,
        predicted: predictions.predictedLoad,
    });
    if (trafficHistory.length > 60) trafficHistory.shift();

    // Metrics
    const met = s.metrics || {};
    const sys = s.system || {};
    const metrics = {
        totalRequests: met.total_requests ?? met.lifetime_requests ?? requestCounter,
        requestsPerSecond: met.rps ?? pred.ema ?? 0,
        avgLatency: met.avg_latency_ms ?? 0,
        p99Latency: met.p99_latency_ms ?? 0,
        activeServers: servers.filter(s => s.status === 'healthy').length,
        totalServers: servers.length,
        cacheHitRate: parseFloat(cacheStats.hitRate),
        uptime: sys.uptime_seconds ?? met.uptime_seconds ?? Math.floor((Date.now() - startTime) / 1000),
        predictedLoad: predictions.predictedLoad,
        currentLoad: predictions.currentLoad,
    };

    // Scaling config
    const scalingConfig = {
        minServers: scaling.min_servers ?? 1,
        maxServers: scaling.max_servers ?? 10,
        currentServers: servers.length,
        scaleUpThreshold: scaling.scale_up_threshold ?? 80,
        scaleDownThreshold: scaling.scale_down_threshold ?? 30,
        cooldownPeriod: scaling.cooldown_seconds ?? 30,
        emaAlpha: predictions.emaAlpha,
        spikeThreshold: scaling.spike_threshold ?? 2.0,
    };

    return { servers, cacheStats, predictions, trafficHistory: [...trafficHistory], metrics, scalingEvents: [...scalingEvents], scalingConfig, logs: recentLogs.slice(-50) };
}

// ─── Log ring buffer ─────────────────────────────────────────────────────────

let logId = 0;
function addLog({ url, cacheHit, statusCode, latency, serverRouted, method }) {
    const entry = {
        id: ++logId,
        timestamp: new Date().toISOString(),
        method: method || 'GET',
        url,
        serverRouted: serverRouted || 'unknown',
        statusCode: statusCode || 200,
        latency: latency || 0,
        cacheHit: !!cacheHit,
        clientIp: '127.0.0.1',
    };
    recentLogs.push(entry);
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
    broadcast({ type: 'log', data: entry });
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 8000 }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (_) { resolve(body); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

// ─── Boot ────────────────────────────────────────────────────────────────────

const startTime = Date.now();

httpServer.listen(BRIDGE_PORT, () => {
    console.log(`[bridge] HTTP + WS server on http://localhost:${BRIDGE_PORT}`);
    startEngine();

    // Poll health every 2s
    setInterval(pollHealth, HEALTH_POLL_MS);

    // Ask engine for full status every 1s
    setInterval(() => {
        if (engineReady) sendToEngine({ type: 'get_status' });
    }, STATUS_POLL_MS);

    // Generate traffic every 1.5s
    setInterval(generateTraffic, TRAFFIC_INTERVAL_MS);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[bridge] Shutting down...');
    if (engine && engine.stdin.writable) {
        sendToEngine({ type: 'shutdown' });
    }
    setTimeout(() => process.exit(0), 1000);
});
