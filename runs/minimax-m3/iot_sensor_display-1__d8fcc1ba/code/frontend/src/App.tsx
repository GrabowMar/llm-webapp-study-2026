import { Link, Route, Routes } from "react-router-dom";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import SensorPage from "./pages/SensorPage";

function NotFound() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-100">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">The page you were looking for does not exist.</p>
      <Link to="/" className="mt-6 inline-block text-sm text-accent hover:underline">
        Back to the dashboard
      </Link>
    </main>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sensors/:id" element={<SensorPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
