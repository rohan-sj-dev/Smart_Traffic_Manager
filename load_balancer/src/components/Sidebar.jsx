import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Server,
  Database,
  BrainCircuit,
  Scaling,
  ScrollText,
  Activity,
  Wifi,
  WifiOff,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: BarChart3, label: 'Traffic Overview' },
  { to: '/servers', icon: Server, label: 'Servers' },
  { to: '/cache', icon: Database, label: 'Edge Cache' },
  { to: '/predictions', icon: BrainCircuit, label: 'Predictions' },
  { to: '/autoscaling', icon: Scaling, label: 'Auto-Scaling' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
];

export default function Sidebar({ connected }) {
  return (
    <aside className="w-64 min-h-screen bg-gray-950 border-r border-gray-800 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="flex items-center gap-3">
          
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">LoadBalancer</h1>
            <p className="text-[11px] text-gray-500 leading-tight">Intelligent Auto-Scaling</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200 border border-transparent'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Connection Status */}
      <div className="px-4 py-4 border-t border-gray-800">
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              <Wifi className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-emerald-400 font-medium">Live — Mock Data</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400 font-medium">Disconnected</span>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
