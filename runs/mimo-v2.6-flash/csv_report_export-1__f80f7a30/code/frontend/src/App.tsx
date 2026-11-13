import { useCallback, useState } from "react";
import AuthForm from "./components/AuthForm";
import Timesheet from "./components/Timesheet";
import { clearSession, getToken, getUsername, setSession } from "./api";

export default function App() {
  const [username, setUsername] = useState<string | null>(() =>
    getToken() ? getUsername() : null,
  );

  const handleAuthenticated = useCallback((token: string, name: string) => {
    setSession(token, name);
    setUsername(name);
  }, []);

  const handleSignOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  if (!username) {
    return <AuthForm onAuthenticated={handleAuthenticated} />;
  }

  return <Timesheet key={username} username={username} onSignOut={handleSignOut} />;
}
