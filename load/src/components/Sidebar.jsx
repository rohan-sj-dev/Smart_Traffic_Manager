import { NavLink } from "react-router-dom";
import {
  Activity,
  BrainCircuit,
  LayoutGrid,
  ImageIcon,
  Wifi,
  WifiOff,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: Activity, label: "System Overview" },
  { to: "/ml", icon: BrainCircuit, label: "ML Model" },
  { to: "/matrix", icon: LayoutGrid, label: "Matrix Multiplication" },
  { to: "/image", icon: ImageIcon, label: "Image Processing" },
];

export default function Sidebar({ connected }) {
  return (
    <aside className="w-64 min-h-screen bg-gray-950 border-r border-gray-800 flex flex-col">
      
      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-800">
        <h1 className="text-sm font-bold text-white">Load Lab</h1>
        <p className="text-[11px] text-gray-500">Workload Simulator</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive
                  ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30"
                  : "text-gray-400 hover:bg-gray-800/60 hover:text-gray-200"
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Status */}
      <div className="px-4 py-4 border-t border-gray-800">
        {connected ? (
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <Wifi className="w-4 h-4" />
            Live — Mock Data
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <WifiOff className="w-4 h-4" />
            Disconnected
          </div>
        )}
      </div>
    </aside>
  );
}