import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearSession,
  getStoredUsername,
  getToken,
  login as apiLogin,
  register as apiRegister,
  storeSession,
} from "./api";

interface AuthContextValue {
  username: string | null;
  token: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() =>
    getStoredUsername(),
  );

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await apiLogin(name, password);
    const displayName = result.username ?? name;
    storeSession(result.token, displayName);
    setToken(result.token);
    setUsername(displayName);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    await apiRegister(name, password);
    const result = await apiLogin(name, password);
    const displayName = result.username ?? name;
    storeSession(result.token, displayName);
    setToken(result.token);
    setUsername(displayName);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setToken(null);
    setUsername(null);
  }, []);

  const value = useMemo(
    () => ({ username, token, signIn, signUp, signOut }),
    [username, token, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
