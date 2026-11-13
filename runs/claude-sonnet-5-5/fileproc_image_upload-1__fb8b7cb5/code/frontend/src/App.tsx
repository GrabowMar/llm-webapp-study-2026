import { useCallback, useEffect, useState } from "react";
import AuthForm from "./AuthForm";
import ImageViewer from "./ImageViewer";
import Modal from "./Modal";
import UploadForm from "./UploadForm";
import { Image, Page, formatDate, request } from "./api";

const PAGE_SIZE = 12;

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem("username"));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAuth, setShowAuth] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<Image | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    request<Page>(`/images?page=${page}&page_size=${PAGE_SIZE}`)
      .then((res) => {
        if (cancelled) return;
        const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
        if (page > pages) setPage(pages);
        else {
          setData(res);
          setLoadError(null);
        }
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Could not load images"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  function signedIn(t: string, name: string) {
    localStorage.setItem("token", t);
    localStorage.setItem("username", name);
    setToken(t);
    setUsername(name);
    setShowAuth(false);
  }

  function signOut() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken(null);
    setUsername(null);
    setShowUpload(false);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const btn = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-xl font-bold">Image Gallery</h1>
          <div className="flex flex-wrap items-center gap-3">
            {token && username ? (
              <>
                <span className="text-sm text-slate-600">
                  Signed in as <strong data-testid="current-user">{username}</strong>
                </span>
                <button onClick={() => setShowUpload(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
                  Upload
                </button>
                <button onClick={signOut} className={btn}>
                  Sign out
                </button>
              </>
            ) : (
              <button onClick={() => setShowAuth(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
                Sign in / Register
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {loadError && (
          <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {loadError}
          </p>
        )}
        {!data && loading && <p className="text-center text-slate-500">Loading…</p>}
        {data && data.items.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 py-16 text-center">
            <p className="text-lg font-medium">No images yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {token ? "Upload the first one!" : "Sign in to upload the first one."}
            </p>
          </div>
        )}
        {data && data.items.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {data.items.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button onClick={() => setSelected(img)} className="block w-full text-left" aria-label={`Open ${img.title || img.filename}`}>
                  <div className="aspect-square w-full bg-slate-100">
                    <img src={img.url} alt={img.title || img.filename} loading="lazy" className="h-full w-full object-cover" />
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{img.title || img.filename}</p>
                    <p className="truncate text-xs text-slate-500">
                      {img.uploader} · {formatDate(img.uploaded_at)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > 0 && (
          <nav className="mt-6 flex items-center justify-center gap-4" aria-label="Pagination">
            <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {data.page} of {totalPages}
            </span>
            <button className={btn} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </nav>
        )}
      </main>

      {showAuth && (
        <Modal onClose={() => setShowAuth(false)}>
          <AuthForm onSignedIn={signedIn} onClose={() => setShowAuth(false)} />
        </Modal>
      )}
      {showUpload && token && (
        <Modal onClose={() => setShowUpload(false)}>
          <UploadForm
            token={token}
            onClose={() => setShowUpload(false)}
            onUploaded={() => {
              setShowUpload(false);
              setPage(1);
              reload();
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <ImageViewer
            image={selected}
            token={token}
            username={username}
            onClose={() => setSelected(null)}
            onDeleted={() => {
              setSelected(null);
              reload();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
