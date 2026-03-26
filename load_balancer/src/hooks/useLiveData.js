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

// Hook that simulates a real-time data stream (mock WebSocket).
// When the bridge is ready, replace the mock interval with a real WebSocket connection.
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
  const intervalRef = useRef(null);

  useEffect(() => {
    setConnected(true);

    intervalRef.current = setInterval(() => {
      setMetrics(prev => tick(prev));

      // Update traffic history — shift left, add new point
      setTrafficHistory(prev => {
        const now = Date.now();
        const lastActual = prev[prev.length - 1]?.actual ?? 50;
        const noise = (Math.random() - 0.5) * 10;
        const actual = Math.max(0, +(lastActual + noise).toFixed(1));
        const predicted = Math.max(0, +(actual + (Math.random() - 0.5) * 16).toFixed(1));
        const next = [...prev.slice(1), { time: new Date(now).toISOString(), timestamp: now, actual, predicted }];
        return next;
      });

      // Refresh servers every 3 seconds
      if (Math.random() > 0.66) {
        setServers(generateServers(3 + Math.floor(Math.random() * 2)));
      }

      // Refresh cache/predictions less frequently
      if (Math.random() > 0.8) setCacheStats(generateCacheStats());
      if (Math.random() > 0.85) setPredictions(generatePredictions());
    }, intervalMs);

    return () => {
      clearInterval(intervalRef.current);
      setConnected(false);
    };
  }, [intervalMs]);

  const refreshLogs = useCallback(() => {
    setLogs(generateLogs(50));
  }, []);

  const refreshScalingEvents = useCallback(() => {
    setScalingEvents(generateScalingEvents(15));
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
