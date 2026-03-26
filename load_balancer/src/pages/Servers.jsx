import { Server, Cpu, MemoryStick, Network, Weight, ArrowUpDown } from 'lucide-react';

function StatusBadge({ status }) {
  const styles = {
    healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    degraded: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    overloaded: 'bg-red-500/15 text-red-400 border-red-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'healthy' ? 'bg-emerald-400' : status === 'degraded' ? 'bg-amber-400' : 'bg-red-400'
      }`} />
      {status}
    </span>
  );
}

function UsageBar({ value, max = 100, color = 'indigo' }) {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : `bg-${color}-500`;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 w-10 text-right">{value}%</span>
    </div>
  );
}

export default function Servers({ servers }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Server Pool</h1>
        <p className="text-sm text-gray-500 mt-1">
          {servers.length} container{servers.length !== 1 ? 's' : ''} active — Weighted Least Connections routing
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <Server className="w-5 h-5 text-indigo-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">{servers.length}</p>
          <p className="text-xs text-gray-500">Active Containers</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <Cpu className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">
            {(servers.reduce((s, sv) => s + sv.cpu, 0) / servers.length).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-500">Avg CPU</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <MemoryStick className="w-5 h-5 text-purple-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">
            {(servers.reduce((s, sv) => s + sv.memory, 0) / servers.length).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-500">Avg Memory</p>
        </div>
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 text-center">
          <Network className="w-5 h-5 text-emerald-400 mx-auto mb-2" />
          <p className="text-2xl font-bold text-white">
            {servers.reduce((s, sv) => s + sv.activeConnections, 0)}
          </p>
          <p className="text-xs text-gray-500">Total Connections</p>
        </div>
      </div>

      {/* Server Table */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Server</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">CPU</th>
                <th className="text-left px-4 py-3 font-medium">Memory</th>
                <th className="text-center px-4 py-3 font-medium">Connections</th>
                <th className="text-center px-4 py-3 font-medium">Weight</th>
                <th className="text-center px-4 py-3 font-medium">Score</th>
                <th className="text-right px-4 py-3 font-medium">Requests</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(srv => {
                const score = srv.weight > 0 ? (srv.activeConnections / srv.weight).toFixed(2) : '∞';
                return (
                  <tr key={srv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white">{srv.name}</p>
                        <p className="text-[11px] text-gray-500 font-mono">{srv.containerId}</p>
                        <p className="text-[11px] text-gray-600">{srv.ip}:{srv.port}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={srv.status} /></td>
                    <td className="px-4 py-3 min-w-30"><UsageBar value={srv.cpu} /></td>
                    <td className="px-4 py-3 min-w-30"><UsageBar value={srv.memory} /></td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-white font-mono">{srv.activeConnections}</span>
                      <span className="text-gray-600">/{srv.maxConnections}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-indigo-400 font-mono">
                        <Weight className="w-3 h-3" />{srv.weight}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-mono text-xs px-2 py-1 rounded ${
                        parseFloat(score) < 5 ? 'bg-emerald-500/10 text-emerald-400' :
                        parseFloat(score) < 15 ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{srv.totalRequests.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Algorithm Explanation */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-white">Routing Algorithm: Weighted Least Connections</h3>
        </div>
      </div>
    </div>
  );
}
