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

type AuthContextValue = {
  username: string | null;
  isSignedIn: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getStoredUsername() : null,
  );

  const login = useCallback(async (name: string, password: string) => {
    const username = name.trim();
    const { token } = await apiLogin(username, password);
    storeSession(token, username);
    setUsername(username);
  }, []);

  const register = useCallback(async (name: string, password: string) => {
    const username = name.trim();
    await apiRegister(username, password);
    const { token } = await apiLogin(username, password);
    storeSession(token, username);
    setUsername(username);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      username,
      isSignedIn: username !== null,
      login,
      register,
      logout,
    }),
    [username, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
