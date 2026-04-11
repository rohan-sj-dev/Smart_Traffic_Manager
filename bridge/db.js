/*
 * db.js — Async PostgreSQL logger for the bridge layer.
 *
 * Connects to PostgreSQL if DATABASE_URL or PG_* env vars are set.
 * All writes are fire-and-forget (async, non-blocking).
 * If no DB is configured the module silently no-ops.
 */

const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL || null;

const pool = DB_URL
    ? new Pool({ connectionString: DB_URL, max: 5 })
    : (process.env.PGHOST
        ? new Pool({ max: 5 })    // uses PG* env vars
        : null);

let connected = false;

async function init() {
    if (!pool) {
        console.log('[db] No DATABASE_URL or PGHOST set — DB logging disabled');
        return;
    }
    try {
        const client = await pool.connect();
        client.release();
        connected = true;
        console.log('[db] Connected to PostgreSQL');
    } catch (err) {
        console.warn(`[db] Could not connect: ${err.message} — DB logging disabled`);
    }
}

/* ---------- writers (fire-and-forget) ---------- */

function logRequest({ requestId, method, url, serverId, statusCode, latencyMs, cacheHit }) {
    if (!connected) return;
    pool.query(
        `INSERT INTO request_logs (request_id, method, url, server_id, status_code, latency_ms, cache_hit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [requestId || null, method || 'GET', url, serverId || null, statusCode || 200, latencyMs || 0, !!cacheHit]
    ).catch(err => console.error('[db] logRequest error:', err.message));
}

function logScalingEvent({ action, serversBefore, serversAfter, predictedLoad, spikeDetected, reason }) {
    if (!connected) return;
    pool.query(
        `INSERT INTO scaling_events (action, servers_before, servers_after, predicted_load, spike_detected, reason)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [action, serversBefore ?? null, serversAfter ?? null, predictedLoad ?? null, !!spikeDetected, reason || null]
    ).catch(err => console.error('[db] logScalingEvent error:', err.message));
}

function logMetricSnapshot({ totalRequests, rps, avgLatency, p99Latency, cacheHitRate, cacheEntries, activeServers, predictedLoad, trend }) {
    if (!connected) return;
    pool.query(
        `INSERT INTO metric_snapshots (total_requests, rps, avg_latency_ms, p99_latency_ms, cache_hit_rate, cache_entries, active_servers, predicted_load, trend)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [totalRequests ?? 0, rps ?? 0, avgLatency ?? 0, p99Latency ?? 0, cacheHitRate ?? 0, cacheEntries ?? 0, activeServers ?? 0, predictedLoad ?? 0, trend || 'stable']
    ).catch(err => console.error('[db] logMetricSnapshot error:', err.message));
}

function isConnected() { return connected; }

async function close() {
    if (pool) await pool.end();
}

module.exports = { init, logRequest, logScalingEvent, logMetricSnapshot, isConnected, close };
