import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api";
import Layout from "./Layout";
import AuthPage from "./pages/AuthPage";
import NewSubscriptionPage from "./pages/NewSubscriptionPage";
import PublicPage from "./pages/PublicPage";
import SubscriptionDetailPage from "./pages/SubscriptionDetailPage";
import SubscriptionListPage from "./pages/SubscriptionListPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<PublicPage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route
          path="/subscriptions"
          element={
            <RequireAuth>
              <SubscriptionListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/subscriptions/new"
          element={
            <RequireAuth>
              <NewSubscriptionPage />
            </RequireAuth>
          }
        />
        <Route
          path="/subscriptions/:id"
          element={
            <RequireAuth>
              <SubscriptionDetailPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
