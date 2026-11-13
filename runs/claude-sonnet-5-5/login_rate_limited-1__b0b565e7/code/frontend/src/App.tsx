import { useCallback, useEffect, useState } from "react";
import { ApiError, api, getToken, setToken, type Me } from "./api";
import AuthForms from "./AuthForms";
import Account from "./Account";
import AdminLocks from "./AdminLocks";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<Me>("/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) loadMe();
  }, [loadMe]);

  const signOut = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // token may already be invalid
    }
    setToken(null);
    setMe(null);
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Accounts</h1>
        {me && (
          <div className="flex items-center gap-3">
            <span className="text-sm">
              Signed in as <strong data-testid="current-user">{me.username}</strong>
            </span>
            <button
              onClick={signOut}
              className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      {loading ? (
        <p>Loading…</p>
      ) : me ? (
        <div className="space-y-6">
          <Account />
          {me.is_admin && <AdminLocks />}
        </div>
      ) : (
        <AuthForms onSignedIn={loadMe} />
      )}
    </div>
  );
}
