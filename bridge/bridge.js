const { spawn, fork } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const db = require('./db');

const BRIDGE_PORT = 4000;
const ENGINE_PATH = path.join(__dirname, '..', 'engine', 'build', 'engine.exe');

const INITIAL_BACKENDS = [
    { id: 'server-alpha', name: 'Alpha', ip: '127.0.0.1', port: 3001, weight: 1.0, max_connections: 100, capacity: 0.6 },
    { id: 'server-beta',  name: 'Beta',  ip: '127.0.0.1', port: 3002, weight: 0.6, max_connections: 60,  capacity: 0.4 },
    { id: 'server-gamma', name: 'Gamma', ip: '127.0.0.1', port: 3003, weight: 0.3, max_connections: 30,  capacity: 0.3 },
];

const AUTO_SPAWN_INITIAL = process.env.AUTO_SPAWN_INITIAL !== '0';
const initialProcesses = new Map();

const BACKENDS = [...INITIAL_BACKENDS];
const dynamicProcesses = new Map();
const SERVER_SCRIPT = path.join(__dirname, '..', 'server', 'index.js');
let nextPort = 3004;
const SCALE_NAMES = ['Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
let scaleNameIdx = 0;
let MIN_SERVERS = 3;
let MAX_SERVERS = 10;

const WORKLOAD_ENDPOINTS = ['/cpu', '/ml', '/image', '/data', '/api/train', '/api/predict', '/api/datasets'];
const HEALTH_POLL_MS = 500;       
const STATUS_POLL_MS = 1000;
const SHUTDOWN_GRACE_MS = 2000;

const TRAFFIC_INTERVAL_MS = 500;
const MAX_INFLIGHT = 80;          
let inflight = 0;
let rrIndex = 0;
const drainingServers = new Set();

const ENDPOINT_TTL = {
    '/data':          120,
    '/api/datasets':  120,
    '/api/predict':    30,
    '/cpu':            10,
    '/ml':             15,
    '/image':          20,
    '/api/train':       0,
};
const DEFAULT_TTL = 60;

let engine = null;
let engineReady = false;
let engineBuffer = '';
let requestCounter = 0;
const pendingRequests = new Map();
const pendingMethods = new Map();
const serverHealth = new Map();
const recentLogs = [];         
const MAX_LOGS = 200;

let lastStatus = null;

const app = express();
app.use(express.json());

app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    next();
});

app.options(/.*/, (_req, res) => {
    res.sendStatus(204);
});

app.get('/api/health', (_req, res) => {
    res.json({ bridge: 'ok', engine: engineReady, backends: BACKENDS.length, db: db.isConnected() });
});

app.get('/api/status', (_req, res) => {
    if (lastStatus) return res.json(buildDashboardState());
    res.status(503).json({ error: 'Engine status not yet available' });
});

app.get('/api/logs', async (req, res) => {
    try {
        if (req.query.source === 'db') {
            const data = await db.getRequestLogs({
                range: req.query.range || '24h',
                from: req.query.from,
                to: req.query.to,
                limit: req.query.limit || 200,
            });
            return res.json(data);
        }
        res.json({ dbConnected: db.isConnected(), logs: recentLogs });
    } catch (err) {
        console.error('[api/logs] error:', err.message);
        res.status(500).json({ error: 'Could not load request logs' });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const history = await db.getHistory(req.query.range);
        if (!history.dbConnected) {
            return res.status(503).json({ error: 'Database is not connected', ...history });
        }
        res.json(history);
    } catch (err) {
        console.error('[api/history] error:', err.message);
        res.status(500).json({ error: 'Could not load history from database' });
    }
});

function fallbackRoute() {
    if (BACKENDS.length === 0) return null;
    const backend = BACKENDS[rrIndex % BACKENDS.length];
    rrIndex++;
    return backend;
}

function routeDirectly(url, method, requestId) {
    const backend = fallbackRoute();
    if (!backend) return null;

    const start = Date.now();
    inflight++;
    httpGet(`http://${backend.ip}:${backend.port}${url}`)
        .then((result) => {
            const latency = Date.now() - start;
            addLog({ url, cacheHit: false, statusCode: 200, latency, serverRouted: backend.id, method });
        })
        .catch((err) => {
            const latency = Date.now() - start;
            addLog({ url, cacheHit: false, statusCode: 500, latency, serverRouted: backend.id, method });
        })
        .finally(() => { inflight--; });

    return backend;
}

