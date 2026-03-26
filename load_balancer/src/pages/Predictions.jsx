import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { BrainCircuit, TrendingUp, TrendingDown, Minus, AlertTriangle, Gauge, Target } from 'lucide-react';
import MetricCard from '../components/MetricCard';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function TrendIcon({ trend }) {
  if (trend === 'rising') return <TrendingUp className="w-4 h-4 text-red-400" />;
  if (trend === 'falling') return <TrendingDown className="w-4 h-4 text-emerald-400" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

export default function Predictions({ predictions, trafficHistory }) {
  const chartData = trafficHistory.map(p => ({
    time: formatTime(p.time),
    actual: p.actual,
    predicted: p.predicted,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Predictive Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">EMA + Threshold Heuristics — anticipate traffic before it arrives</p>
      </div>

      {/* Prediction Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Current Load" value={predictions.currentLoad} unit="%" color="indigo" />
        <MetricCard label="Predicted Load" value={predictions.predictedLoad} unit="%" color="cyan" />
        <MetricCard label="Confidence" value={predictions.confidence} unit="%" color="emerald" />
        <MetricCard label="Rate of Change" value={predictions.rateOfChange} color={predictions.rateOfChange > 0.3 ? 'red' : 'amber'} />
      </div>

      {/* Status Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
          <TrendIcon trend={predictions.trend} />
          <div>
            <p className="text-xs text-gray-500">Trend</p>
            <p className="text-sm font-semibold text-white capitalize">{predictions.trend}</p>
          </div>
        </div>
        <div className={`bg-gray-900/70 border rounded-xl p-4 flex items-center gap-4 ${
          predictions.spikeDetected ? 'border-red-500/50 bg-red-500/5' : 'border-gray-800'
        }`}>
          <AlertTriangle className={`w-5 h-5 ${predictions.spikeDetected ? 'text-red-400' : 'text-gray-600'}`} />
          <div>
            <p className="text-xs text-gray-500">Spike Detection</p>
            <p className={`text-sm font-semibold ${predictions.spikeDetected ? 'text-red-400' : 'text-gray-400'}`}>
              {predictions.spikeDetected ? 'SPIKE DETECTED' : 'Normal'}
            </p>
          </div>
        </div>
        <div className={`bg-gray-900/70 border rounded-xl p-4 flex items-center gap-4 ${
          predictions.recommendedAction === 'scale_up' ? 'border-amber-500/50 bg-amber-500/5' :
          predictions.recommendedAction === 'scale_down' ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-gray-800'
        }`}>
          <Target className={`w-5 h-5 ${
            predictions.recommendedAction === 'scale_up' ? 'text-amber-400' :
            predictions.recommendedAction === 'scale_down' ? 'text-cyan-400' : 'text-gray-600'
          }`} />
          <div>
            <p className="text-xs text-gray-500">Recommended Action</p>
            <p className="text-sm font-semibold text-white capitalize">{predictions.recommendedAction.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Actual vs Predicted Chart */}
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Actual vs Predicted Traffic</h2>
            <p className="text-xs text-gray-500 mt-0.5">Real-time comparison — lower deviation = better predictions</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500 rounded" />
              <span className="text-gray-400">Actual</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-500 rounded" />
              <span className="text-gray-400">Predicted</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#374151' }} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px', color: '#f9fafb' }}
            />
            <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="predicted" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* EMA Algorithm Info */}
      
    </div>
  );
}
