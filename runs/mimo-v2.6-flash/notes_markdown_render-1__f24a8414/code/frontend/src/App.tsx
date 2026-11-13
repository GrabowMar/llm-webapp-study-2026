import { useCallback, useEffect, useState } from "react";
import { clearSession, getToken, getUsername } from "./api";
import AuthForm from "./components/AuthForm";
import PublicNotePage from "./components/PublicNotePage";
import Workspace from "./components/Workspace";

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [user, setUser] = useState<string | null>(() => getUsername());

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    setPath(window.location.pathname);
  }, []);

  const handleAuthed = useCallback((username: string) => setUser(username), []);
  const handleSignOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const match = /^\/notes\/(\d+)$/.exec(path);
  if (match) {
    const noteId = Number(match[1]);
    return <PublicNotePage noteId={noteId} onHome={() => navigate("/")} />;
  }

  if (!user || !getToken()) {
    return <AuthForm onAuthed={handleAuthed} />;
  }

  return <Workspace user={user} onSignOut={handleSignOut} />;
}
