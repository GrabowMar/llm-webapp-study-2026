import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./auth";
import AuthPage from "./pages/AuthPage";
import ItemDetailPage from "./pages/ItemDetailPage";
import ItemFormPage from "./pages/ItemFormPage";
import ItemListPage from "./pages/ItemListPage";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { username } = useAuth();
  if (!username) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ItemListPage />} />
        <Route path="items/new" element={
          <RequireAuth>
            <ItemFormPage mode="create" />
          </RequireAuth>
        } />
        <Route path="items/:id" element={<ItemDetailPage />} />
        <Route path="items/:id/edit" element={
          <RequireAuth>
            <ItemFormPage mode="edit" />
          </RequireAuth>
        } />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="register" element={<AuthPage mode="register" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
