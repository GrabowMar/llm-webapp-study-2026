import { useEffect, useState } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { clearSession, getToken, getUser, setUnauthorizedHandler } from "./api";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerForm from "./pages/CustomerForm";
import CustomerList from "./pages/CustomerList";
import Login from "./pages/Login";
import { secondaryButton } from "./ui";

export default function App() {
  const [signedIn, setSignedIn] = useState(() => getToken() !== null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setSignedIn(false);
    });
  }, []);

  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-100">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link to="/" className="text-lg font-semibold text-slate-900">
              Customer directory
            </Link>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <span>{getUser()}</span>
              <button
                className={secondaryButton}
                onClick={() => {
                  clearSession();
                  setSignedIn(false);
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">
          <Routes>
            <Route path="/" element={<CustomerList />} />
            <Route path="/customers/new" element={<CustomerForm />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/customers/:id/edit" element={<CustomerForm />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
