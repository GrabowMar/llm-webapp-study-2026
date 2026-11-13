import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  clearSession,
  getUsername,
  login as apiLogin,
  register as apiRegister,
} from "./api";

type AuthContextValue = {
  username: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => getUsername());

  const signIn = useCallback(async (u: string, p: string) => {
    await apiLogin(u, p);
    setUsername(u);
  }, []);

  const signUp = useCallback(async (u: string, p: string) => {
    await apiRegister(u, p);
    await apiLogin(u, p);
    setUsername(u);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ username, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Book Library` : "Book Library";
  }, [title]);
}
