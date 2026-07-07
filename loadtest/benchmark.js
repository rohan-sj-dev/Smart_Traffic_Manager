/*
 * benchmark.js — WLC vs Round-Robin comparison benchmark
 * ========================================================
 * Measures end-to-end request latency and throughput through the bridge's
 * /api/proxy endpoint, which forwards the request to a backend and waits for
 * the response. Both algorithms use the identical forwarding pipeline; only
 * the routing decision differs:
 *   - rr : plain round-robin over the backend list
 *   - wlc: the C engine's weighted-least-connections (+ EMA latency) routing
 *
 * Every request carries a unique query string so the engine cache never hits —
 * this isolates the routing algorithm from the cache.
 *
 * Metrics per run: throughput (req/s), avg / p50 / p95 / p99 / max latency,
 * error rate, and per-server request distribution.
 *
 * Modes:
 *   node loadtest/benchmark.js                     # compare rr vs wlc (default C=100, 30s each)
 *   node loadtest/benchmark.js --duration 60       # longer runs
 *   node loadtest/benchmark.js --concurrency 150   # different closed-loop concurrency
 *   node loadtest/benchmark.js --sweep             # also sweep concurrency to find max stable level
 *   node loadtest/benchmark.js --sweep-only        # only the concurrency sweep
 *
 * Prerequisite: bridge running with background traffic disabled:
 *   TRAFFIC_GEN=0 node bridge/bridge.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BRIDGE_HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '4000', 10);

/* Weighted endpoint mix: mostly cheap reads plus CPU-bound work, which is where
 * routing quality shows (slow backends busy-wait, so bad placement queues up).
 * --workload light uses only cheap reads to measure raw pipeline throughput. */
const WORKLOADS = {
    mixed: [
        { url: '/data', weight: 35 },
        { url: '/api/datasets', weight: 10 },
        { url: '/api/predict', weight: 15 },
        { url: '/cpu', weight: 20 },
        { url: '/ml', weight: 10 },
        { url: '/image', weight: 10 },
    ],
    light: [
        { url: '/data', weight: 50 },
        { url: '/api/datasets', weight: 50 },
    ],
};
const args = process.argv.slice(2).reduce((m, a, i, arr) => {
    if (a.startsWith('--')) m[a.slice(2)] = (arr[i + 1] && !arr[i + 1].startsWith('--')) ? arr[i + 1] : true;
    return m;
}, {});

const WORKLOAD = WORKLOADS[args.workload] || WORKLOADS.mixed;
const WORKLOAD_TOTAL = WORKLOAD.reduce((s, w) => s + w.weight, 0);

const DURATION_S = parseInt(args.duration, 10) || 30;
const CONCURRENCY = parseInt(args.concurrency, 10) || 100;
const SWEEP_LEVELS = [50, 100, 150, 200, 250, 300];
const SWEEP_DURATION_S = parseInt(args['sweep-duration'], 10) || 12;

const agent = new http.Agent({ keepAlive: true, maxSockets: 1024 });

let uniq = 0;

function pickEndpoint() {
    let roll = Math.random() * WORKLOAD_TOTAL;
    for (const w of WORKLOAD) {
        roll -= w.weight;
        if (roll <= 0) return w.url;
    }
    return WORKLOAD[0].url;
}

function proxyRequest(algo) {
    return new Promise((resolve) => {
        const url = `${pickEndpoint()}?b=${++uniq}`;
        const postData = JSON.stringify({ url, algo });
        const start = process.hrtime.bigint();
        const req = http.request({
            hostname: BRIDGE_HOST,
            port: BRIDGE_PORT,
            path: '/api/proxy',
            method: 'POST',
            agent,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            timeout: 30000,
        }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => {
                const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
                let serverId = 'unknown';
                try { serverId = JSON.parse(body).server_id || 'unknown'; } catch (_) {}
                resolve({ ok: res.statusCode < 400, statusCode: res.statusCode, latencyMs, serverId });
            });
        });
        req.on('error', () => {
            resolve({ ok: false, statusCode: 0, latencyMs: Number(process.hrtime.bigint() - start) / 1e6, serverId: 'error' });
        });
        req.on('timeout', () => { req.destroy(); });
        req.write(postData);
        req.end();
    });
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

/* Closed-loop run: `concurrency` workers, each fires its next request as soon
 * as the previous one completes, for `durationS` seconds. */
