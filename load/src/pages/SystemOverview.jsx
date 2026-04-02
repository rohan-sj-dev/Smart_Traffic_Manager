import MetricCard from "../components/MetricCard";

export default function SystemOverview() {
  return (
    <div className="p-6 text-white max-w-7xl mx-auto">

      {/* Title */}
      <h1 className="text-3xl font-semibold mb-8 tracking-tight 
                     bg-gradient-to-r from-white to-gray-400 
                     bg-clip-text text-transparent">
        System Overview
      </h1>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-10">
        <MetricCard title="CPU Usage" value="52" unit="%" />
        <MetricCard title="Memory Usage" value="1.4" unit="GB" />
        <MetricCard title="Active Tasks" value="8" />
        <MetricCard title="Throughput" value="135" unit="tasks/s" />
      </div>

      {/* Graph */}
      <div className="bg-[#0f172a] rounded-2xl p-6 h-72 
                      border border-gray-800 
                      flex flex-col justify-center items-center 
                      text-gray-500 mb-10">
        CPU / Load Graph (coming next)
      </div>

      {/* Active Workloads */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">

        <h2 className="text-lg font-semibold mb-4">
          Active Workloads
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          {/* Matrix */}
          <div className="bg-[#020617] p-5 rounded-xl border border-gray-800 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-gray-400">Matrix</p>
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            </div>
            <h2 className="text-xl font-bold mt-2">5 running</h2>
          </div>

          {/* Image */}
          <div className="bg-[#020617] p-5 rounded-xl border border-gray-800 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-gray-400">Image</p>
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            </div>
            <h2 className="text-xl font-bold mt-2">2 running</h2>
          </div>

          {/* ML */}
          <div className="bg-[#020617] p-5 rounded-xl border border-gray-800 hover:border-indigo-500/30 transition">
            <div className="flex items-center justify-between">
              <p className="text-gray-400">ML Training</p>
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
            </div>
            <h2 className="text-xl font-bold mt-2">1 running</h2>
          </div>

        </div>
      </div>

      {/* Execution Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

        <MetricCard title="Total Tasks" value="12,480" />
        <MetricCard title="Avg Execution Time" value="210" unit="ms" />
        <MetricCard title="Peak Load" value="78" unit="%" />

      </div>

    </div>
  );
}