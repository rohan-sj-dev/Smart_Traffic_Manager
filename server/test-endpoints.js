const http = require('http');

const PORTS = [3001, 3002, 3003];
const ENDPOINTS = [
    { path: '/health',       label: 'Health Check' },
    { path: '/data',         label: 'Static Data (cacheable)' },
    { path: '/cpu',          label: 'CPU Workload' },
    { path: '/ml',           label: 'ML Gradient Descent' },
    { path: '/image',        label: 'Image Processing' },
    { path: '/api/train',    label: 'ML Training (heavy)' },
    { path: '/api/predict',  label: 'Batch Inference' },
    { path: '/api/datasets', label: 'Dataset Listing' }
];

let passed = 0;
let failed = 0;
const total = PORTS.length * ENDPOINTS.length;

function fetch(port, path) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}${path}`, { timeout: 30000 }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    reject(new Error(`JSON parse failed: ${data.slice(0, 100)}`));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

async function testEndpoint(port, endpoint) {
    const tag = `  :${port} ${endpoint.path.padEnd(16)}`;
    try {
        const { status, body } = await fetch(port, endpoint.path);

        if (status !== 200) {
            console.log(`  FAIL ${tag}  ΓÇö HTTP ${status}`);
            failed++;
            return;
        }

        if (endpoint.path === '/health') {
            if (!body.server_id || !body.status) throw new Error('Missing server_id or status');
        } else {
            if (!body.server_id) throw new Error('Missing server_id');
            if (!body.result) throw new Error('Missing result');
        }

        if (['/cpu', '/ml', '/image', '/api/train', '/api/predict'].includes(endpoint.path)) {
            if (body.result.processing_time_ms === undefined) throw new Error('Missing processing_time_ms');
        }

        const timeStr = body.result?.processing_time_ms !== undefined
            ? `${body.result.processing_time_ms}ms`
            : '';
        console.log(`  PASS ${tag}  ${endpoint.label.padEnd(26)} ${timeStr.padStart(8)}  [${body.server_id}]`);
        passed++;
    } catch (err) {
        console.log(`  FAIL ${tag}  ${endpoint.label.padEnd(26)}  ${err.message}`);
        failed++;
    }
}

async function main() {
    console.log('\nΓòöΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòù');
    console.log('Γòæ          LoadC Backend Server ΓÇö Endpoint Test Suite         Γòæ');
    console.log('ΓòÜΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓòÉΓò¥\n');

    const activePorts = [];
    for (const port of PORTS) {
        try {
            await fetch(port, '/health');
            activePorts.push(port);
        } catch {
            console.log(`  SKIP  :${port}  ΓÇö not reachable`);
        }
    }

    if (activePorts.length === 0) {
        console.log('\n  No servers running! Start them first:\n');
        console.log('    npm run start:all\n');
        process.exit(1);
    }

    console.log(`\n  Testing ${activePorts.length} server(s) ├ù ${ENDPOINTS.length} endpoints...\n`);
    console.log('  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ');

    for (const port of activePorts) {
        for (const ep of ENDPOINTS) {
            await testEndpoint(port, ep);
        }
        console.log('  ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ');
    }

    console.log(`\n  Results: ${passed} passed, ${failed} failed, ${total - passed - failed} skipped out of ${total}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main();