import type { ReactNode } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import LoginPage from "./pages/LoginPage";
import NewSubscriptionPage from "./pages/NewSubscriptionPage";
import PublicPage from "./pages/PublicPage";
import RegisterPage from "./pages/RegisterPage";
import SubscriptionDetailPage from "./pages/SubscriptionDetailPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import { Layout } from "./ui";

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<PublicPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route
              path="subscriptions"
              element={
                <RequireAuth>
                  <SubscriptionsPage />
                </RequireAuth>
              }
            />
            <Route
              path="subscriptions/new"
              element={
                <RequireAuth>
                  <NewSubscriptionPage />
                </RequireAuth>
              }
            />
            <Route
              path="subscriptions/:id"
              element={
                <RequireAuth>
                  <SubscriptionDetailPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
