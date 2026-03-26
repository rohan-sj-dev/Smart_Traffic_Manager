import { Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TrafficOverview from './pages/TrafficOverview';
import Servers from './pages/Servers';
import Cache from './pages/Cache';
import Predictions from './pages/Predictions';
import AutoScaling from './pages/AutoScaling';
import Logs from './pages/Logs';
import { useLiveData } from './hooks/useLiveData';

export default function App() {
  const data = useLiveData(1000);

  return (
    <div className="flex min-h-screen bg-gray-950 text-gray-100">
      <Sidebar connected={data.connected} />
      <main className="flex-1 p-6 overflow-auto">
        <Routes>
          <Route path="/" element={<TrafficOverview metrics={data.metrics} trafficHistory={data.trafficHistory} />} />
          <Route path="/servers" element={<Servers servers={data.servers} />} />
          <Route path="/cache" element={<Cache cacheStats={data.cacheStats} />} />
          <Route path="/predictions" element={<Predictions predictions={data.predictions} trafficHistory={data.trafficHistory} />} />
          <Route path="/autoscaling" element={<AutoScaling scalingEvents={data.scalingEvents} scalingConfig={data.scalingConfig} onRefresh={data.refreshScalingEvents} />} />
          <Route path="/logs" element={<Logs logs={data.logs} onRefresh={data.refreshLogs} />} />
        </Routes>
      </main>
    </div>
  );
}
