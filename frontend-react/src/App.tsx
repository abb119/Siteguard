import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { UploadJobPage } from "./pages/UploadJobPage";
import { JobStatusPage } from "./pages/JobStatusPage";
import { JobResultPage } from "./pages/JobResultPage";
import { LabModePage } from "./pages/LabModePage";
import { DriverDemoPage } from "./pages/DriverDemoPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<UploadJobPage />} />
        <Route path="/driver" element={<DriverDemoPage />} />
        <Route path="/jobs/:jobId" element={<JobStatusPage />} />
        <Route path="/jobs/:jobId/result" element={<JobResultPage />} />
        <Route path="/lab" element={<LabModePage />} />
      </Routes>
    </Layout>
  );
}

export default App;
