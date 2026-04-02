import { useState } from "react";

export default function MLModel() {
  const [model, setModel] = useState("logistic");
  const [dataset, setDataset] = useState("medium");
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(32);
  const [concurrency, setConcurrency] = useState(1);
  const [running, setRunning] = useState(false);

  const startTraining = () => {
    setRunning(true);
    console.log("Starting ML training workload...");
  };

  const stopTraining = () => {
    setRunning(false);
  };

  return (
    <div className="p-6 text-white">

      <h1 className="text-2xl font-bold mb-6">
        ML Training Workload
      </h1>

      {/* Configuration */}
      <div className="bg-[#0f172a] p-6 rounded-xl mb-6">

        <h2 className="text-lg font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Model */}
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

          {/* Dataset */}
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

          {/* Epochs */}
          <div>
            <label className="text-sm text-gray-400">Epochs</label>
            <input
              type="number"
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            />
          </div>

          {/* Batch Size */}
          <div>
            <label className="text-sm text-gray-400">Batch Size</label>
            <input
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              className="w-full mt-1 p-2 rounded bg-[#020617]"
            />
          </div>

          {/* Concurrency */}
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

        {/* Buttons */}
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

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

        <div className="bg-[#0f172a] p-4 rounded-xl">
          <p className="text-gray-400">Training Time</p>
          <h2 className="text-xl font-bold">-- ms</h2>
        </div>

        <div className="bg-[#0f172a] p-4 rounded-xl">
          <p className="text-gray-400">Iterations/sec</p>
          <h2 className="text-xl font-bold">--</h2>
        </div>

      </div>

      {/* Status */}
      <div className="bg-[#0f172a] p-4 rounded-xl mb-6">
        <p className="text-gray-400">Status</p>
        <p className={`mt-2 font-medium ${running ? "text-green-400" : "text-red-400"}`}>
          {running ? "Running" : "Stopped"}
        </p>
      </div>

      {/* Logs */}
      <div className="bg-[#0f172a] p-4 rounded-xl h-40 overflow-y-auto text-sm text-gray-300">
        <p>[INFO] Waiting for training...</p>
      </div>

    </div>
  );
}