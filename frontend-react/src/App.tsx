import { Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { PPEServicePage } from "./pages/PPEServicePage";
import { DriverServicePage } from "./pages/DriverServicePage";
import { JobStatusPage } from "./pages/JobStatusPage";
import { JobResultPage } from "./pages/JobResultPage";

function App() {
  return (
    <Routes>
      {/* Landing Page - No Layout wrapper */}
      <Route path="/" element={<LandingPage />} />

      {/* Service Pages */}
      <Route path="/services/ppe" element={<PPEServicePage />} />
      <Route path="/services/driver" element={<DriverServicePage />} />

      {/* Job Routes - Nested under services */}
      <Route path="/jobs/:jobId" element={<JobStatusPage />} />
      <Route path="/jobs/:jobId/result" element={<JobResultPage />} />
    </Routes>
  );
}

export default App;
