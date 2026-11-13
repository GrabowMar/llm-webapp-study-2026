import { useCallback, useEffect, useState } from "react";
import { ApiError, Me, api, getToken, setToken } from "./api";
import AuthForms from "./AuthForms";
import Inbox from "./Inbox";
import Bell from "./Bell";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!getToken()) return;
    api<Me>("/auth/me")
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const onExpired = useCallback(() => {
    setToken(null);
    setMe(null);
    setUnread(0);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", "POST");
    } catch {
      // token may already be invalid
    }
    onExpired();
  }, [onExpired]);

  if (loading) {
    return <p className="p-8 text-center text-slate-500">Loading…</p>;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-white shadow">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-semibold">Notification center</h1>
          {me && (
            <div className="flex items-center gap-4">
              <Bell count={unread} />
              <span className="text-sm text-slate-600">
                Signed in as <strong data-testid="username">{me.username}</strong>
              </span>
              <button
                onClick={signOut}
                className="rounded bg-slate-200 px-3 py-1 text-sm hover:bg-slate-300"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {me ? (
          <Inbox me={me} onUnread={setUnread} onExpired={onExpired} />
        ) : (
          <AuthForms onSignedIn={setMe} />
        )}
      </main>
    </div>
  );
}
