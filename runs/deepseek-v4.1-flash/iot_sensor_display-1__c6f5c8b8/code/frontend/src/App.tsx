import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import SensorPage from "./pages/SensorPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="sensors/:id" element={<SensorPage />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
            <Route
              path="*"
              element={
                <div className="mx-auto max-w-3xl px-4 py-20 text-center">
                  <p className="text-5xl font-black text-slate-300">404</p>
                  <h1 className="mt-4 text-2xl font-semibold text-slate-900">
                    Page not found
                  </h1>
                  <p className="mt-2 text-slate-500">
                    The page you are looking for does not exist.
                  </p>
                </div>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