app.post('/api/request', (req, res) => {
    const { url, method } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    const id = `req-${++requestCounter}`;
    const m = (method || 'GET').toUpperCase();

    if (!engineReady) {
        const backend = fallbackRoute();
        if (!backend) return res.status(503).json({ error: 'No backend servers available' });

        const start = Date.now();
        inflight++;
        httpGet(`http://${backend.ip}:${backend.port}${url}`)
            .then((result) => {
                const latency = Date.now() - start;
                addLog({ url, cacheHit: false, statusCode: 200, latency, serverRouted: backend.id, method: m });
                res.json({ request_id: id, server_id: backend.id, url, latency, fallback: true });
            })
            .catch((err) => {
                const latency = Date.now() - start;
                addLog({ url, cacheHit: false, statusCode: 500, latency, serverRouted: backend.id, method: m });
                res.status(500).json({ error: err.message, server_id: backend.id });
            })
            .finally(() => { inflight--; });
        return;
    }

    if (m !== 'GET') {
        sendToEngine({ type: 'cache_remove', key: url });
    }

    pendingMethods.set(id, m);
    sendToEngine({ type: 'route_request', request_id: id, url, method: m });

    const start = Date.now();
    const timer = setTimeout(() => {
        pendingRequests.delete(id);
        
        const backend = fallbackRoute();
        if (!backend) return res.status(504).json({ error: 'Engine timeout, no backends' });
        inflight++;
        httpGet(`http://${backend.ip}:${backend.port}${url}`)
            .then((result) => {
                const latency = Date.now() - start;
                addLog({ url, cacheHit: false, statusCode: 200, latency, serverRouted: backend.id, method: m });
                res.json({ request_id: id, server_id: backend.id, url, fallback: true });
            })
            .catch(() => {
                res.status(504).json({ error: 'Engine timeout and backend unreachable' });
            })
            .finally(() => { inflight--; });
    }, 10000);
    pendingRequests.set(id, { resolve: (data) => { clearTimeout(timer); res.json(data); }, timer, start });
});

app.post('/api/simulate-load', (req, res) => {
    const { url, count, method } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    simulateLoad(url, count, method);
    res.json({ ok: true, url, count: Math.max(1, Math.min(500, parseInt(count, 10) || 10)), method: (method || 'GET').toUpperCase() });
});

