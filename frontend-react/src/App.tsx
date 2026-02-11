import { Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { PPEServicePage } from "./pages/PPEServicePage";
import { DriverServicePage } from "./pages/DriverServicePage";
import { JobStatusPage } from "./pages/JobStatusPage";
import { JobResultPage } from "./pages/JobResultPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { PPEUploadPage } from "./pages/PPEUploadPage";
import { SafeDrivingPage } from "./pages/SafeDrivingPage";
import { ErgonomicsPage } from "./pages/ErgonomicsPage";
import { VehicleControlPage } from "./pages/VehicleControlPage";
import { SecurityDashboard } from "./pages/SecurityDashboard";
import { HoneytokensPage } from "./pages/HoneytokensPage";
import { AttackGraphPage } from "./pages/AttackGraphPage";
import { LlmGatewayPage } from "./pages/LlmGatewayPage";

function App() {
  return (
    <Routes>
      {/* Landing Page - No Layout wrapper */}
      <Route path="/" element={<LandingPage />} />

      {/* PPE Service Pages */}
      <Route path="/services/ppe" element={<PPEServicePage />} />
      <Route path="/services/ppe/upload" element={<PPEUploadPage />} />
      <Route path="/services/ppe/ergonomics" element={<ErgonomicsPage />} />
      <Route path="/services/ppe/vehicle-control" element={<VehicleControlPage />} />
      <Route path="/services/ppe/history" element={<AdminDashboard />} />

      {/* Driver Service Pages */}
      <Route path="/services/driver" element={<DriverServicePage />} />
      <Route path="/services/driver/safe-driving" element={<SafeDrivingPage />} />

      {/* Security Module */}
      <Route path="/services/security" element={<SecurityDashboard />} />
      <Route path="/services/security/honeytokens" element={<HoneytokensPage />} />
      <Route path="/services/security/attack-graph" element={<AttackGraphPage />} />
      <Route path="/services/security/llm-gateway" element={<LlmGatewayPage />} />

      {/* Job Routes - Nested under services */}
      <Route path="/jobs/:jobId" element={<JobStatusPage />} />
      <Route path="/jobs/:jobId/result" element={<JobResultPage />} />

      {/* Admin */}
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}

export default App;

