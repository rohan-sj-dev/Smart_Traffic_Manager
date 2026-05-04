const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (!match) continue;

        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        if (!process.env[key]) process.env[key] = value;
    }
}

loadEnvFile();

const DB_URL = process.env.DATABASE_URL || null;

const pool = DB_URL
    ? new Pool({ connectionString: DB_URL, max: 5 })
    : (process.env.PGHOST
        ? new Pool({ max: 5 })
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

const HISTORY_RANGES = {
    '5m': { interval: '5 minutes', bucket: 'minute' },
    '15m': { interval: '15 minutes', bucket: 'minute' },
    '1h': { interval: '1 hour', bucket: 'minute' },
    '6h': { interval: '6 hours', bucket: 'minute' },
    '24h': { interval: '24 hours', bucket: 'hour' },
    '7d': { interval: '7 days', bucket: 'day' },
};

async function getHistory(range = '1h') {
    if (!connected || !pool) {
        return { dbConnected: false, range, points: [], summary: null };
    }

    const config = HISTORY_RANGES[range] || HISTORY_RANGES['1h'];
    const selectedRange = HISTORY_RANGES[range] ? range : '1h';

    const [summaryResult, pointsResult, requestPointsResult, recentRequestsResult] = await Promise.all([
        pool.query(
            `WITH bounds AS (
                 SELECT NOW() - $1::interval AS since
             ),
             request_stats AS (
                 SELECT COUNT(*)::int AS request_count,
                        COALESCE(AVG(latency_ms), 0)::float AS avg_processing_ms
                 FROM request_logs, bounds
                 WHERE timestamp >= bounds.since
             ),
             metric_stats AS (
                 SELECT COALESCE(MAX(predicted_load), 0)::float AS peak_load,
                        COALESCE(AVG(cache_hit_rate), 0)::float AS avg_cache_hit_rate,
                        COALESCE(MAX(total_requests) - MIN(total_requests), 0)::bigint AS metric_request_delta
                 FROM metric_snapshots, bounds
                 WHERE timestamp >= bounds.since
             )
             SELECT request_stats.request_count,
                    request_stats.avg_processing_ms,
                    metric_stats.metric_request_delta,
                    metric_stats.peak_load,
                    metric_stats.avg_cache_hit_rate
             FROM request_stats, metric_stats`,
            [config.interval]
        ),
        pool.query(
            `SELECT date_trunc($2, timestamp) AS bucket,
                    COALESCE(MAX(total_requests), 0)::bigint AS total_requests,
                    COALESCE(AVG(rps), 0)::float AS requests_per_second,
                    COALESCE(AVG(avg_latency_ms), 0)::float AS avg_latency_ms,
                    COALESCE(MAX(p99_latency_ms), 0)::float AS p99_latency_ms,
                    COALESCE(AVG(cache_hit_rate), 0)::float AS cache_hit_rate,
                    COALESCE(MAX(active_servers), 0)::int AS active_servers,
                    COALESCE(AVG(predicted_load), 0)::float AS load
             FROM metric_snapshots
             WHERE timestamp >= NOW() - $1::interval
             GROUP BY bucket
             ORDER BY bucket ASC`,
            [config.interval, config.bucket]
        ),
        pool.query(
            `SELECT date_trunc($2, timestamp) AS bucket,
                    COUNT(*)::int AS request_count,
                    COALESCE(AVG(latency_ms), 0)::float AS avg_latency_ms
             FROM request_logs
             WHERE timestamp >= NOW() - $1::interval
             GROUP BY bucket
             ORDER BY bucket ASC`,
            [config.interval, config.bucket]
        ),
        pool.query(
            `SELECT id,
                    timestamp,
                    request_id,
                    method,
                    url,
                    server_id,
                    status_code,
                    latency_ms,
                    cache_hit
             FROM request_logs
             WHERE timestamp >= NOW() - $1::interval
             ORDER BY timestamp DESC
             LIMIT 25`,
            [config.interval]
        ),
    ]);

    const summaryRow = summaryResult.rows[0] || {};
    const requestCount = Number(summaryRow.request_count || 0);
    const metricRequestDelta = Number(summaryRow.metric_request_delta || 0);
    const metricPoints = pointsResult.rows.map(row => ({
        time: row.bucket,
        totalRequests: Number(row.total_requests || 0),
        requestsPerSecond: Number(row.requests_per_second || 0),
        avgLatency: Number(row.avg_latency_ms || 0),
        p99Latency: Number(row.p99_latency_ms || 0),
        cacheHitRate: Number(row.cache_hit_rate || 0),
        activeServers: Number(row.active_servers || 0),
        load: Number(row.load || 0),
    }));
    const requestPoints = requestPointsResult.rows.map(row => ({
        time: row.bucket,
        totalRequests: Number(row.request_count || 0),
        requestsPerSecond: Number(row.request_count || 0),
        avgLatency: Number(row.avg_latency_ms || 0),
        p99Latency: 0,
        cacheHitRate: 0,
        activeServers: 0,
        load: 0,
    }));

    return {
        dbConnected: true,
        range: selectedRange,
        points: metricPoints.length > 0 ? metricPoints : requestPoints,
        summary: {
            totalRequests: requestCount || metricRequestDelta,
            avgProcessingMs: Number(summaryRow.avg_processing_ms || 0),
            peakLoad: Number(summaryRow.peak_load || 0),
            avgCacheHitRate: Number(summaryRow.avg_cache_hit_rate || 0),
        },
        recentRequests: recentRequestsResult.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            requestId: row.request_id,
            method: row.method,
            url: row.url,
            serverId: row.server_id,
            statusCode: row.status_code,
            latencyMs: Number(row.latency_ms || 0),
            cacheHit: row.cache_hit,
        })),
    };
}

