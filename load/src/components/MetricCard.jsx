export default function MetricCard({ title, value, unit }) {
  return (
    <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800 
                    hover:border-indigo-500/40 transition-all duration-200
                    shadow-lg hover:shadow-indigo-500/10">

      <p className="text-gray-400 text-sm mb-1">{title}</p>

      <h2 className="text-2xl font-bold tracking-tight">
        {value}
        {unit && (
          <span className="text-sm text-gray-400 ml-1">{unit}</span>
        )}
      </h2>

    </div>
  );
}