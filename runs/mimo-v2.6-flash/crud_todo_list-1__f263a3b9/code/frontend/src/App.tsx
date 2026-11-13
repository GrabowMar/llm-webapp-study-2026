import { useCallback, useState } from "react";
import AuthView from "./AuthView";
import TodosView from "./TodosView";

const TOKEN_KEY = "todo_token";
const USERNAME_KEY = "todo_username";

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY),
  );
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem(USERNAME_KEY),
  );

  const signIn = useCallback((nextToken: string, nextUsername: string) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USERNAME_KEY, nextUsername);
    setToken(nextToken);
    setUsername(nextUsername);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  if (token === null || username === null) {
    return <AuthView onSignIn={signIn} />;
  }
  return <TodosView token={token} username={username} onSignOut={signOut} />;
}
