import { useEffect, useState } from "react";
import { getMetrics } from "../services/api";

export default function useMetrics() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const interval = setInterval(async () => {
      const data = await getMetrics();
      setMetrics(data);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}