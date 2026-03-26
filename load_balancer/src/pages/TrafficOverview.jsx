import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Activity, Zap, Clock, Server, TrendingUp, Database } from 'lucide-react';
import MetricCard from '../components/MetricCard';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TrafficOverview({ metrics, trafficHistory }) {
  const chartData = trafficHistory.map(p => ({
    time: formatTime(p.time),
    actual: p.actual,
    predicted: p.predicted,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Traffic Overview</h1>
        <p className="text-sm text-gray-500 mt-1">Real-time system monitoring and traffic analytics</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <MetricCard label="Total Requests" value={metrics.totalRequests.toLocaleString()} color="cyan" />
        <MetricCard label="Avg Latency" value={metrics.avgLatency} unit="ms" color="amber" />
        <MetricCard label="P99 Latency" value={metrics.p99Latency} unit="ms" color="red" />
        <MetricCard label="Active Servers" value={`${metrics.activeServers}/${metrics.totalServers}`} color="emerald" />
        <MetricCard label="Cache Hit Rate" value={metrics.cacheHitRate} unit="%" color="purple" />
      </div>

      {/* Traffic Chart */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Request Rate</h2>
            <p className="text-xs text-gray-500 mt-0.5">Actual vs Predicted (last 60 seconds)</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 rounded" />
              <span className="text-gray-400">Actual</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 rounded" />
              <span className="text-gray-400">Predicted</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPredicted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="time"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={{ stroke: '#374151' }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f9fafb',
              }}
            />
            <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fill="url(#gradActual)" />
            <Area type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" fill="url(#gradPredicted)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Load Gauge */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Current Load</h3>
          <div className="relative w-full bg-gray-800 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                metrics.currentLoad > 80 ? 'bg-red-500' : metrics.currentLoad > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, metrics.currentLoad)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{metrics.currentLoad}% capacity utilized</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Predicted Load</h3>
          <div className="relative w-full bg-gray-800 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all duration-500 ${
                metrics.predictedLoad > 80 ? 'bg-red-500' : metrics.predictedLoad > 60 ? 'bg-amber-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min(100, metrics.predictedLoad)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">{metrics.predictedLoad}% predicted load</p>
        </div>
      </div>

      {/* Uptime */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-300">System Uptime</span>
        </div>
        <span className="text-sm font-mono text-white">{formatUptime(metrics.uptime)}</span>
      </div>
    </div>
  );
}
