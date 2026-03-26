import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Database, HardDrive, Trash2, Timer, TrendingUp } from 'lucide-react';
import MetricCard from '../components/MetricCard';

const COLORS = ['#6366f1', '#374151'];

export default function Cache({ cacheStats }) {
  const donutData = [
    { name: 'Hits', value: cacheStats.totalHits },
    { name: 'Misses', value: cacheStats.totalMisses },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Edge Cache</h1>
        <p className="text-sm text-gray-500 mt-1">In-memory LRU cache — intercepts requests before hitting backend servers</p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Hit Rate" value={cacheStats.hitRate} unit="%" color="emerald" />
        <MetricCard label="Total Entries" value={`${cacheStats.totalEntries}/${cacheStats.maxEntries}`} color="indigo" />
        <MetricCard label="Memory Used" value={`${cacheStats.memoryUsed}/${cacheStats.maxMemory}`} unit="MB" color="cyan" />
        <MetricCard label="Evictions" value={cacheStats.evictions} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut Chart */}
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Hit / Miss Ratio</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={85}
                dataKey="value"
                strokeWidth={0}
              >
                {donutData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#f9fafb',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs mt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span className="text-gray-400">Hits: {cacheStats.totalHits.toLocaleString()}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-600" />
              <span className="text-gray-400">Misses: {cacheStats.totalMisses.toLocaleString()}</span>
            </span>
          </div>
        </div>

        {/* Top Cached Items */}
        <div className="lg:col-span-2 bg-gray-900/70 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top Cached Items</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                <th className="text-left py-2 font-medium">URL</th>
                <th className="text-center py-2 font-medium">Hits</th>
                <th className="text-center py-2 font-medium">Size</th>
                <th className="text-center py-2 font-medium">TTL</th>
                <th className="text-right py-2 font-medium">Last Access</th>
              </tr>
            </thead>
            <tbody>
              {cacheStats.topItems.map((item, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2.5 font-mono text-indigo-300 text-xs">{item.url}</td>
                  <td className="py-2.5 text-center text-gray-300">{item.hits.toLocaleString()}</td>
                  <td className="py-2.5 text-center text-gray-400">{item.size} KB</td>
                  <td className="py-2.5 text-center">
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Timer className="w-3 h-3" />{item.ttl}s
                    </span>
                  </td>
                  <td className="py-2.5 text-right text-gray-500 text-xs">
                    {new Date(item.lastAccessed).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      
    </div>
  );
}
