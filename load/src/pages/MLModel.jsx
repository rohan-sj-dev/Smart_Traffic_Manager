import { useRef, useState } from "react";
import { runLoadBatch } from "../services/loadBridge";
import { updateWorkload } from "../services/workloadStore";

export default function MLModel() {
  const [model, setModel] = useState("logistic");
  const [dataset, setDataset] = useState("medium");
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [concurrency, setConcurrency] = useState(1);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ completed: 0, failed: 0, lastLatency: 0, durationMs: 0 });
  const [logs, setLogs] = useState(["[INFO] Waiting for training..."]);
  const runTokenRef = useRef(0);

  const startTraining = async () => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;
    setRunning(true);
    updateWorkload('ml', { running: true, count: epochs });
    setStats({ completed: 0, failed: 0, lastLatency: 0, durationMs: 0 });
    setLogs([`[INFO] Sending ${epochs} ML training request(s) through the load balancer...`]);

    const result = await runLoadBatch({
      url: "/api/train",
      totalRuns: epochs,
      concurrency,
      method: "GET",
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
      updateWorkload('ml', { running: false });
    }
  };

  const stopTraining = () => {
    runTokenRef.current += 1;
    setRunning(false);
    updateWorkload('ml', { running: false });
    setLogs(prev => ["[INFO] Stop requested.", ...prev].slice(0, 20));
  };

  return (
    <div className="p-6 text-white">

      <h1 className="text-2xl font-bold mb-6">
        ML Training Workload
      </h1>

      {}
      <div className="bg-[#0f172a] p-6 rounded-xl mb-6">

        <h2 className="text-lg font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {}
          <div>
            <label className="text-sm text-gray-400">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            >
              <option value="logistic">Logistic Regression</option>
              <option value="nn">Neural Network</option>
              <option value="tree">Decision Tree</option>
            </select>
          </div>

          {}
          <div>
            <label className="text-sm text-gray-400">Dataset Size</label>
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>

          {}
          <div>
            <label className="text-sm text-gray-400">Epochs</label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            />
          </div>

          {}
          <div>
            <label className="text-sm text-gray-400">Batch Size</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            />
          </div>

          {}
          <div>
            <label className="text-sm text-gray-400">Concurrency</label>
            <input
              type="number"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            />
          </div>

        </div>

        {}
        <div className="flex gap-4 mt-6">
          <button
            onClick={startTraining}
            className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded"
          >
            Start Training
          </button>

          <button
            onClick={stopTraining}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded"
          >
            Stop
          </button>
        </div>

      </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

        <div className="bg-[#0f172a] p-4 rounded-xl">
          <p className="text-gray-400">Training Time</p>
          <h2 className="text-xl font-bold">{Math.round(stats.durationMs || stats.lastLatency)} ms</h2>
        </div>

        <div className="bg-[#0f172a] p-4 rounded-xl">
          <p className="text-gray-400">Iterations/sec</p>
          <h2 className="text-xl font-bold">{stats.completed}/{epochs}</h2>
        </div>

      </div>

      <div className="bg-[#0f172a] p-4 rounded-xl mb-6">
        <p className="text-gray-400">Status</p>
        <p className={`mt-2 font-medium ${running ? "text-green-400" : "text-red-400"}`}>
          {running ? "Training Load Active" : "Stopped"}
        </p>
      </div>

      {}
      <div className="bg-[#0f172a] p-4 rounded-xl h-40 overflow-y-auto text-sm text-gray-300">
        {logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
      </div>

    </div>
  );
}