import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { formatDecimal } from '../utils/format';

const API_BASE = 'http://localhost:4000';
const RANGES = ['15m', '1h', '6h', '24h', '7d'];

function formatPointTime(value, range) {
  const date = new Date(value);
  if (range === '7d') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function MetricBox({ label, value, unit }) {
  return (
    <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <h2 className="text-xl font-bold text-white mt-2">
        {value}
        {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
      </h2>
    </div>
  );
}

export default function History() {
  const [range, setRange] = useState('1h');
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/api/history?range=${range}`, {
          signal: controller.signal,
        });
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Bridge did not return JSON. Restart the bridge so /api/history is available.');
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load history');
        setHistory(data);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setHistory(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadHistory();
    return () => controller.abort();
  }, [range, reloadKey]);

  const chartData = useMemo(() => (
    history?.points?.map(point => ({
      ...point,
      label: formatPointTime(point.time, range),
    })) || []
  ), [history, range]);

  const summary = history?.summary || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Load History</h1>
          <p className="text-sm text-gray-500 mt-1">Historical traffic and latency from PostgreSQL</p>
        </div>
        <button
          onClick={() => setReloadKey(key => key + 1)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGES.map(item => (
          <button
            key={item}
            onClick={() => setRange(item)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
              range === item
                ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                : 'bg-gray-900/70 border-gray-800 text-gray-400 hover:bg-gray-800'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricBox label="Total Requests" value={(summary.totalRequests || 0).toLocaleString()} />
        <MetricBox label="Avg Processing" value={formatDecimal(summary.avgProcessingMs || 0)} unit="ms" />
        <MetricBox label="Peak Load" value={formatDecimal(summary.peakLoad || 0)} unit="%" />
        <MetricBox label="Avg Cache Hit" value={formatDecimal(summary.avgCacheHitRate || 0)} unit="%" />
      </div>

      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Load Over Time</h2>
          <span className="text-xs text-gray-500">{chartData.length} points</span>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} tickFormatter={(value) => formatDecimal(value)} />
              <Tooltip
                formatter={(value) => formatDecimal(value)}
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', color: '#f9fafb' }}
              />
              <Line type="monotone" dataKey="load" name="Load %" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="requestsPerSecond" name="Requests/sec" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-80 flex items-center justify-center text-sm text-gray-500">
            {loading ? 'Loading history...' : 'No metric snapshots found for this range'}
          </div>
        )}
      </div>

    </div>
  );
}