import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Shell, { WorkspaceRedirect } from "./components/Shell";
import { ErrorBox, Loading } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import CreateRequest from "./pages/CreateRequest";
import RequestDetail from "./pages/RequestDetail";
import Settings from "./pages/Settings";

function Protected() {
  return useAuth().user ? <Outlet /> : <Navigate to="/login" replace />;
}
export default function App() {
  const { loading, error } = useAuth();
  if (loading) return <Loading />;
  if (error)
    return (
      <div className="standalone">
        <ErrorBox message={error} />
      </div>
    );
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/" element={<WorkspaceRedirect />} />
        <Route path="/org/:organizationId" element={<Shell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="requests" element={<Requests />} />
          <Route path="requests/new" element={<CreateRequest />} />
          <Route path="requests/:requestId" element={<RequestDetail />} />
          <Route path="approvals" element={<Requests key="inbox" inbox />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
