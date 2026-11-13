import { useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Admin from "./Admin";
import type { AuthState } from "./api";
import { getAuth, setAuth } from "./api";
import AuthForm from "./AuthForm";
import Dashboard from "./Dashboard";
import Layout from "./Layout";

export default function App() {
  const [auth, setAuthState] = useState<AuthState | null>(() => getAuth());
  const navigate = useNavigate();

  function handleAuth(a: AuthState) {
    setAuth(a);
    setAuthState(a);
    navigate("/");
  }

  return (
    <Layout auth={auth} setAuth={setAuthState}>
      <Routes>
        <Route
          path="/"
          element={auth ? <Dashboard auth={auth} /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/login"
          element={
            auth ? (
              <Navigate to="/" replace />
            ) : (
              <AuthForm mode="login" setAuth={handleAuth} />
            )
          }
        />
        <Route
          path="/register"
          element={
            auth ? (
              <Navigate to="/" replace />
            ) : (
              <AuthForm mode="register" setAuth={handleAuth} />
            )
          }
        />
        <Route
          path="/admin"
          element={
            auth?.username === "admin" ? (
              <Admin auth={auth} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
      </Routes>
    </Layout>
  );
}
