import { useState, useMemo } from 'react';
import { ScrollText, RefreshCw, CheckCircle, XCircle, Filter, X } from 'lucide-react';

function StatusCodeBadge({ code }) {
  const color = code < 300 ? 'text-emerald-400' : code < 400 ? 'text-cyan-400' : code < 500 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-xs ${color}`}>{code}</span>;
}

function LatencyBadge({ latency }) {
  const color = latency < 100 ? 'text-emerald-400' : latency < 300 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-xs ${color}`}>{latency}ms</span>;
}

/* datetime-local value (YYYY-MM-DDTHH:mm) ↔ epoch ms */
function toLocalDateTime(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Logs({ logs, onRefresh }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [urlFilter, setUrlFilter] = useState('');

  const filteredLogs = useMemo(() => {
    const fromMs = fromDate ? new Date(fromDate).getTime() : null;
    const toMs = toDate ? new Date(toDate).getTime() : null;
    const urlQ = urlFilter.trim().toLowerCase();

    return logs.filter((log) => {
      const ts = new Date(log.timestamp).getTime();
      if (fromMs !== null && ts < fromMs) return false;
      if (toMs !== null && ts > toMs) return false;
      if (methodFilter !== 'ALL' && log.method !== methodFilter) return false;
      if (statusFilter === '2xx' && !(log.statusCode >= 200 && log.statusCode < 300)) return false;
      if (statusFilter === '4xx' && !(log.statusCode >= 400 && log.statusCode < 500)) return false;
      if (statusFilter === '5xx' && !(log.statusCode >= 500)) return false;
      if (urlQ && !(log.url || '').toLowerCase().includes(urlQ)) return false;
      return true;
    });
  }, [logs, fromDate, toDate, methodFilter, statusFilter, urlFilter]);

  const cacheHits = filteredLogs.filter((l) => l.cacheHit).length;
  const avgLatency = filteredLogs.length
    ? Math.round(filteredLogs.reduce((sum, l) => sum + l.latency, 0) / filteredLogs.length)
    : 0;
  const errorCount = filteredLogs.filter((l) => l.statusCode >= 500).length;

  const setQuickRange = (minutes) => {
    const now = Date.now();
    setFromDate(toLocalDateTime(now - minutes * 60 * 1000));
    setToDate(toLocalDateTime(now));
  };

  const clearFilters = () => {
    setFromDate('');
    setToDate('');
    setMethodFilter('ALL');
    setStatusFilter('ALL');
    setUrlFilter('');
  };

  const hasFilters = fromDate || toDate || methodFilter !== 'ALL' || statusFilter !== 'ALL' || urlFilter;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Request Logs</h1>
          <p className="text-sm text-gray-500 mt-1">
            Showing {filteredLogs.length} of {logs.length} requests
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter Panel */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Filter className="w-4 h-4 text-indigo-400" />
            Filters
          </div>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">From</span>
            <input
              type="datetime-local"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">To (until)</span>
            <input
              type="datetime-local"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Method</span>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All</option>
              <option value="2xx">2xx</option>
              <option value="4xx">4xx</option>
              <option value="5xx">5xx</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">URL contains</span>
            <input
              type="text"
              value={urlFilter}
              onChange={(e) => setUrlFilter(e.target.value)}
              placeholder="/api/..."
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-gray-500">Quick:</span>
          {[
            { label: '5m', min: 5 },
            { label: '15m', min: 15 },
            { label: '1h', min: 60 },
            { label: '6h', min: 360 },
            { label: '24h', min: 1440 },
          ].map((r) => (
            <button
              key={r.label}
              onClick={() => setQuickRange(r.min)}
              className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-[11px] text-gray-300 hover:bg-gray-700"
            >
              Last {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xl font-bold text-white">{filteredLogs.length}</p>
          <p className="text-xs text-gray-500">Total Requests</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xl font-bold text-white">{cacheHits}</p>
          <p className="text-xs text-gray-500">Cache Hits</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xl font-bold text-white">{avgLatency}ms</p>
          <p className="text-xs text-gray-500">Avg Latency</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-xl font-bold text-white">{errorCount}</p>
          <p className="text-xs text-gray-500">Errors (5xx)</p>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-150 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900">
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Time</th>
                <th className="text-left px-4 py-2.5 font-medium">Method</th>
                <th className="text-left px-4 py-2.5 font-medium">URL</th>
                <th className="text-left px-4 py-2.5 font-medium">Server</th>
                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                <th className="text-center px-4 py-2.5 font-medium">Latency</th>
                <th className="text-center px-4 py-2.5 font-medium">Cache</th>
                <th className="text-right px-4 py-2.5 font-medium">Client IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-500">
                    No logs match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], {
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs font-bold ${
                        log.method === 'GET' ? 'text-emerald-400' : 'text-amber-400'
                      }`}>
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-indigo-300">{log.url}</td>
                    <td className="px-4 py-2 text-xs text-gray-300">{log.serverRouted}</td>
                    <td className="px-4 py-2 text-center"><StatusCodeBadge code={log.statusCode} /></td>
                    <td className="px-4 py-2 text-center"><LatencyBadge latency={log.latency} /></td>
                    <td className="px-4 py-2 text-center">
                      {log.cacheHit ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-gray-600 mx-auto" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500 font-mono">{log.clientIp}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
