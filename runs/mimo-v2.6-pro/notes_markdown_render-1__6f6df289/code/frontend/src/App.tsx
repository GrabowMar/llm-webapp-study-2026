import { useState } from "react";
import { clearSession, getStoredUsername, getToken } from "./api";
import AuthPage from "./components/AuthPage";
import NotesApp from "./components/NotesApp";
import PublicNote from "./components/PublicNote";

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [username, setUsername] = useState<string | null>(() => getStoredUsername());

  const publicMatch = window.location.pathname.match(/^\/p\/(\d+)$/);
  if (publicMatch) {
    return <PublicNote noteId={Number(publicMatch[1])} />;
  }

  function signOut() {
    clearSession();
    setToken(null);
    setUsername(null);
  }

  if (!token || !username) {
    return (
      <AuthPage
        onSignedIn={(newToken, newUsername) => {
          setToken(newToken);
          setUsername(newUsername);
        }}
      />
    );
  }

  return <NotesApp username={username} onSignOut={signOut} />;
}
