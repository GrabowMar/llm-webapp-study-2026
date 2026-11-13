import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api, type User } from "./api";
import { AuthScreen } from "./AuthScreen";
import { Layout } from "./Layout";
import { Customers } from "./Customers";
import { CustomerDetail } from "./CustomerDetail";
import { Spinner } from "./ui";

const AuthContext = createContext<{ user: User | null; signIn: (token: string) => Promise<void>; signOut: () => Promise<void> }>({ user: null, signIn: async () => {}, signOut: async () => {} });
export function useAuth() { return useContext(AuthContext); }

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const expire = () => { localStorage.removeItem("commonplace-token"); setUser(null); };
    window.addEventListener("commonplace-session-expired", expire);
    if (localStorage.getItem("commonplace-token")) {
      api<User>("/auth/me").then(setUser).catch(expire).finally(() => setLoading(false));
    } else setLoading(false);
    return () => window.removeEventListener("commonplace-session-expired", expire);
  }, []);
  async function signIn(token: string) {
    localStorage.setItem("commonplace-token", token);
    setUser(await api<User>("/auth/me"));
  }
  async function signOut() {
    try { await api("/auth/logout", { method: "POST" }); }
    finally { localStorage.removeItem("commonplace-token"); setUser(null); }
  }
  if (loading) return <div className="flex min-h-dvh items-center justify-center bg-[#f8faf9]"><Spinner label="Opening your workspace…" /></div>;
  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

function AppRoutes() {
  const { user } = useAuth();
  return <Routes>
    <Route path="/login" element={user ? <Navigate to="/customers" replace /> : <AuthScreen />} />
    <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
      <Route path="/customers" element={<Customers />} />
      <Route path="/customers/:id" element={<CustomerDetail />} />
    </Route>
    <Route path="*" element={<Navigate to={user ? "/customers" : "/login"} replace />} />
  </Routes>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>;
}
