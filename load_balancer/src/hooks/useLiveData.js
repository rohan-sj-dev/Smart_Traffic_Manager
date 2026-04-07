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
const RECONNECT_MS = 3000;

/**
 * Real-time data hook.
 * Connects to the bridge WebSocket for live data.
 * Falls back to mock data when the bridge is unreachable.
 */
export function useLiveData(intervalMs = 1000) {
  const [metrics, setMetrics] = useState(generateSystemMetrics);
  const [servers, setServers] = useState(() => generateServers(3));
  const [trafficHistory, setTrafficHistory] = useState(() => generateTrafficHistory(60));
  const [cacheStats, setCacheStats] = useState(generateCacheStats);
  const [predictions, setPredictions] = useState(generatePredictions);
  const [scalingEvents, setScalingEvents] = useState(() => generateScalingEvents(15));
  const [scalingConfig, setScalingConfig] = useState(generateScalingConfig);
  const [logs, setLogs] = useState(() => generateLogs(50));
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const fallbackRef = useRef(null);
  const liveRef = useRef(false);

  // ── Mock-data fallback (runs only when WS is disconnected) ────────────
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

  // ── WebSocket connection ──────────────────────────────────────────────
  const connectWs = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return; // already open/connecting

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
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case 'status': {
            const d = msg.data;
            if (d.metrics) setMetrics(d.metrics);
            if (d.servers) setServers(d.servers);
            if (d.trafficHistory) setTrafficHistory(d.trafficHistory);
            if (d.cacheStats) setCacheStats(d.cacheStats);
            if (d.predictions) setPredictions(d.predictions);
            if (d.scalingEvents) setScalingEvents(d.scalingEvents);
            if (d.scalingConfig) setScalingConfig(d.scalingConfig);
            if (d.logs) setLogs(d.logs);
            break;
          }
          case 'log':
            setLogs(prev => [...prev.slice(-199), msg.data]);
            break;
          case 'scaling_event':
            setScalingEvents(prev => [...prev, { id: prev.length + 1, ...msg.data }]);
            break;
          case 'engine_status':
            setConnected(msg.connected);
            break;
          default:
            break;
        }
      } catch (_) { /* ignore malformed frames */ }
    };

    ws.onclose = () => {
      setConnected(false);
      liveRef.current = false;
      startMockFallback();
      reconnectRef.current = setTimeout(connectWs, RECONNECT_MS);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [stopMockFallback, startMockFallback]);

  useEffect(() => {
    connectWs();
    // Start mock fallback immediately (it'll be stopped once WS connects)
    startMockFallback();

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      stopMockFallback();
    };
  }, [connectWs, startMockFallback, stopMockFallback]);

  const refreshLogs = useCallback(() => {
    if (liveRef.current && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    } else {
      setLogs(generateLogs(50));
    }
  }, []);

  const refreshScalingEvents = useCallback(() => {
    if (liveRef.current && wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'get_status' }));
    } else {
      setScalingEvents(generateScalingEvents(15));
    }
  }, []);

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
    refreshLogs,
    refreshScalingEvents,
  };
}
