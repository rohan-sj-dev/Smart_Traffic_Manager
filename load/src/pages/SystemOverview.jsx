import { useEffect, useState } from "react";
import MetricCard from "../components/MetricCard";
import { subscribeWorkloads } from "../services/workloadStore";

export default function SystemOverview() {
  const [status, setStatus] = useState(null);
  const [workloads, setWorkloads] = useState({ ml: { running: false, count: 0 }, matrix: { running: false, count: 0 }, image: { running: false, count: 0 } });

  useEffect(() => {
    const unsubscribe = subscribeWorkloads(setWorkloads);
    
    const fetchStatus = async () => {
      try {
        const res = await fetch("http://localhost:4000/api/status");
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (e) {

      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 1000);
    
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const metrics = status?.metrics || {};
  const servers = status?.servers || [];
  const cpuAvg = servers.length > 0 ? (servers.reduce((acc, s) => acc + (s.cpu || 0), 0) / servers.length).toFixed(1) : 0;
  const memoryAvg = servers.length > 0 ? (servers.reduce((acc, s) => acc + (s.memory || 0), 0) / servers.length).toFixed(1) : 0;
  const activeTasksCount = (workloads.ml.running ? 1 : 0) + (workloads.matrix.running ? 1 : 0) + (workloads.image.running ? 1 : 0);

  return (
    <div className="p-6 text-white max-w-7xl mx-auto">

      {}
      <h1 className="text-3xl font-semibold mb-8 tracking-tight 
                     bg-gradient-to-r from-white to-gray-400 
                     bg-clip-text text-transparent">
        System Overview
      </h1>

      {}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
        <MetricCard title="Avg CPU Usage" value={cpuAvg} unit="%" />
        <MetricCard title="Avg Memory Usage" value={memoryAvg} unit="%" />
        <MetricCard title="Active Workloads" value={activeTasksCount} />
        <MetricCard title="Throughput" value={Math.round(metrics.requestsPerSecond || 0)} unit="req/s" />
      </div>

      {}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">

        <h2 className="text-lg font-semibold mb-4">
          Active Workloads
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {}
          <div className={`p-5 rounded-xl border transition ${workloads.matrix.running ? 'bg-[#020617] border-indigo-500/50' : 'bg-[#020617]/50 border-gray-800'}`}>
            <div className="flex items-center justify-between">
              <p className="text-gray-400">Matrix</p>
              <span className={`w-2 h-2 rounded-full ${workloads.matrix.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></span>
            </div>
            <h2 className="text-xl font-bold mt-2">{workloads.matrix.running ? `${workloads.matrix.count} running` : 'Idle'}</h2>
          </div>

          {}
          <div className={`p-5 rounded-xl border transition ${workloads.image.running ? 'bg-[#020617] border-indigo-500/50' : 'bg-[#020617]/50 border-gray-800'}`}>
            <div className="flex items-center justify-between">
              <p className="text-gray-400">Image</p>
              <span className={`w-2 h-2 rounded-full ${workloads.image.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></span>
            </div>
            <h2 className="text-xl font-bold mt-2">{workloads.image.running ? `${workloads.image.count} running` : 'Idle'}</h2>
          </div>

          {}
          <div className={`p-5 rounded-xl border transition ${workloads.ml.running ? 'bg-[#020617] border-indigo-500/50' : 'bg-[#020617]/50 border-gray-800'}`}>
            <div className="flex items-center justify-between">
              <p className="text-gray-400">ML Training</p>
              <span className={`w-2 h-2 rounded-full ${workloads.ml.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`}></span>
            </div>
            <h2 className="text-xl font-bold mt-2">{workloads.ml.running ? `${workloads.ml.count} running` : 'Idle'}</h2>
          </div>

        </div>
      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        <MetricCard title="Total Requests" value={metrics.totalRequests?.toLocaleString() || 0} />
        <MetricCard title="Avg Latency" value={Math.round(metrics.avgLatency || 0)} unit="ms" />
        <MetricCard title="Peak Load" value={Math.round(status?.predictions?.predictedLoad || 0)} unit="req/s" />

      </div>

    </div>
  );
}