app.post('/api/cache/put', (req, res) => {
    const { key, value, ttl } = req.body || {};
    if (!key || !value) return res.status(400).json({ error: 'key and value required' });
    
    const safeValue = typeof value === 'string' ? value.slice(0, 409600) : JSON.stringify(value).slice(0, 409600);
    sendToEngine({ type: 'cache_put', key, value: safeValue, size: safeValue.length, ttl: ttl || 300 });
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
            if (msg.type === 'get_status') {
                if (engineReady) {
                    sendToEngine({ type: 'get_status' });
                } else if (lastStatus) {
                    ws.send(JSON.stringify({ type: 'status', data: buildDashboardState() }));
                }
            }
            if (msg.type === 'route_request') {
                const id = `req-${++requestCounter}`;
                const m = (msg.method || 'GET').toUpperCase();
                if (engineReady) {
                    if (m !== 'GET') sendToEngine({ type: 'cache_remove', key: msg.url || '/data' });
                    pendingMethods.set(id, m);
                    sendToEngine({ type: 'route_request', request_id: id, url: msg.url || '/data', method: m });
                } else {
                    
                    routeDirectly(msg.url || '/data', m, id);
                }
            }
            if (msg.type === 'set_scaling_limits') {
                applyScalingLimits(msg.minServers, msg.maxServers);
            }
            if (msg.type === 'simulate_load') {
                simulateLoad(msg.url, msg.count, msg.method, msg.durationSec);
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

function spawnBackendProcess(backend, { dynamic = false } = {}) {
    const child = fork(SERVER_SCRIPT, [], {
        env: {
            ...process.env,
            SERVER_ID: backend.id,
            PORT: String(backend.port),
            SERVER_CAPACITY: String(backend.weight || 1.0),
        },
        stdio: 'pipe',
    });

    const processMap = dynamic ? dynamicProcesses : initialProcesses;
    processMap.set(backend.id, child);

    child.stdout?.on('data', (chunk) => {
        const line = chunk.toString().trim();
        if (line) console.log(`[${backend.id}] ${line}`);
    });
    child.stderr?.on('data', (chunk) => {
        const line = chunk.toString().trim();
        if (line) console.error(`[${backend.id} stderr] ${line}`);
    });
    child.on('error', (err) => console.error(`[backend] ${backend.id} error: ${err.message}`));
    child.on('exit', (code) => {
        console.log(`[backend] ${backend.id} exited (code=${code})`);
        processMap.delete(backend.id);
    });

    return child;
}

async function ensureInitialBackends() {
    for (const backend of INITIAL_BACKENDS) {
        const existingHealth = await waitForBackend(backend, { attempts: 8, timeoutMs: 1000, quiet: true });
        if (existingHealth) {
            console.log(`[bridge] Using existing backend ${backend.id} on port ${backend.port}`);
            continue;
        }

        if (await isPortOpen(backend.ip, backend.port)) {
            console.warn(`[bridge] Port ${backend.port} is already in use, so ${backend.id} was not started by the bridge`);
            continue;
        }

        console.log(`[bridge] Starting backend ${backend.id} on port ${backend.port}`);
        spawnBackendProcess(backend);
        await waitForBackend(backend);
    }
}

async function waitForBackend(backend, options = {}) {
    const attempts = options.attempts ?? 20;
    const timeoutMs = options.timeoutMs ?? 500;
    const quiet = !!options.quiet;
    const url = `http://${backend.ip}:${backend.port}/health`;
    for (let attempt = 0; attempt < attempts; attempt++) {
        try {
            const health = await httpGet(url, timeoutMs);
            serverHealth.set(backend.id, health);
            return true;
        } catch (_) {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    if (!quiet) console.error(`[bridge] Backend ${backend.id} did not become healthy on port ${backend.port}`);
    return false;
}

function isPortOpen(host, port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host, port, timeout: 500 });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => resolve(false));
    });
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
                pendingMethods.delete(msg.request_id);   
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

        case 'scale_command': {
            const event = handleScaleCommand(msg);
            if (!event) break;
            broadcast({ type: 'scaling_event', data: event });
            db.logScalingEvent({
                action: msg.action || 'unknown',
                serversBefore: event.serversBefore,
                serversAfter: event.serversAfter,
                predictedLoad: msg.current_count,
                spikeDetected: false,
                reason: msg.action === 'scale_up' ? 'high predicted load / spike' : 'low predicted load',
            });
            console.log(`[autoscale] ${msg.action} delta=${msg.delta} servers: ${event.serversBefore} -> ${event.serversAfter}`);
            break;
        }

        case 'error':
            console.error(`[engine error] ${msg.message}`);
            broadcast({ type: 'error', data: msg });
            break;

        default:
            broadcast({ type: msg.type, data: msg });
    }
}

function registerBackends() {
    for (const b of INITIAL_BACKENDS) {
        sendToEngine({ type: 'add_server', id: b.id, name: b.name, ip: b.ip, port: b.port, weight: b.weight, max_connections: b.max_connections });
    }
    
    sendToEngine({ type: 'set_server_count', count: BACKENDS.length });
}

function forwardToBackend(routeMsg) {
    const serverId = routeMsg.server_id;
    const backend = BACKENDS.find(b => b.id === serverId);
    if (!backend) return;

    const url = routeMsg.url || '/data';
    const method = pendingMethods.get(routeMsg.request_id) || 'GET';
    pendingMethods.delete(routeMsg.request_id);
    const start = Date.now();

    inflight++;
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
            
            const ttl = ENDPOINT_TTL[url] ?? DEFAULT_TTL;
            if (method === 'GET' && ttl > 0) {
                sendToEngine({ type: 'cache_put', key: url, value: JSON.stringify(result).slice(0, 512), size: 512, ttl });
            }
            addLog({ url, cacheHit: false, statusCode: 200, latency, serverRouted: serverId, method });
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
            addLog({ url, cacheHit: false, statusCode: 500, latency, serverRouted: serverId, method });
        })
        .finally(() => { inflight--; });
}

