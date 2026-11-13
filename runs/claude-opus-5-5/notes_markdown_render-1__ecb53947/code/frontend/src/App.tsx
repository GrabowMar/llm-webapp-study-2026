import { useCallback, useEffect, useState } from "react";
import { api, clearSession, getSession, onUnauthorized, saveSession } from "./api";
import AuthForm from "./components/AuthForm";
import NotesApp from "./components/NotesApp";
import PublicNotePage from "./components/PublicNotePage";
import { navigate, usePath } from "./router";

export default function App() {
  const path = usePath();
  const [session, setSession] = useState(getSession);

  const signOut = useCallback((callServer = true) => {
    if (callServer) void api.logout();
    clearSession();
    setSession(null);
    navigate("/login", true);
  }, []);

  useEffect(() => {
    onUnauthorized(() => signOut(false));
    return () => onUnauthorized(null);
  }, [signOut]);

  const publicMatch = path.match(/^\/p\/(\d+)\/?$/);
  const noteMatch = path.match(/^\/notes\/(\d+)\/?$/);
  const isAuthPage = path === "/login" || path === "/register";
  const isPublic = publicMatch !== null;

  useEffect(() => {
    if (isPublic) return;
    document.title = "Markdown Notes";
    if (!session && !isAuthPage) navigate("/login", true);
    else if (session && isAuthPage) navigate("/", true);
  }, [session, isAuthPage, isPublic]);

  if (publicMatch) return <PublicNotePage id={Number(publicMatch[1])} />;

  if (!session) {
    return (
      <AuthForm
        mode={path === "/register" ? "register" : "login"}
        onSignedIn={(token, username) => {
          saveSession(token, username);
          setSession({ token, username });
          navigate("/", true);
        }}
      />
    );
  }

  return (
    <NotesApp
      username={session.username}
      selectedId={noteMatch ? Number(noteMatch[1]) : null}
      onSignOut={() => signOut()}
    />
  );
}
