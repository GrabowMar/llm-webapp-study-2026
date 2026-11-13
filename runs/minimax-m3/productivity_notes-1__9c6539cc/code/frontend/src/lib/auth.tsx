import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  ApiError,
  clearSession,
  getStoredUsername,
  getToken,
  login as loginRequest,
  register as registerRequest,
  storeSession,
} from "../lib/api";

type AuthContextValue = {
  username: string | null;
  isSignedIn: boolean;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    setUsername(getStoredUsername());
    setReady(true);
  }, []);

  const signIn = useCallback(async (name: string, password: string) => {
    const result = await loginRequest({ username: name, password });
    storeSession(result.token, result.user?.username ?? name);
    setUsername(result.user?.username ?? name);
  }, []);

  const signUp = useCallback(async (name: string, password: string) => {
    const result = await registerRequest({ username: name, password });
    storeSession(result.token, result.user?.username ?? name);
    setUsername(result.user?.username ?? name);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      username,
      isSignedIn: username !== null,
      ready,
      signIn,
      signUp,
      signOut,
    }),
    [username, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

export { ApiError };