function pollHealth() {
    for (const b of BACKENDS) {
        httpGet(`http://${b.ip}:${b.port}/health`)
            .then((data) => {
                serverHealth.set(b.id, data);
                
                const cpu = Math.min(99, Math.max(0, data.cpu ?? 0));
                const memory = Math.min(99, Math.max(0, data.memory ?? 0));
                sendToEngine({
                    type: 'health_update',
                    server_id: b.id,
                    cpu,
                    memory,
                    healthy: data.status === 'healthy',
                });
            })
            .catch((err) => {

                if (!drainingServers.has(b.id)) {
                    sendToEngine({ type: 'health_update', server_id: b.id, cpu: 0, memory: 0, healthy: false });
                }
            });
    }
}

function generateTraffic() {
    if (!engineReady) return;
    if (inflight >= MAX_INFLIGHT) return;
    const url = WORKLOAD_ENDPOINTS[Math.floor(Math.random() * WORKLOAD_ENDPOINTS.length)];
    const id = `req-${++requestCounter}`;

    const roll = Math.random();
    let method = 'GET';
    if (roll < 0.08) method = 'POST';
    else if (roll < 0.12) method = 'PUT';
    else if (roll < 0.15) method = 'DELETE';

    if (method !== 'GET') {
        sendToEngine({ type: 'cache_remove', key: url });
    }

    pendingMethods.set(id, method);
    sendToEngine({ type: 'route_request', request_id: id, url, method });
}

const trafficHistory = [];
const scalingEvents = [];

function spawnServer() {
    const port = nextPort++;
    const name = SCALE_NAMES[scaleNameIdx++ % SCALE_NAMES.length];
    const id = `server-${name.toLowerCase()}`;

    const capacity = +(0.5 + Math.random() * 0.5).toFixed(2);
    const weight = capacity;
    const maxConn = Math.round(60 + capacity * 60);

    console.log(`[autoscale] Spawning ${id} on port ${port} (capacity=${capacity})`);
    const child = fork(SERVER_SCRIPT, [], {
        env: {
            ...process.env,
            SERVER_ID: id,
            PORT: String(port),
            SERVER_CAPACITY: String(capacity),
        },
        stdio: 'pipe',
    });

    child.on('error', (err) => console.error(`[autoscale] ${id} error: ${err.message}`));
    child.on('exit', (code) => {
        console.log(`[autoscale] ${id} exited (code=${code})`);
        dynamicProcesses.delete(id);
        const idx = BACKENDS.findIndex(b => b.id === id);
        if (idx !== -1) {
            BACKENDS.splice(idx, 1);
            sendToEngine({ type: 'remove_server', server_id: id });
            sendToEngine({ type: 'set_server_count', count: BACKENDS.length });
        }
    });

    const backend = { id, name, ip: '127.0.0.1', port, weight, max_connections: maxConn, capacity };
    BACKENDS.push(backend);
    dynamicProcesses.set(id, child);

    setTimeout(() => {
        if (dynamicProcesses.has(id)) {
            sendToEngine({ type: 'add_server', id, name, ip: '127.0.0.1', port, weight, max_connections: maxConn });
        }
    }, 1500);

    return backend;
}

function killServer() {
    
    const dynamicIds = [...dynamicProcesses.keys()].filter(id => !drainingServers.has(id));
    if (dynamicIds.length === 0) return null;

    const id = dynamicIds[dynamicIds.length - 1];
    const child = dynamicProcesses.get(id);

    console.log(`[autoscale] Initiating graceful shutdown for ${id}`);
    drainingServers.add(id);

    sendToEngine({ type: 'remove_server', server_id: id });

    const idx = BACKENDS.findIndex(b => b.id === id);
    if (idx !== -1) BACKENDS.splice(idx, 1);

    setTimeout(() => {
        console.log(`[autoscale] Killing process for ${id}`);
        if (child && !child.killed) child.kill();
        dynamicProcesses.delete(id);
        drainingServers.delete(id);
    }, SHUTDOWN_GRACE_MS);

    return id;
}

