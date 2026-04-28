import { useState, useEffect, useCallback, useRef } from 'react';

export function useSimulator() {
  const [connected, setConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket('ws://localhost:4000');
      
      ws.current.onopen = () => setConnected(true);
      ws.current.onclose = () => {
        setConnected(false);
        setTimeout(connect, 2000);
      };
      ws.current.onerror = () => ws.current?.close();
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.onclose = null;
        ws.current.close();
      }
    };
  }, []);

  const simulateLoad = useCallback((url, count, method = 'GET') => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'simulate_load', url, count, method }));
      return true;
    }
    return false;
  }, []);

  return { connected, simulateLoad };
}
