const { fork } = require('child_process');
const path = require('path');

const SERVERS = [
    { id: 'server-alpha', port: 3001, capacity: '1.0' },
    { id: 'server-beta',  port: 3002, capacity: '0.6' },
    { id: 'server-gamma', port: 3003, capacity: '0.3' },
];

const children = [];

for (const srv of SERVERS) {
    const child = fork(path.join(__dirname, 'index.js'), [], {
        env: { ...process.env, SERVER_ID: srv.id, PORT: String(srv.port), SERVER_CAPACITY: srv.capacity },
        stdio: 'inherit'
    });
    children.push(child);
}

console.log('  server-alpha http://localhost:3001');
console.log('  server-beta http://localhost:3002');
console.log('  server-gamma http://localhost:3003');
console.log('\nPress Ctrl+C to stop all.\n');

process.on('SIGINT', () => {
    console.log('\nShutting down all servers...');
    for (const c of children) c.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    for (const c of children) c.kill();
    process.exit(0);
});