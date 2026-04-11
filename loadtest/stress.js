/*
 * stress.js — Load Testing Tool for Intelligent Load Balancer
 * ============================================================
 * Simulates realistic traffic patterns against the bridge layer.
 *
 * Phases:
 *   1. Warm-up       —  gentle ramp from 1 to 10 req/s  (20 s)
 *   2. Steady state   —  hold at 10 req/s                (20 s)
 *   3. Ramp up        —  linear ramp to 50 req/s         (20 s)
 *   4. Flash crowd    —  sudden spike to 100 req/s       (10 s)
 *   5. Cool down      —  drop back to 5 req/s            (20 s)
 *
 * Usage:
 *   node loadtest/stress.js                         # full run
 *   node loadtest/stress.js --phase spike           # spike only
 *   node loadtest/stress.js --rps 30 --duration 60  # custom constant
 */

const http = require('http');

const BRIDGE = process.env.BRIDGE_URL || 'http://localhost:4000';
const ENDPOINTS = ['/cpu', '/ml', '/image', '/data', '/api/train', '/api/predict', '/api/datasets'];
const METHODS = ['GET', 'GET', 'GET', 'GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE']; // ~67% GET

/* ---- CLI args ---- */
const args = process.argv.slice(2).reduce((m, a, i, arr) => {
    if (a.startsWith('--')) m[a.slice(2)] = arr[i + 1] || true;
    return m;
}, {});

/* ---- Stats ---- */
let totalSent = 0, totalOk = 0, totalErr = 0, totalCacheHit = 0;
const latencies = [];

/* ---- Phases ---- */
const PHASES = [
    { name: 'warm-up',      duration: 20, rpsStart: 1,   rpsEnd: 10 },
    { name: 'steady',       duration: 20, rpsStart: 10,  rpsEnd: 10 },
    { name: 'ramp-up',      duration: 20, rpsStart: 10,  rpsEnd: 50 },
    { name: 'flash-crowd',  duration: 10, rpsStart: 100, rpsEnd: 100 },
    { name: 'cool-down',    duration: 20, rpsStart: 5,   rpsEnd: 5 },
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function sendRequest() {
    const url = pickRandom(ENDPOINTS);
    const method = pickRandom(METHODS);
    const start = Date.now();
    totalSent++;

    const postData = JSON.stringify({ url, method });
    const opts = {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/request',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
        timeout: 15000,
    };

    const req = http.request(opts, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            const latency = Date.now() - start;
            latencies.push(latency);
            if (res.statusCode < 400) {
                totalOk++;
                try {
                    const data = JSON.parse(body);
                    if (data.cache_hit) totalCacheHit++;
                } catch (_) {}
            } else {
                totalErr++;
            }
        });
    });

    req.on('error', () => { totalErr++; });
    req.on('timeout', () => { req.destroy(); totalErr++; });
    req.write(postData);
    req.end();
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil(p / 100 * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

function printStats(phaseName) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.length ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(0) : 0;
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const p99 = percentile(sorted, 99);
    console.log(`  [${phaseName}] sent=${totalSent} ok=${totalOk} err=${totalErr} cache_hit=${totalCacheHit} avg=${avg}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
}

async function runPhase(phase) {
    console.log(`\n>> Phase: ${phase.name} (${phase.duration}s, ${phase.rpsStart}-${phase.rpsEnd} req/s)`);
    const startTime = Date.now();
    const durationMs = phase.duration * 1000;
    const phaseSentBefore = totalSent;

    while (Date.now() - startTime < durationMs) {
        const elapsed = (Date.now() - startTime) / durationMs;
        const currentRps = phase.rpsStart + (phase.rpsEnd - phase.rpsStart) * elapsed;
        const intervalMs = Math.max(10, 1000 / currentRps);

        // Send a burst for this tick
        const burstSize = Math.max(1, Math.round(currentRps / (1000 / intervalMs)));
        for (let i = 0; i < burstSize; i++) {
            sendRequest();
        }

        await sleep(intervalMs);
    }

    // Wait a bit for in-flight to complete
    await sleep(2000);
    const phaseSent = totalSent - phaseSentBefore;
    console.log(`  Sent ${phaseSent} requests in ${phase.duration}s (~${(phaseSent / phase.duration).toFixed(1)} req/s)`);
    printStats(phase.name);
}

async function main() {
    console.log('='.repeat(60));
    console.log('  Intelligent Load Balancer — Stress Test');
    console.log('='.repeat(60));
    console.log(`Target: ${BRIDGE}`);

    // Check bridge health first
    try {
        await new Promise((resolve, reject) => {
            http.get(`${BRIDGE}/api/health`, (res) => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    console.log(`Bridge health: ${body}`);
                    resolve();
                });
            }).on('error', reject);
        });
    } catch (err) {
        console.error(`Cannot reach bridge at ${BRIDGE} — is it running?`);
        process.exit(1);
    }

    const startTime = Date.now();

    if (args.phase) {
        // Run single phase
        const match = PHASES.find(p => p.name === args.phase);
        if (!match) {
            console.error(`Unknown phase: ${args.phase}. Available: ${PHASES.map(p => p.name).join(', ')}`);
            process.exit(1);
        }
        await runPhase(match);
    } else if (args.rps) {
        // Custom constant load
        const rps = parseInt(args.rps, 10) || 10;
        const duration = parseInt(args.duration, 10) || 60;
        await runPhase({ name: 'custom', duration, rpsStart: rps, rpsEnd: rps });
    } else {
        // Full test sequence
        for (const phase of PHASES) {
            await runPhase(phase);
        }
    }

    // Wait for remaining in-flight
    await sleep(3000);

    // Final summary
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const sorted = [...latencies].sort((a, b) => a - b);
    console.log('\n' + '='.repeat(60));
    console.log('  FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Duration:     ${totalTime}s`);
    console.log(`  Total Sent:   ${totalSent}`);
    console.log(`  Success:      ${totalOk} (${(totalOk / totalSent * 100).toFixed(1)}%)`);
    console.log(`  Errors:       ${totalErr} (${(totalErr / totalSent * 100).toFixed(1)}%)`);
    console.log(`  Cache Hits:   ${totalCacheHit}`);
    console.log(`  Avg Latency:  ${sorted.length ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(0) : 0}ms`);
    console.log(`  p50 Latency:  ${percentile(sorted, 50)}ms`);
    console.log(`  p95 Latency:  ${percentile(sorted, 95)}ms`);
    console.log(`  p99 Latency:  ${percentile(sorted, 99)}ms`);
    console.log(`  Throughput:   ${(totalOk / parseFloat(totalTime)).toFixed(1)} req/s`);
    console.log('='.repeat(60));
}

main().catch(err => {
    console.error('Stress test failed:', err);
    process.exit(1);
});
