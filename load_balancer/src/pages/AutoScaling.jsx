import { Scaling, ArrowUp, ArrowDown, Pause, Settings, RefreshCw } from 'lucide-react';

function ActionBadge({ action }) {
  const styles = {
    scale_up: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    scale_down: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    hold: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  };
  const icons = {
    scale_up: <ArrowUp className="w-3 h-3" />,
    scale_down: <ArrowDown className="w-3 h-3" />,
    hold: <Pause className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${styles[action]}`}>
      {icons[action]}
      {action.replace('_', ' ')}
    </span>
  );
}

function TriggerBadge({ trigger }) {
  const label = trigger || 'auto';
  const colors = {
    ema_threshold: 'text-indigo-400',
    spike_detected: 'text-red-400',
    cooldown_expired: 'text-amber-400',
    underutilized: 'text-cyan-400',
    high_predicted_load: 'text-amber-400',
    low_predicted_load: 'text-cyan-400',
  };
  return (
    <span className={`text-xs font-mono ${colors[label] || 'text-gray-400'}`}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

export default function AutoScaling({ scalingEvents, scalingConfig, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Auto-Scaling</h1>
          <p className="text-sm text-gray-500 mt-1">Predictive scaling by EMA + threshold heuristics</p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Config Panel */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-semibold text-white">Scaling Policy</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Min Servers', value: scalingConfig.minServers },
            { label: 'Max Servers', value: scalingConfig.maxServers },
            { label: 'Current Servers', value: scalingConfig.currentServers },
            { label: 'Cooldown', value: `${scalingConfig.cooldownPeriod}s` },
            { label: 'Scale-Up Threshold', value: `${scalingConfig.scaleUpThreshold}%` },
            { label: 'Scale-Down Threshold', value: `${scalingConfig.scaleDownThreshold}%` },
            { label: 'EMA Alpha (α)', value: scalingConfig.emaAlpha },
            { label: 'Spike Threshold', value: scalingConfig.spikeThreshold },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-lg font-bold text-white font-mono">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Capacity Gauge */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Server capacity</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex gap-1">
              {Array.from({ length: scalingConfig.maxServers }, (_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-8 rounded ${
                    i < scalingConfig.currentServers
                      ? 'bg-indigo-500/40 border border-indigo-500/60'
                      : 'bg-gray-800 border border-gray-700/50'
                  } flex items-center justify-center`}
                >
                  <Scaling className={`w-3.5 h-3.5 ${i < scalingConfig.currentServers ? 'text-indigo-300' : 'text-gray-600'}`} />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[11px] text-gray-500">Min: {scalingConfig.minServers}</span>
              <span className="text-[11px] text-gray-400">{scalingConfig.currentServers} / {scalingConfig.maxServers} active</span>
              <span className="text-[11px] text-gray-500">Max: {scalingConfig.maxServers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scaling Events Log */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">Scaling Event History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-2.5 font-medium">Timestamp</th>
                <th className="text-left px-4 py-2.5 font-medium">Action</th>
                <th className="text-center px-4 py-2.5 font-medium">Before</th>
                <th className="text-center px-4 py-2.5 font-medium">After</th>
                <th className="text-center px-4 py-2.5 font-medium">Predicted Load</th>
                <th className="text-left px-4 py-2.5 font-medium">Trigger</th>
              </tr>
            </thead>
            <tbody>
              {scalingEvents.map(evt => (
                <tr key={evt.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2.5"><ActionBadge action={evt.action} /></td>
                  <td className="px-4 py-2.5 text-center text-gray-300 font-mono">{evt.serversBefore}</td>
                  <td className="px-4 py-2.5 text-center text-white font-mono">{evt.serversAfter}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-mono ${evt.predictedLoad > 80 ? 'text-red-400' : 'text-gray-300'}`}>
                      {evt.predictedLoad}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5"><TriggerBadge trigger={evt.trigger || evt.reason} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
