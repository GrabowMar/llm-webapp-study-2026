import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import Layout from "./components/Layout";
import { useAuth } from "./auth";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import RecipeFormPage from "./pages/RecipeFormPage";

function RequireAuth({ children }: { children: ReactNode }) {
  const { username, ready } = useAuth();
  const location = useLocation();
  if (!ready) return null;
  if (!username) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname }} />
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { username, ready } = useAuth();

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="login"
          element={
            ready && username ? <Navigate to="/" replace /> : <AuthPage mode="login" />
          }
        />
        <Route
          path="register"
          element={
            ready && username ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage mode="register" />
            )
          }
        />
        <Route path="recipes/:id" element={<RecipeDetailPage />} />
        <Route
          path="recipes/new"
          element={
            <RequireAuth>
              <RecipeFormPage mode="create" />
            </RequireAuth>
          }
        />
        <Route
          path="recipes/:id/edit"
          element={
            <RequireAuth>
              <RecipeFormPage mode="edit" />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
