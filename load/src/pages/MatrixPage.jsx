import { useState } from "react";

export default function MatrixPage() {
  const [size, setSize] = useState(500);
  const [runs, setRuns] = useState(10);
  const [concurrency, setConcurrency] = useState(2);
  const [running, setRunning] = useState(false);

  return (
    <div className="p-6 text-white max-w-7xl mx-auto">

      {/* Title */}
      <h1 className="text-3xl font-semibold mb-8 tracking-tight">
        Matrix Multiplication
      </h1>

      {/* Config */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">

        <h2 className="text-lg font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div>
            <label className="block text-sm text-gray-400 mb-2">
                Matrix Size
            </label>
            <input
                type="number"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="Matrix Size"
                className="w-full p-3 rounded-lg bg-[#020617] border border-gray-800 focus:outline-none focus:border-indigo-500"
            />
          </div>


          <div>
            <label className="block text-sm text-gray-400 mb-2">
                Concurrency
            </label>
            <input
                type="number"
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                placeholder="Concurrency"
                className="w-full p-3 rounded-lg bg-[#020617] border border-gray-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">
                Concurrency
            </label>
            <input
                type="number"
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                placeholder="Concurrency"
                className="w-full p-3 rounded-lg bg-[#020617] border border-gray-800 focus:outline-none focus:border-indigo-500"
            />
          </div>


        </div>

        {/* Buttons */}
        <div className="flex gap-4 mt-6">
          <button className="bg-green-500 hover:bg-green-600 px-5 py-2 rounded-lg">
            Start
          </button>

          <button className="bg-red-500 hover:bg-red-600 px-5 py-2 rounded-lg">
            Stop
          </button>
        </div>

      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">

        <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800">
          <p className="text-gray-400">Last Execution Time</p>
          <h2 className="text-xl font-bold">-- ms</h2>
        </div>

        <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800">
          <p className="text-gray-400">Average Time</p>
          <h2 className="text-xl font-bold">-- ms</h2>
        </div>

      </div>

      {/* Logs */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800 h-40 text-gray-400">
        [INFO] Waiting for matrix task...
      </div>

    </div>
  );
}