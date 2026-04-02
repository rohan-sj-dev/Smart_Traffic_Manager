import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import SystemOverview from "./pages/SystemOverview";
import MLModel from "./pages/MLModel";
import MatrixPage from "./pages/MatrixPage";
import ImageProcessing from "./pages/ImageProcessing";

function App() {
  return (
    <BrowserRouter>
      <div className="flex">
        <Sidebar connected={true} />

        <main className="flex-1 bg-[#020617] min-h-screen text-white">
          <Routes>
            <Route path="/" element={<SystemOverview />} />
            <Route path="/ml" element={<MLModel />} />
            <Route path="/matrix" element={<MatrixPage />} />
            <Route path="/image" element={<ImageProcessing />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;