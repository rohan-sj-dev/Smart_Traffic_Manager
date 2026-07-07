import { useRef, useState } from "react";
import { runLoadBatch } from "../services/loadBridge";
import { updateWorkload } from "../services/workloadStore";

export default function ImageProcessing() {
  const [file, setFile] = useState(null);
  const [runs, setRuns] = useState(10);
  const [concurrency, setConcurrency] = useState(2);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ completed: 0, failed: 0, lastLatency: 0, durationMs: 0 });
  const [logs, setLogs] = useState(["[INFO] Waiting for image task..."]);
  const runTokenRef = useRef(0);

  const startImageLoad = async () => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    setRunning(true);
    updateWorkload('image', { running: true, count: runs });
    setStats({ completed: 0, failed: 0, lastLatency: 0, durationMs: 0 });
    setLogs([`[INFO] Sending ${runs} image request(s) through the load balancer...`]);

    const result = await runLoadBatch({
      url: "/image",
      totalRuns: runs,
      concurrency,
      isActive: () => runTokenRef.current === token,
      onProgress: (next) => {
        setStats(prev => ({ ...prev, ...next }));
        if (next.error) setLogs(prev => [`[ERROR] ${next.error}`, ...prev].slice(0, 20));
      },
    });

    if (runTokenRef.current === token) {
      setStats(prev => ({ ...prev, durationMs: result.durationMs, failed: result.failed }));
      setLogs(prev => [`[DONE] Completed ${result.completed}, failed ${result.failed}.`, ...prev].slice(0, 20));
      setRunning(false);
      updateWorkload('image', { running: false });
    }
  };

  const stopImageLoad = () => {
    runTokenRef.current += 1;
    setRunning(false);
    updateWorkload('image', { running: false });
    setLogs(prev => ["[INFO] Stop requested.", ...prev].slice(0, 20));
  };

  return (
    <div className="p-6 text-white max-w-7xl mx-auto">

      <h1 className="text-3xl font-semibold mb-8 tracking-tight">
        Image Processing
      </h1>

      {}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">

        <h2 className="text-lg font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div>
            <label className="text-sm text-gray-400 block mb-2">
                Upload Image
            </label>

            <div className="flex items-center gap-4">

                {}
                <input
                type="file"
                id="fileUpload"
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
                />

                {}
                <label
                htmlFor="fileUpload"
                className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 
                            px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                Choose File
                </label>

                {}
                <span className="text-sm text-gray-400">
                {file ? file.name : "No file chosen"}
                </span>

            </div>
          </div>

          {}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
                Operation
            </label>
            <select className="w-full p-3 rounded-lg bg-[#020617] border border-gray-800 focus:outline-none focus:border-indigo-500">
                <option>Grayscale</option>
                <option>Resize</option>
                <option>Blur</option>
            </select>
          </div>

          {}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
                Runs
            </label>
            <input
                type="number"
                value={runs}
                onChange={(e) => setRuns(e.target.value)}
                placeholder="Runs"
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

        <div className="flex gap-4 mt-6">
          <button onClick={startImageLoad} disabled={running} className="bg-green-500 disabled:opacity-50 px-5 py-2 rounded-lg">Start</button>
          <button onClick={stopImageLoad} className="bg-red-500 px-5 py-2 rounded-lg">Stop</button>
        </div>

      </div>

      {}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">
        {file ? (
          <img src={URL.createObjectURL(file)} className="h-40 rounded" />
        ) : (
          <p className="text-gray-400">No image uploaded</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800">
          <p className="text-gray-400">Last Execution Time</p>
          <h2 className="text-xl font-bold">{Math.round(stats.lastLatency)} ms</h2>
        </div>
        <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800">
          <p className="text-gray-400">Completed Runs</p>
          <h2 className="text-xl font-bold">{stats.completed}/{runs}</h2>
        </div>
      </div>

      {}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800 h-40 overflow-y-auto text-gray-400">
        {logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
      </div>

    </div>
  );
}