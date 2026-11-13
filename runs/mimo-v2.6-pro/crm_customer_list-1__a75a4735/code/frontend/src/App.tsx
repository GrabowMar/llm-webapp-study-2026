import { Route, Routes } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./auth";
import Layout from "./components/Layout";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomerFormPage from "./pages/CustomerFormPage";
import CustomersPage from "./pages/CustomersPage";
import SignInPage from "./pages/SignInPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<SignInPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
          </Route>
        </Route>
        <Route path="*" element={<SignInPage />} />
      </Routes>
    </AuthProvider>
  );
}
