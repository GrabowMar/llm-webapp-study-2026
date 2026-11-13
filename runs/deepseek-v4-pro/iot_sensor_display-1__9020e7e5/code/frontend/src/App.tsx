import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AuthForms } from "./AuthForms";
import { Dashboard } from "./Dashboard";
import { SensorPage } from "./SensorPage";

function Root() {
  const { token } = useAuth();
  return token ? <Dashboard /> : <AuthForms />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/sensors/:id" element={<SensorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