async function getRequestLogs({ range = '24h', from, to, limit = 200 } = {}) {
    if (!connected || !pool) {
        return { dbConnected: false, logs: [], stats: { total: 0, hits: 0, errors: 0, avgLatency: 0 } };
    }

    const safeLimit = Math.max(1, Math.min(5000, parseInt(limit, 10) || 200));
    let query, statsQuery;
    let params, statsParams;

    if (from && to) {
        query = `SELECT id, timestamp, request_id, method, url, server_id, status_code, latency_ms, cache_hit
                 FROM request_logs
                 WHERE timestamp BETWEEN $1 AND $2
                 ORDER BY timestamp DESC
                 LIMIT $3`;
        params = [from, to, safeLimit];
        statsQuery = `SELECT COUNT(*)::int as total, 
                             COUNT(*) FILTER (WHERE cache_hit = true)::int as hits,
                             COUNT(*) FILTER (WHERE status_code >= 500)::int as errors,
                             COALESCE(AVG(latency_ms), 0)::float as avg_latency
                      FROM request_logs 
                      WHERE timestamp BETWEEN $1 AND $2`;
        statsParams = [from, to];
    } else {
        const config = HISTORY_RANGES[range] || HISTORY_RANGES['24h'];
        query = `SELECT id, timestamp, request_id, method, url, server_id, status_code, latency_ms, cache_hit
                 FROM request_logs
                 WHERE timestamp >= NOW() - $1::interval
                 ORDER BY timestamp DESC
                 LIMIT $2`;
        params = [config.interval, safeLimit];
        statsQuery = `SELECT COUNT(*)::int as total, 
                             COUNT(*) FILTER (WHERE cache_hit = true)::int as hits,
                             COUNT(*) FILTER (WHERE status_code >= 500)::int as errors,
                             COALESCE(AVG(latency_ms), 0)::float as avg_latency
                      FROM request_logs 
                      WHERE timestamp >= NOW() - $1::interval`;
        statsParams = [config.interval];
    }

    const [result, statsResult] = await Promise.all([
        pool.query(query, params),
        pool.query(statsQuery, statsParams)
    ]);

    const stats = statsResult.rows[0] || { total: 0, hits: 0, errors: 0, avg_latency: 0 };

    return {
        dbConnected: true,
        stats: {
            total: stats.total,
            hits: stats.hits,
            errors: stats.errors,
            avgLatency: stats.avg_latency
        },
        logs: result.rows.map(row => ({
            id: row.id,
            timestamp: row.timestamp,
            requestId: row.request_id,
            method: row.method,
            url: row.url,
            serverRouted: row.server_id || 'unknown',
            statusCode: row.status_code,
            latency: Number(row.latency_ms || 0),
            cacheHit: row.cache_hit,
            clientIp: '127.0.0.1',
        })),
    };
}
async function close() {
    if (pool) await pool.end();
}

module.exports = { init, logRequest, logScalingEvent, logMetricSnapshot, getHistory, getRequestLogs, isConnected, close };