function applyScalingLimits(min, max) {
    const newMin = Math.max(1, Math.min(20, parseInt(min, 10) || MIN_SERVERS));
    const newMax = Math.max(newMin, Math.min(20, parseInt(max, 10) || MAX_SERVERS));
    MIN_SERVERS = newMin;
    MAX_SERVERS = newMax;
    console.log(`[bridge] Scaling limits updated: min=${MIN_SERVERS} max=${MAX_SERVERS}`);

    while (BACKENDS.length > MAX_SERVERS) {
        const removed = killServer();
        if (!removed) break;
    }
    while (BACKENDS.length < MIN_SERVERS) spawnServer();

    sendToEngine({ type: 'set_server_count', count: BACKENDS.length });
    sendToEngine({ type: 'set_scaling_limits', minServers: MIN_SERVERS, maxServers: MAX_SERVERS });
    broadcast({ type: 'scaling_limits_updated', data: { minServers: MIN_SERVERS, maxServers: MAX_SERVERS } });
}

function simulateLoad(url, count, method, durationSec) {
    const target = (url || '/data').toString();
    const rate = Math.max(1, Math.min(200, parseInt(count, 10) || 10));
    const m = (method || 'GET').toUpperCase();
    const sustain = parseInt(durationSec, 10) > 0;
    const totalDuration = sustain ? Math.min(300, parseInt(durationSec, 10)) : 0;
    const totalCap = sustain ? rate * totalDuration : Math.min(500, rate);
    const tickMs = sustain ? Math.max(20, Math.round(1000 / rate)) : 50;
    const endAt = sustain ? Date.now() + totalDuration * 1000 : Infinity;

    console.log(`[bridge] simulateLoad ${m} ${target} — ${sustain ? `${rate} rps × ${totalDuration}s` : `burst ${totalCap}`}`);

    let sent = 0;
    const interval = setInterval(() => {
        if (!engineReady || sent >= totalCap || Date.now() >= endAt) {
            clearInterval(interval);
            return;
        }
        if (inflight >= MAX_INFLIGHT) return;

        if (engineReady) {
            const id = `sim-${++requestCounter}`;
            if (m !== 'GET') sendToEngine({ type: 'cache_remove', key: target });
            pendingMethods.set(id, m);
            sendToEngine({ type: 'route_request', request_id: id, url: target, method: m });
        } else {
            
            routeDirectly(target, m, `sim-${++requestCounter}`);
        }
        sent++;
    }, tickMs);
}

function handleScaleCommand(msg) {
    const action = msg.action;
    const delta = msg.delta || 0;
    const serversBefore = BACKENDS.length;

    if (action === 'scale_up' && delta > 0) {
        const canAdd = Math.min(delta, MAX_SERVERS - BACKENDS.length);
        for (let i = 0; i < canAdd; i++) spawnServer();
    } else if (action === 'scale_down' && delta < 0) {
        const canRemove = Math.min(Math.abs(delta), BACKENDS.length - MIN_SERVERS);
        for (let i = 0; i < canRemove; i++) killServer();
    }

    const serversAfter = BACKENDS.length;

    sendToEngine({ type: 'set_server_count', count: serversAfter });

    const trigger = action === 'scale_up' ? 'high_predicted_load' : 'low_predicted_load';
    const event = {
        id: scalingEvents.length + 1,
        timestamp: new Date().toISOString(),
        action,
        serversBefore,
        serversAfter,
        predictedLoad: msg.current_count,
        trigger,
        reason: trigger,
    };
    scalingEvents.push(event);
    if (scalingEvents.length > 100) scalingEvents.shift();

    return event;
}