async function runLoad(algo, concurrency, durationS, label) {
    process.stdout.write(`  ${label} (algo=${algo}, C=${concurrency}, ${durationS}s) ... `);
    const latencies = [];
    const perServer = {};
    let ok = 0, errors = 0;
    const endAt = Date.now() + durationS * 1000;

    async function worker() {
        while (Date.now() < endAt) {
            const r = await proxyRequest(algo);
            latencies.push(r.latencyMs);
            perServer[r.serverId] = (perServer[r.serverId] || 0) + 1;
            if (r.ok) ok++; else errors++;
        }
    }

    const t0 = Date.now();
    await Promise.all(Array.from({ length: concurrency }, worker));
    const elapsedS = (Date.now() - t0) / 1000;

    latencies.sort((a, b) => a - b);
    const total = ok + errors;
    const stats = {
        algo,
        concurrency,
        durationS: +elapsedS.toFixed(1),
        totalRequests: total,
        ok,
        errors,
        errorRate: total ? +(errors / total * 100).toFixed(2) : 0,
        throughputRps: +(total / elapsedS).toFixed(1),
        avgMs: latencies.length ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) : 0,
        p50Ms: +percentile(latencies, 50).toFixed(1),
        p95Ms: +percentile(latencies, 95).toFixed(1),
        p99Ms: +percentile(latencies, 99).toFixed(1),
        maxMs: +percentile(latencies, 100).toFixed(1),
        perServer,
    };
    console.log(`${stats.throughputRps} req/s, avg ${stats.avgMs}ms, p99 ${stats.p99Ms}ms, errors ${stats.errorRate}%`);
    return stats;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpPostJson(urlPath, payload) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const req = http.request({
            hostname: BRIDGE_HOST, port: BRIDGE_PORT, path: urlPath, method: 'POST', agent,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function httpGetJson(urlPath) {
    return new Promise((resolve, reject) => {
        http.get({ hostname: BRIDGE_HOST, port: BRIDGE_PORT, path: urlPath, agent }, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        }).on('error', reject);
    });
}

function printComparison(rr, wlc) {
    const reduction = (a, b) => a > 0 ? ((a - b) / a * 100).toFixed(1) : '0.0';
    console.log('\n  Metric                Round-Robin      WLC (engine)     Change');
    console.log('  ' + '-'.repeat(66));
    const rows = [
        ['Throughput (req/s)', rr.throughputRps, wlc.throughputRps, `+${((wlc.throughputRps / rr.throughputRps - 1) * 100).toFixed(1)}%`],
        ['Avg latency (ms)', rr.avgMs, wlc.avgMs, `-${reduction(rr.avgMs, wlc.avgMs)}%`],
        ['p50 latency (ms)', rr.p50Ms, wlc.p50Ms, `-${reduction(rr.p50Ms, wlc.p50Ms)}%`],
        ['p95 latency (ms)', rr.p95Ms, wlc.p95Ms, `-${reduction(rr.p95Ms, wlc.p95Ms)}%`],
        ['p99 latency (ms)', rr.p99Ms, wlc.p99Ms, `-${reduction(rr.p99Ms, wlc.p99Ms)}%`],
        ['Error rate (%)', rr.errorRate, wlc.errorRate, ''],
    ];
    for (const [name, a, b, delta] of rows) {
        console.log(`  ${name.padEnd(22)}${String(a).padEnd(17)}${String(b).padEnd(17)}${delta}`);
    }
    console.log('\n  Request distribution:');
    console.log(`    rr : ${JSON.stringify(rr.perServer)}`);
    console.log(`    wlc: ${JSON.stringify(wlc.perServer)}`);
}

async function main() {
    console.log('='.repeat(68));
    console.log('  WLC vs Round-Robin Benchmark  (end-to-end via bridge /api/proxy)');
    console.log('='.repeat(68));

    let health;
    try {
        health = await httpGetJson('/api/health');
    } catch (_) {
        console.error(`Cannot reach bridge at http://${BRIDGE_HOST}:${BRIDGE_PORT} — start it first:`);
        console.error('  TRAFFIC_GEN=0 node bridge/bridge.js');
        process.exit(1);
    }
    console.log(`Bridge: engine=${health.engine} backends=${health.backends}`);
    if (!health.engine) {
        console.error('Engine is not ready — wait a few seconds and retry.');
        process.exit(1);
    }

    // Pin the pool to a fixed size so autoscaling doesn't change the server set
    // mid-comparison (pass --autoscale to leave it enabled).
    if (!args.autoscale) {
        const limits = await httpPostJson('/api/scaling-limits', { min: 3, max: 3 });
        console.log(`Scaling pinned: min=${limits.minServers} max=${limits.maxServers} current=${limits.currentServers}`);
        await sleep(4000);
    }

    const results = { startedAt: new Date().toISOString(), durationS: DURATION_S, concurrency: CONCURRENCY };

    if (!args['sweep-only']) {
        console.log('\n[1/3] Warm-up (JIT, sockets, engine EMA)');
        await runLoad('wlc', 30, 8, 'warm-up');
        await sleep(3000);

        console.log('\n[2/3] Baseline: round-robin');
        results.rr = await runLoad('rr', CONCURRENCY, DURATION_S, 'round-robin');
        await sleep(5000);

        console.log('\n[3/3] Weighted least connections (C engine)');
        await runLoad('wlc', 30, 5, 'wlc warm-up');
        results.wlc = await runLoad('wlc', CONCURRENCY, DURATION_S, 'wlc');

        printComparison(results.rr, results.wlc);
    }

    if (args.sweep || args['sweep-only']) {
        console.log('\nConcurrency sweep (WLC) — max stable concurrency');
        results.sweep = [];
        for (const level of SWEEP_LEVELS) {
            await sleep(3000);
            const s = await runLoad('wlc', level, SWEEP_DURATION_S, `sweep C=${level}`);
            results.sweep.push(s);
        }
        const stable = results.sweep.filter(s => s.errorRate < 1);
        const maxStable = stable.length ? stable[stable.length - 1].concurrency : 0;
        results.maxStableConcurrency = maxStable;
        console.log(`\n  Max concurrency with <1% errors: ${maxStable}`);
    }

    if (!args.autoscale) {
        await httpPostJson('/api/scaling-limits', { min: 3, max: 10 }).catch(() => {});
    }

    const outDir = path.join(__dirname, 'results');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `benchmark-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
});
