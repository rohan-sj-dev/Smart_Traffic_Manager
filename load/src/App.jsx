import { BrowserRouter, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";

import SystemOverview from "./pages/SystemOverview";
import MLModel from "./pages/MLModel";
import MatrixPage from "./pages/MatrixPage";
import ImageProcessing from "./pages/ImageProcessing";

function MainContent() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <main className="flex-1 bg-[#020617] min-h-screen text-white overflow-y-auto">
      <div style={{ display: path === "/" ? "block" : "none" }}>
        <SystemOverview />
      </div>
      <div style={{ display: path === "/ml" ? "block" : "none" }}>
        <MLModel />
      </div>
      <div style={{ display: path === "/matrix" ? "block" : "none" }}>
        <MatrixPage />
      </div>
      <div style={{ display: path === "/image" ? "block" : "none" }}>
        <ImageProcessing />
      </div>
    </main>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div className="flex">
        <Sidebar connected={true} />
        <MainContent />
      </div>
    </BrowserRouter>
  );
}

export default App;