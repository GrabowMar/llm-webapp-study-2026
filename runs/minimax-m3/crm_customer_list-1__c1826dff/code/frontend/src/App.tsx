import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./auth";
import { Spinner } from "./components/ui";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomerFormPage from "./pages/CustomerFormPage";
import CustomersPage from "./pages/CustomersPage";
import SignInPage from "./pages/SignInPage";

function Protected({ children }: { children: ReactNode }) {
  const { username, ready } = useAuth();
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner label="Starting the directory" />
      </div>
    );
  }
  if (!username) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/" element={<Navigate to="/customers" replace />} />
          <Route
            path="/customers"
            element={
              <Protected>
                <CustomersPage />
              </Protected>
            }
          />
          <Route
            path="/customers/new"
            element={
              <Protected>
                <CustomerFormPage mode="create" />
              </Protected>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <Protected>
                <CustomerDetailPage />
              </Protected>
            }
          />
          <Route
            path="/customers/:id/edit"
            element={
              <Protected>
                <CustomerFormPage mode="edit" />
              </Protected>
            }
          />
          <Route path="*" element={<Navigate to="/customers" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
