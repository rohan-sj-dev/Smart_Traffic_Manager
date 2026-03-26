import { ScrollText, RefreshCw, CheckCircle, XCircle, Database, Wifi } from 'lucide-react';

function StatusCodeBadge({ code }) {
  const color = code < 300 ? 'text-emerald-400' : code < 400 ? 'text-cyan-400' : code < 500 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-xs ${color}`}>{code}</span>;
}

function LatencyBadge({ latency }) {
  const color = latency < 100 ? 'text-emerald-400' : latency < 300 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-xs ${color}`}>{latency}ms</span>;
}

export default function Logs({ logs, onRefresh }) {
  const cacheHits = logs.filter(l => l.cacheHit).length;
  const avgLatency = Math.round(logs.reduce((sum, l) => sum + l.latency, 0) / logs.length);
  const errorCount = logs.filter(l => l.statusCode >= 500).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Request Logs</h1>
          <p className="text-sm text-gray-500 mt-1">Showing last {logs.length} requests</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
                  <p className="text-xl font-bold text-white">{logs.length}</p>
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
              {logs.map(log => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2 text-xs text-gray-400 font-mono whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
