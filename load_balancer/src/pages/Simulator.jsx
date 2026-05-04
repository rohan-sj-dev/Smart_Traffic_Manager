import { useMemo, useState } from 'react';
import { Send, ArrowUp, ArrowDown, Pause } from 'lucide-react';

const PRESET_ENDPOINTS = ['/cpu', '/ml', '/image', '/data', '/api/train', '/api/predict', '/api/datasets'];
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

function ActionPill({ action }) {
  const map = {
    scale_up: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', Icon: ArrowUp },
    scale_down: { cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', Icon: ArrowDown },
    hold: { cls: 'bg-gray-500/15 text-gray-400 border-gray-500/30', Icon: Pause },
  };
  const { cls, Icon } = map[action] || map.hold;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cls}`}>
      <Icon className="w-3 h-3" />
      {(action || 'hold').replace('_', ' ')}
    </span>
  );
}

export default function Simulator({ onSendRequest, onSimulateLoad, connected, logs, scalingEvents }) {
  const [endpoint, setEndpoint] = useState('/data');
  const [method, setMethod] = useState('GET');
  const [count, setCount] = useState(50);
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState([]);

  const recentSimLogs = useMemo(() => {
    return logs
      .filter((l) => history.some((h) => h.url === l.url))
      .slice(0, 30);
  }, [logs, history]);

  const recentScaling = useMemo(() => scalingEvents.slice(0, 10), [scalingEvents]);

  const pushHistory = (entry) => {
    setHistory((prev) => [{ ...entry, timestamp: Date.now() }, ...prev].slice(0, 20));
  };

  const handleCallEndpoint = () => {
    if (!endpoint.trim()) return;
    const ok = onSendRequest(endpoint.trim(), method);
    pushHistory({ kind: 'single', url: endpoint.trim(), method, count: 1, sent: ok });
  };

  const handleSimulateLoad = () => {
    if (!endpoint.trim()) return;
    const n = Math.max(1, Math.min(5000, parseInt(count, 10) || 1));
    const dur = Math.max(0, Math.min(300, parseInt(duration, 10) || 0));
    const ok = onSimulateLoad(endpoint.trim(), n, method, dur);
    pushHistory({
      kind: dur > 0 ? 'sustained' : 'burst',
      url: endpoint.trim(),
      method,
      count: dur > 0 ? `${n}/s × ${dur}s` : n,
      sent: ok,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Load Simulator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send custom requests, generate burst traffic, and watch how the load balancer reacts.
        </p>
      </div>

      {/* Control Panel */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Request Configuration</h3>
          {!connected && (
            <span className="ml-auto text-[11px] text-amber-400">Engine offline — requests will not be sent</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <label className="md:col-span-5 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Endpoint</span>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="/data or /api/custom"
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 font-mono placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label className="md:col-span-2 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">
              {duration > 0 ? 'RPS' : 'Burst Count'}
            </span>
            <input
              type="number"
              min={1}
              max={5000}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500"
            />
          </label>
          <label className="md:col-span-3 flex flex-col gap-1">
            <span className="text-[11px] text-gray-500 uppercase tracking-wider">Duration (sec, 0 = burst)</span>
            <input
              type="number"
              min={0}
              max={300}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10) || 0)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-500">Presets:</span>
          {PRESET_ENDPOINTS.map((p) => (
            <button
              key={p}
              onClick={() => setEndpoint(p)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                endpoint === p
                  ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
          <button
            onClick={handleCallEndpoint}
            disabled={!endpoint.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            Call Endpoint
          </button>
          <button
            onClick={handleSimulateLoad}
            disabled={!endpoint.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {duration > 0 ? `Sustain ${count} rps × ${duration}s` : `Burst ×${count}`}
          </button>
        </div>
      </div>

      {/* Action History + Live Response Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent Actions</h3>
            <span className="text-[11px] text-gray-500">{history.length} total</span>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No actions yet — send a request to begin.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800/50">
              {history.map((h, idx) => (
                <li key={idx} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`font-bold ${h.method === 'GET' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {h.method}
                    </span>
                    <span className="font-mono text-indigo-300 truncate">{h.url}</span>
                    <span className="text-gray-500">×{h.count}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={h.sent ? 'text-emerald-400' : 'text-red-400'}>
                      {h.sent ? 'sent' : 'failed'}
                    </span>
                    <span className="text-gray-500 font-mono">
                      {new Date(h.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Scaling Reactions</h3>
            <span className="text-[11px] text-gray-500">{recentScaling.length} recent</span>
          </div>
          {recentScaling.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-gray-500">No scaling events yet.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800/50">
              {recentScaling.map((evt) => (
                <li key={evt.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <ActionPill action={evt.action} />
                    <span className="text-gray-300 font-mono">
                      {evt.serversBefore} → {evt.serversAfter}
                    </span>
                  </div>
                  <span className="text-gray-500 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Live Response Log for the simulated endpoints */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Responses for Simulated Endpoints</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Live request log filtered to URLs you've called from this page.
          </p>
        </div>
        {recentSimLogs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">
            Trigger a request above to see backend responses here.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Method</th>
                  <th className="text-left px-4 py-2 font-medium">URL</th>
                  <th className="text-left px-4 py-2 font-medium">Server</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                  <th className="text-center px-4 py-2 font-medium">Latency</th>
                  <th className="text-center px-4 py-2 font-medium">Cache</th>
                </tr>
              </thead>
              <tbody>
                {recentSimLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-1.5 text-xs text-gray-400 font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className={`px-4 py-1.5 text-xs font-bold ${log.method === 'GET' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {log.method}
                    </td>
                    <td className="px-4 py-1.5 font-mono text-xs text-indigo-300">{log.url}</td>
                    <td className="px-4 py-1.5 text-xs text-gray-300">{log.serverRouted}</td>
                    <td className={`px-4 py-1.5 text-center font-mono text-xs ${
                      log.statusCode < 300 ? 'text-emerald-400' : log.statusCode < 500 ? 'text-amber-400' : 'text-red-400'
                    }`}>{log.statusCode}</td>
                    <td className="px-4 py-1.5 text-center font-mono text-xs text-gray-300">{log.latency}ms</td>
                    <td className="px-4 py-1.5 text-center text-xs">
                      {log.cacheHit ? <span className="text-emerald-400">HIT</span> : <span className="text-gray-500">miss</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
