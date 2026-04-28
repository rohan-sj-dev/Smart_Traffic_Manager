import { useState, useEffect } from "react";
import { useSimulator } from "../hooks/useSimulator";

export default function ImageProcessing() {
  const [file, setFile] = useState(null);
  const [runs, setRuns] = useState(10);
  const [running, setRunning] = useState(false);
  const { connected, simulateLoad } = useSimulator();

  useEffect(() => {
    let interval;
    if (running && connected) {
      interval = setInterval(() => {
        const count = Math.min(1000, parseInt(runs, 10) || 1);
        simulateLoad("/image", count, "POST");
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [running, connected, runs, simulateLoad]);

  return (
    <div className="p-6 text-white max-w-7xl mx-auto">

      <h1 className="text-3xl font-semibold mb-8 tracking-tight">
        Image Processing
      </h1>

      {/* Config */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">

        <h2 className="text-lg font-semibold mb-4">Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

          <div>
            <label className="text-sm text-gray-400 block mb-2">
                Upload Image
            </label>

            <div className="flex items-center gap-4">

                {/* Hidden Input */}
                <input
                type="file"
                id="fileUpload"
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
                />

                {/* Custom Button */}
                <label
                htmlFor="fileUpload"
                className="cursor-pointer bg-indigo-600 hover:bg-indigo-700 
                            px-4 py-2 rounded-lg text-sm font-medium transition"
                >
                Choose File
                </label>

                {/* File Name */}
                <span className="text-sm text-gray-400">
                {file ? file.name : "No file chosen"}
                </span>

            </div>
          </div>

          {/* Operation */}
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

          {/* Runs */}
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

        </div>

        <div className="flex gap-4 mt-6">
          <button onClick={() => setRunning(true)} className="bg-green-500 px-5 py-2 rounded-lg">Start</button>
          <button onClick={() => setRunning(false)} className="bg-red-500 px-5 py-2 rounded-lg">Stop</button>
        </div>

      </div>

      {/* Preview */}
      <div className="bg-[#0f172a] p-6 rounded-2xl border border-gray-800 mb-10">
        {file ? (
          <img src={URL.createObjectURL(file)} className="h-40 rounded" />
        ) : (
          <p className="text-gray-400">No image uploaded</p>
        )}
      </div>

      {/* Status */}
      <div className="bg-[#0f172a] p-5 rounded-2xl border border-gray-800 h-24 text-gray-400">
        <p>Status: <span className={`font-medium ${!connected ? "text-amber-400" : running ? "text-green-400" : "text-red-400"}`}>
          {!connected ? "Connecting to Engine..." : running ? "Image Workload Active" : "Stopped"}
        </span></p>
      </div>

    </div>
  );
}