import { useState } from "react";
import Auth from "./Auth";
import { clearSession, getToken, getUsername } from "./api";
import Inbox from "./Inbox";

export default function App() {
  const [username, setUsername] = useState<string | null>(() => {
    if (getToken()) return getUsername();
    return null;
  });
  const [unread, setUnread] = useState(0);

  if (!username) {
    return <Auth onAuthed={(u) => setUsername(u)} />;
  }

  const isAdmin = username === "admin";

  function handleSignOut() {
    clearSession();
    setUsername(null);
    setUnread(0);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold text-gray-900">
            Notifications
          </span>
          <div className="relative">
            <span className="text-2xl" aria-hidden>
              🔔
            </span>
            {unread > 0 && (
              <span className="absolute -right-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </nav>
      <Inbox
        isAdmin={isAdmin}
        username={username}
        onSignOut={handleSignOut}
        onUnread={setUnread}
      />
    </div>
  );
}
