import { Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { PPEServicePage } from "./pages/PPEServicePage";
import { DriverServicePage } from "./pages/DriverServicePage";
import { DriverAlertsPage } from "./pages/DriverAlertsPage";
import { DriverSettingsPage } from "./pages/DriverSettingsPage";
import { FleetMapPage } from "./pages/FleetMapPage";
import { JobStatusPage } from "./pages/JobStatusPage";
import { JobResultPage } from "./pages/JobResultPage";
import { AdminDashboard } from "./pages/AdminDashboard";
import { PPEUploadPage } from "./pages/PPEUploadPage";
import { SafeDrivingPage } from "./pages/SafeDrivingPage";
import { ErgonomicsPage } from "./pages/ErgonomicsPage";
import { VehicleControlPage } from "./pages/VehicleControlPage";
import { LoginPage } from "./pages/LoginPage";
import { AdminPanelPage } from "./pages/AdminPanelPage";
import { CompanyPanelPage } from "./pages/CompanyPanelPage";
import { RequireAuth } from "./auth/AuthContext";

function App() {
  return (
    <Routes>
      {/* Landing Page - No Layout wrapper */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* PPE Service Pages (live demos public; history protected) */}
      <Route path="/services/ppe" element={<PPEServicePage />} />
      <Route path="/services/ppe/upload" element={<PPEUploadPage />} />
      <Route path="/services/ppe/ergonomics" element={<ErgonomicsPage />} />
      <Route path="/services/ppe/vehicle-control" element={<VehicleControlPage />} />
      <Route path="/services/ppe/history" element={
        <RequireAuth roles={["admin", "company"]}><AdminDashboard /></RequireAuth>
      } />

      {/* Driver Service Pages (live demos public; data views protected) */}
      <Route path="/services/driver" element={<DriverServicePage />} />
      <Route path="/services/driver/safe-driving" element={<SafeDrivingPage />} />
      <Route path="/services/driver/alerts" element={
        <RequireAuth><DriverAlertsPage /></RequireAuth>
      } />
      <Route path="/services/driver/settings" element={<DriverSettingsPage />} />
      <Route path="/services/driver/fleet" element={
        <RequireAuth roles={["admin", "company"]}><FleetMapPage /></RequireAuth>
      } />

      {/* Job Routes - Nested under services */}
      <Route path="/jobs/:jobId" element={<JobStatusPage />} />
      <Route path="/jobs/:jobId/result" element={<JobResultPage />} />

      {/* Role panels */}
      <Route path="/admin" element={
        <RequireAuth roles={["admin"]}><AdminPanelPage /></RequireAuth>
      } />
      <Route path="/company" element={
        <RequireAuth roles={["company", "admin"]}><CompanyPanelPage /></RequireAuth>
      } />
    </Routes>
  );
}

export default App;
