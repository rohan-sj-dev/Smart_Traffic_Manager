import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateSystemMetrics,
  generateServers,
  generateTrafficHistory,
  generateCacheStats,
  generatePredictions,
  generateScalingEvents,
  generateScalingConfig,
  generateLogs,
  tick,
} from '../services/mockData';

const WS_URL = 'ws://localhost:4000';
const API_BASE = 'http://localhost:4000';
const RECONNECT_MS = 3000;

const roundDecimals = (obj) => {
  if (typeof obj === 'number') {
    return Number.isInteger(obj) ? obj : Number(obj.toFixed(2));
  }
  if (Array.isArray(obj)) {
    return obj.map(roundDecimals);
  }
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const key in obj) {
      result[key] = roundDecimals(obj[key]);
    }
    return result;
  }
  return obj;
};

export function useLiveData(intervalMs = 1000) {
  const [metrics, setMetrics] = useState(generateSystemMetrics);
  const [servers, setServers] = useState(() => generateServers(3));
  const [trafficHistory, setTrafficHistory] = useState(() => generateTrafficHistory(60));
  const [cacheStats, setCacheStats] = useState(generateCacheStats);
  const [predictions, setPredictions] = useState(generatePredictions);
  const [scalingEvents, setScalingEvents] = useState(() => generateScalingEvents(15));
  const [scalingConfig, setScalingConfig] = useState(generateScalingConfig);
  const [logs, setLogs] = useState(() => generateLogs(200));
  const [logStats, setLogStats] = useState({ total: 0, hits: 0, errors: 0, avgLatency: 0 });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const fallbackRef = useRef(null);
  const liveRef = useRef(false);
  const logRangeRef = useRef('24h');
  const connectWsRef = useRef(null);

  const startMockFallback = useCallback(() => {
    if (fallbackRef.current) return;
    fallbackRef.current = setInterval(() => {
      setMetrics(prev => tick(prev));
      setTrafficHistory(prev => {
        const now = Date.now();
        const lastActual = prev[prev.length - 1]?.actual ?? 50;
        const noise = (Math.random() - 0.5) * 10;
        const actual = Math.max(0, +(lastActual + noise).toFixed(1));
        const predicted = Math.max(0, +(actual + (Math.random() - 0.5) * 16).toFixed(1));
        return [...prev.slice(1), { time: new Date(now).toISOString(), timestamp: now, actual, predicted }];
      });
      if (Math.random() > 0.66) setServers(generateServers(3 + Math.floor(Math.random() * 2)));
      if (Math.random() > 0.8) setCacheStats(generateCacheStats());
      if (Math.random() > 0.85) setPredictions(generatePredictions());
    }, intervalMs);
  }, [intervalMs]);

  const stopMockFallback = useCallback(() => {
    if (fallbackRef.current) { clearInterval(fallbackRef.current); fallbackRef.current = null; }
  }, []);

  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      liveRef.current = true;
      stopMockFallback();
      ws.send(JSON.stringify({ type: 'get_status' }));
    };

    ws.onmessage = (evt) => {
      try {
        let msg = JSON.parse(evt.data);
        msg = roundDecimals(msg);
        switch (msg.type) {
          case 'status': {
            const d = msg.data;
            if (d.metrics) setMetrics(d.metrics);
            if (d.servers) setServers(d.servers);
            if (d.trafficHistory) setTrafficHistory(d.trafficHistory);
            if (d.cacheStats) setCacheStats(d.cacheStats);
            if (d.predictions) setPredictions(d.predictions);
            if (d.scalingEvents) setScalingEvents([...d.scalingEvents].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
            if (d.scalingConfig) setScalingConfig(d.scalingConfig);
            break;
          }
          case 'log':
            setLogs(prev => [msg.data, ...prev.slice(0, 1999)]);
            break;
          case 'scaling_event':
            setScalingEvents(prev => [{ id: prev.length + 1, ...msg.data }, ...prev]);
            break;
          case 'engine_status':
            setConnected(msg.connected);
            break;
          default:
            break;
        }
      } catch {  }
    };

    ws.onclose = () => {
      setConnected(false);
      liveRef.current = false;
      startMockFallback();
      reconnectRef.current = setTimeout(() => {
        connectWsRef.current?.();
      }, RECONNECT_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [stopMockFallback, startMockFallback]);

  useEffect(() => {
    connectWsRef.current = connectWs;
    connectWs();

    startMockFallback();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      stopMockFallback();
    };
  }, [connectWs, startMockFallback, stopMockFallback]);

  const refreshLogs = useCallback((range = logRangeRef.current, from, to) => {
    logRangeRef.current = range;
    if (liveRef.current && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    }

    let url = `${API_BASE}/api/logs?source=db&range=${encodeURIComponent(range)}&limit=2000`;
    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to) url += `&to=${encodeURIComponent(to)}`;

    fetch(url)
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Could not load DB logs')))
      .then(data => {
        if (Array.isArray(data.logs)) {
          setLogs(data.logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
          if (data.stats) {
            setLogStats(data.stats);
          }
        }
      })
      .catch(() => {

        if (!liveRef.current) {
           setLogs(prev => prev.length === 0 ? generateLogs(200) : prev);
        }
      });
  }, []);

  useEffect(() => {
    if (connected) refreshLogs();
  }, [connected, refreshLogs]);

  const refreshScalingEvents = useCallback(() => {
    if (liveRef.current && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    } else {
      setScalingEvents(generateScalingEvents(15));
    }
  }, []);

  const sendWs = useCallback((payload) => {
    if (liveRef.current && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const setScalingLimits = useCallback((minServers, maxServers) => {
    const ok = sendWs({ type: 'set_scaling_limits', minServers, maxServers });
    if (!ok) {
      setScalingConfig(prev => ({ ...prev, minServers, maxServers }));
    }
    return ok;
  }, [sendWs]);

  const sendCustomRequest = useCallback((url, method = 'GET') => {
    return sendWs({ type: 'route_request', url, method });
  }, [sendWs]);

  const simulateLoad = useCallback((url, count, method = 'GET', durationSec = 0) => {
    return sendWs({ type: 'simulate_load', url, count, method, durationSec });
  }, [sendWs]);

  return {
    connected,
    metrics,
    servers,
    trafficHistory,
    cacheStats,
    predictions,
    scalingEvents,
    scalingConfig,
    logs,
    logStats,
    refreshLogs,
    refreshScalingEvents,
    setScalingLimits,
    sendCustomRequest,
    simulateLoad,
  };
}