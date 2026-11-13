import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import Header from "./components/Header";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import SensorPage from "./pages/SensorPage";

export default function App() {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/sensors/:id" element={<SensorPage />} />
          </Routes>
        </main>
        <footer className="border-t border-slate-200 py-3 text-center text-xs text-slate-400">
          Sensor Dashboard
        </footer>
      </div>
    </AuthProvider>
  );
}
