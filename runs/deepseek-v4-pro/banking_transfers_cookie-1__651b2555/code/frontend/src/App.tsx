import { useEffect, useState } from "react";
import {
  Account,
  Transfer,
  createTransfer,
  getAccount,
  listTransfers,
  login,
  logout,
  register,
} from "./api";

type View = "login" | "register";

function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const PAGE_SIZE = 10;

export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getAccount()
      .then(setAccount)
      .catch(() => setAccount(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-slate-100" />;
  }

  return account ? (
    <Bank account={account} onAccountChange={setAccount} onLogout={() => setAccount(null)} />
  ) : (
    <Auth onAuthed={setAccount} />
  );
}

function Auth({ onAuthed }: { onAuthed: (a: Account) => void }) {
  const [view, setView] = useState<View>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (view === "register") {
        const account = await register(username, password);
        await login(username, password);
        onAuthed(account);
      } else {
        await login(username, password);
        onAuthed(await getAccount());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">
          Bank
        </h1>
        <div className="flex mb-6 border-b border-slate-200">
          {(["login", "register"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => {
                setView(v);
                setError(null);
              }}
              className={`flex-1 py-2 text-sm font-semibold capitalize ${
                view === v
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "login" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2 rounded-lg"
          >
            {busy ? "Please wait..." : view === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Bank({
  account,
  onAccountChange,
  onLogout,
}: {
  account: Account;
  onAccountChange: (a: Account) => void;
  onLogout: () => void;
}) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [toUsername, setToUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    listTransfers(page, PAGE_SIZE)
      .then((res) => {
        setTransfers(res.items);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [page]);

  useEffect(() => {
    getAccount().then(onAccountChange).catch(() => {});
  }, [transfers.length]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function submitTransfer(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      const created = await createTransfer({
        to_username: toUsername,
        amount: parseFloat(amount),
        memo: memo || undefined,
      });
      setMessage({
        kind: "success",
        text: `Sent ${formatMoney(created.amount)} to ${created.to_username}.`,
      });
      setToUsername("");
      setAmount("");
      setMemo("");
      setConfirming(false);
      onAccountChange(await getAccount());
      if (page !== 1) setPage(1);
      else listTransfers(1, PAGE_SIZE).then((r) => {
        setTransfers(r.items);
        setTotal(r.total);
      });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Transfer failed",
      });
      setConfirming(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // ignore
    }
    onLogout();
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">Bank</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Signed in as <strong>{account.username}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg px-3 py-1"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="bg-blue-600 text-white rounded-2xl p-6 shadow">
          <p className="text-sm text-blue-100 mb-1">Available balance</p>
          <p className="text-4xl font-bold">{formatMoney(account.balance)}</p>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Send money
          </h2>
          <form onSubmit={submitTransfer} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Recipient username
              </label>
              <input
                value={toUsername}
                onChange={(e) => setToUsername(e.target.value)}
                disabled={confirming}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={confirming}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Memo <span className="text-slate-400">(optional)</span>
              </label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                disabled={confirming}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {message && (
              <p
                className={`text-sm rounded-lg px-3 py-2 ${
                  message.kind === "error"
                    ? "text-red-600 bg-red-50"
                    : "text-green-700 bg-green-50"
                }`}
              >
                {message.text}
              </p>
            )}

            {confirming && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                Send {formatMoney(parseFloat(amount || "0"))} to{" "}
                <strong>{toUsername}</strong>
                {memo ? ` (memo: ${memo})` : ""}?
              </div>
            )}

            <div className="flex gap-3">
              {confirming ? (
                <>
                  <button
                    type="submit"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg"
                  >
                    Confirm transfer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setMessage(null);
                    }}
                    className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg"
                >
                  Continue
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Transactions
          </h2>
          {transfers.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {transfers.map((t) => {
                const other = t.direction === "in" ? t.from_username : t.to_username;
                return (
                  <li key={t.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {t.direction === "in" ? "From" : "To"} {other}
                      </p>
                      <p className="text-xs text-slate-500">{formatDate(t.created_at)}</p>
                      {t.memo && <p className="text-xs text-slate-400">{t.memo}</p>}
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          t.direction === "in" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {t.direction === "in" ? "+" : "-"}
                        {formatMoney(t.amount)}
                      </p>
                      <span className="text-xs uppercase text-slate-400">
                        {t.direction}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm font-medium text-blue-600 disabled:opacity-40 px-3 py-1 border border-slate-300 rounded-lg"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm font-medium text-blue-600 disabled:opacity-40 px-3 py-1 border border-slate-300 rounded-lg"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
