// Mock data generator for the Load Balancer Dashboard
// Produces realistic dummy data until the real bridge/C engine is connected

let requestId = 1000;
let scalingEventId = 100;

const SERVER_NAMES = ['server-alpha', 'server-beta', 'server-gamma', 'server-delta', 'server-epsilon'];
const ENDPOINTS = ['/api/train', '/api/predict', '/cpu', '/data', '/api/datasets', '/health'];
const STATUS_OPTIONS = ['healthy', 'degraded', 'overloaded'];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// Generate a list of mock servers
export function generateServers(count = 3) {
  return Array.from({ length: count }, (_, i) => {
    const cpu = rand(10, 95);
    const status = cpu > 85 ? 'overloaded' : cpu > 65 ? 'degraded' : 'healthy';
    return {
      id: `srv-${i + 1}`,
      name: SERVER_NAMES[i] || `server-${i + 1}`,
      containerId: `docker-${Math.random().toString(36).slice(2, 14)}`,
      ip: `172.18.0.${i + 2}`,
      port: 3001 + i,
      status,
      cpu: +cpu.toFixed(1),
      memory: +rand(20, 80).toFixed(1),
      activeConnections: randInt(0, 50),
      maxConnections: 100,
      weight: randInt(1, 5),
      uptime: randInt(60, 86400),
      totalRequests: randInt(500, 50000),
    };
  });
}

// Generate traffic data points (for charts)
export function generateTrafficHistory(points = 60) {
  const now = Date.now();
  let base = rand(20, 60);
  return Array.from({ length: points }, (_, i) => {
    // Add some wave pattern + noise
    const wave = Math.sin(i / 8) * 15;
    const spike = i > 40 && i < 50 ? rand(20, 50) : 0;
    const noise = rand(-5, 5);
    base = Math.max(5, base + rand(-2, 2));
    const actual = Math.max(0, +(base + wave + spike + noise).toFixed(1));
    const predicted = +(actual + rand(-8, 8)).toFixed(1);
    return {
      time: new Date(now - (points - i) * 1000).toISOString(),
      timestamp: now - (points - i) * 1000,
      actual,
      predicted: Math.max(0, predicted),
    };
  });
}

// Generate cache stats
export function generateCacheStats() {
  const totalHits = randInt(1000, 50000);
  const totalMisses = randInt(200, 10000);
  const total = totalHits + totalMisses;
  return {
    hitRate: +((totalHits / total) * 100).toFixed(1),
    missRate: +((totalMisses / total) * 100).toFixed(1),
    totalHits,
    totalMisses,
    totalEntries: randInt(20, 200),
    maxEntries: 500,
    memoryUsed: randInt(5, 100), // MB
    maxMemory: 128,
    evictions: randInt(0, 500),
    avgTtl: randInt(30, 300), // seconds
    topItems: ENDPOINTS.slice(0, 4).map(ep => ({
      url: ep,
      hits: randInt(50, 5000),
      size: randInt(1, 500), // KB
      ttl: randInt(30, 300),
      lastAccessed: new Date(Date.now() - randInt(0, 60000)).toISOString(),
    })),
  };
}

// Generate prediction data
export function generatePredictions() {
  return {
    currentLoad: randInt(20, 80),
    predictedLoad: randInt(25, 90),
    confidence: +rand(60, 98).toFixed(1),
    trend: pick(['rising', 'falling', 'stable']),
    rateOfChange: +rand(-0.5, 0.8).toFixed(3),
    spikeDetected: Math.random() > 0.7,
    recommendedAction: pick(['hold', 'scale_up', 'scale_down']),
    emaAlpha: 0.3,
    windowSize: 60,
  };
}

// Generate scaling events
export function generateScalingEvents(count = 10) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: scalingEventId++,
    timestamp: new Date(now - (count - i) * randInt(30000, 120000)).toISOString(),
    action: pick(['scale_up', 'scale_down']),
    serversBefore: randInt(1, 5),
    serversAfter: randInt(1, 6),
    predictedLoad: +rand(20, 95).toFixed(1),
    trigger: pick(['ema_threshold', 'spike_detected', 'cooldown_expired', 'underutilized']),
  }));
}

// Generate auto-scaling config
export function generateScalingConfig() {
  return {
    minServers: 1,
    maxServers: 8,
    currentServers: randInt(2, 5),
    scaleUpThreshold: 80,
    scaleDownThreshold: 30,
    cooldownPeriod: 30,
    emaAlpha: 0.3,
    spikeThreshold: 0.5,
  };
}

// Generate request logs
export function generateLogs(count = 50) {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    id: requestId++,
    timestamp: new Date(now - (count - i) * randInt(100, 2000)).toISOString(),
    method: pick(['GET', 'GET', 'GET', 'POST']),
    url: pick(ENDPOINTS),
    serverRouted: pick(SERVER_NAMES.slice(0, 3)),
    statusCode: pick([200, 200, 200, 200, 201, 304, 500]),
    latency: randInt(5, 800),
    cacheHit: Math.random() > 0.5,
    clientIp: `192.168.1.${randInt(1, 254)}`,
  }));
}

// Generate overall system metrics
export function generateSystemMetrics() {
  return {
    totalRequests: randInt(10000, 500000),
    requestsPerSecond: +rand(10, 150).toFixed(1),
    avgLatency: randInt(20, 200),
    p99Latency: randInt(200, 2000),
    activeServers: randInt(2, 5),
    totalServers: randInt(2, 6),
    cacheHitRate: +rand(40, 95).toFixed(1),
    uptime: randInt(3600, 864000),
    predictedLoad: +rand(20, 90).toFixed(1),
    currentLoad: +rand(15, 85).toFixed(1),
  };
}

// Simulate a live data tick — returns incremental update
export function tick(prevMetrics) {
  if (!prevMetrics) return generateSystemMetrics();
  const delta = rand(-5, 5);
  return {
    ...prevMetrics,
    totalRequests: prevMetrics.totalRequests + randInt(1, 20),
    requestsPerSecond: Math.max(1, +(prevMetrics.requestsPerSecond + rand(-3, 3)).toFixed(1)),
    avgLatency: Math.max(5, prevMetrics.avgLatency + randInt(-10, 10)),
    currentLoad: Math.max(5, Math.min(100, +(prevMetrics.currentLoad + delta).toFixed(1))),
    predictedLoad: Math.max(5, Math.min(100, +(prevMetrics.predictedLoad + delta + rand(-2, 2)).toFixed(1))),
    cacheHitRate: Math.max(10, Math.min(99, +(prevMetrics.cacheHitRate + rand(-1, 1)).toFixed(1))),
  };
}
