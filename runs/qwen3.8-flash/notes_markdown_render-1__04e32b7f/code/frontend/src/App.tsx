import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import PublicNotePage from "./components/PublicNotePage";

function Protected() {
  const { username, ready } = useAuth();
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  return username ? <Dashboard /> : <Navigate to="/login" replace />;
}

function LoginView() {
  const { username } = useAuth();
  return username ? <Navigate to="/" replace /> : <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Protected />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/public/:id" element={<PublicNotePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