function buildDashboardState() {
    const s = lastStatus || {};

    const servers = (s.servers || []).map((srv) => {
        const health = serverHealth.get(srv.id) || {};
        const connections = srv.active_connections ?? health.active_connections ?? 0;
        return {
            id: srv.id,
            name: srv.name || srv.id,
            containerId: srv.id.slice(0, 12),
            ip: srv.ip || '127.0.0.1',
            port: srv.port || 0,
            status: srv.status || (health.status === 'healthy' ? 'healthy' : 'degraded'),
            cpu: Math.max(srv.cpu || 0, health.cpu || 0),
            memory: Math.max(srv.memory || 0, health.memory || 0),
            activeConnections: connections,
            maxConnections: srv.max_connections || 100,
            weight: srv.weight || 1.0,
            uptime: health.uptime || 0,
            totalRequests: srv.total_requests ?? srv.requests ?? 0,
            emaLatency: srv.ema_latency ?? 0,
        };
    });

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

    trafficHistory.push({
        time: new Date().toISOString(),
        timestamp: Date.now(),
        actual: predictions.currentLoad,
        predicted: predictions.predictedLoad,
    });
    if (trafficHistory.length > 60) trafficHistory.shift();

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

    const scalingConfig = {
        minServers: MIN_SERVERS,
        maxServers: MAX_SERVERS,
        currentServers: servers.length,
        scaleUpThreshold: scaling.scale_up_threshold ?? 80,
        scaleDownThreshold: scaling.scale_down_threshold ?? 30,
        cooldownPeriod: scaling.cooldown_seconds ?? 30,
        emaAlpha: predictions.emaAlpha,
        spikeThreshold: scaling.spike_threshold ?? 2.0,
    };

    const rawState = { 
        servers, 
        cacheStats, 
        predictions, 
        trafficHistory: [...trafficHistory], 
        metrics, 
        scalingEvents: [...scalingEvents], 
        scalingConfig, 
        logs: recentLogs.slice(-50) 
    };

    return rawState;
}

let logId = 0;
function addLog({ url, cacheHit, statusCode, latency, serverRouted, method, requestId }) {
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

    db.logRequest({
        requestId: requestId || null,
        method: entry.method,
        url: entry.url,
        serverId: entry.serverRouted,
        statusCode: entry.statusCode,
        latencyMs: entry.latency,
        cacheHit: entry.cacheHit,
    });
}

function httpGet(url, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
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

const startTime = Date.now();

function spawnInitialBackends() {
    for (const b of INITIAL_BACKENDS) {
        console.log(`[bridge] Spawning initial ${b.id} on port ${b.port} (capacity=${b.capacity})`);
        const child = fork(SERVER_SCRIPT, [], {
            env: {
                ...process.env,
                SERVER_ID: b.id,
                PORT: String(b.port),
                SERVER_CAPACITY: String(b.capacity),
            },
            stdio: 'pipe',
        });
        child.on('error', (err) => console.error(`[bridge] ${b.id} error: ${err.message}`));
        child.on('exit', (code) => console.log(`[bridge] ${b.id} exited (code=${code})`));
        initialProcesses.set(b.id, child);
    }
}

httpServer.listen(BRIDGE_PORT, async () => {
    console.log(`[bridge] HTTP + WS server on http://localhost:${BRIDGE_PORT}`);
    await db.init();
    if (AUTO_SPAWN_INITIAL) await ensureInitialBackends();
    startEngine();

    setInterval(pollHealth, HEALTH_POLL_MS);

    setInterval(() => {
        if (engineReady) sendToEngine({ type: 'get_status' });
    }, STATUS_POLL_MS);

    setInterval(generateTraffic, TRAFFIC_INTERVAL_MS);

    setInterval(() => {
        if (!lastStatus) return;
        const state = buildDashboardState();
        db.logMetricSnapshot({
            totalRequests: state.metrics.totalRequests,
            rps: state.metrics.requestsPerSecond,
            avgLatency: state.metrics.avgLatency,
            p99Latency: state.metrics.p99Latency,
            cacheHitRate: state.metrics.cacheHitRate,
            cacheEntries: state.cacheStats.totalEntries,
            activeServers: state.metrics.activeServers,
            predictedLoad: state.predictions.predictedLoad,
            trend: state.predictions.trend,
        });
    }, 5000);
});

process.on('SIGINT', () => {
    console.log('\n[bridge] Shutting down...');
    if (engine && engine.stdin.writable) {
        sendToEngine({ type: 'shutdown' });
    }
    
    for (const [id, child] of dynamicProcesses) {
        if (child && !child.killed) child.kill();
    }
    dynamicProcesses.clear();
    for (const [id, child] of initialProcesses) {
        if (child && !child.killed) child.kill();
    }
    initialProcesses.clear();
    db.close().finally(() => setTimeout(() => process.exit(0), 1000));
});