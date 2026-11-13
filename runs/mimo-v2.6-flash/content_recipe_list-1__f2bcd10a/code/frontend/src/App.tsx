import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  apiRequest,
  clearSession,
  loadToken,
  loadUsername,
  saveSession,
} from "./api";
import { AuthContext } from "./auth";
import { useRoute } from "./router";
import Header from "./components/Header";
import AuthPage from "./pages/AuthPage";
import BrowsePage from "./pages/BrowsePage";
import RecipeFormPage from "./pages/RecipeFormPage";
import RecipePage from "./pages/RecipePage";

export default function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [username, setUsername] = useState<string | null>(() => loadUsername());
  const route = useRoute();

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    apiRequest<{ username: string }>("/api/auth/me", { token })
      .then((data) => {
        if (!cancelled) {
          setUsername(data.username);
          saveSession(token, data.username);
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearSession();
          setToken(null);
          setUsername(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback((nextToken: string, nextUsername: string) => {
    saveSession(nextToken, nextUsername);
    setToken(nextToken);
    setUsername(nextUsername);
  }, []);

  const signOut = useCallback(() => {
    if (token) {
      void apiRequest("/api/auth/logout", { method: "POST", token }).catch(
        () => {},
      );
    }
    clearSession();
    setToken(null);
    setUsername(null);
  }, [token]);

  let page: ReactNode;
  switch (route.name) {
    case "recipe":
      page = <RecipePage id={route.id} />;
      break;
    case "add":
      page = token ? (
        <RecipeFormPage />
      ) : (
        <AuthPage mode="login" redirectTo="/add" />
      );
      break;
    case "edit":
      page = token ? (
        <RecipeFormPage id={route.id} />
      ) : (
        <AuthPage mode="login" redirectTo={`/edit/${route.id}`} />
      );
      break;
    case "login":
      page = <AuthPage mode="login" />;
      break;
    case "register":
      page = <AuthPage mode="register" />;
      break;
    default:
      page = <BrowsePage />;
  }

  return (
    <AuthContext.Provider value={{ token, username, signIn, signOut }}>
      <div className="min-h-screen bg-slate-50 text-slate-800">
        <Header />
        <main className="mx-auto w-full max-w-5xl px-4 py-8">{page}</main>
        <footer className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-slate-400">
          Recipe Book
        </footer>
      </div>
    </AuthContext.Provider>
  );
}
