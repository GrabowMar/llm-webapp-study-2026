import { useCallback, useEffect, useState } from "react";
import { api, ApiError, formatDate, loadToken, saveToken, type Image, type ImagePage } from "./api";
import AuthPanel from "./components/AuthPanel";
import ConfirmDialog from "./components/ConfirmDialog";
import ImageViewer from "./components/ImageViewer";
import UploadForm from "./components/UploadForm";

const PAGE_SIZE = 12;

interface Session {
  token: string;
  username: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(() => loadToken() !== null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ImagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewing, setViewing] = useState<Image | null>(null);
  const [deleting, setDeleting] = useState<Image | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const token = loadToken();
    if (!token) return;
    let cancelled = false;
    api
      .me(token)
      .then((me) => {
        if (!cancelled) setSession({ token, username: me.username });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) saveToken(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .listImages(page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setData(res);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load images");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  function signIn(token: string, username: string) {
    saveToken(token);
    setSession({ token, username });
  }

  const signOut = useCallback(() => {
    if (session) api.logout(session.token).catch(() => undefined);
    saveToken(null);
    setSession(null);
  }, [session]);

  const dropSession = useCallback(() => {
    saveToken(null);
    setSession(null);
  }, []);

  function onUploaded() {
    if (page !== 1) setPage(1);
    else reload();
  }

  const closeViewer = useCallback(() => setViewing(null), []);
  const cancelDelete = useCallback(() => {
    setDeleting(null);
    setDeleteError(null);
  }, []);

  async function confirmDelete() {
    if (!deleting || !session) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteImage(session.token, deleting.id);
      if (viewing?.id === deleting.id) setViewing(null);
      setDeleting(null);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setDeleting(null);
        setViewing(null);
        reload();
      } else {
        if (err instanceof ApiError && err.status === 401) dropSession();
        setDeleteError(err instanceof Error ? err.message : "Delete failed");
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const isOwner = (img: Image) => session !== null && img.uploader === session.username;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight">Image Gallery</h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as <strong className="font-semibold text-slate-900">{session.username}</strong>
              </span>
              <button
                type="button"
                onClick={signOut}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Not signed in</span>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[20rem_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {checkingSession ? (
            <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Loading…</div>
          ) : session ? (
            <UploadForm token={session.token} onUploaded={onUploaded} onUnauthorized={dropSession} />
          ) : (
            <>
              <AuthPanel onSignedIn={signIn} />
              <p className="px-1 text-sm text-slate-500">Sign in or create an account to upload images.</p>
            </>
          )}
        </aside>

        <section aria-label="Gallery" className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Latest images</h2>
            {data && data.total > 0 && (
              <span className="text-sm text-slate-500">
                {data.total} image{data.total === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
              >
                Retry
              </button>
            </div>
          ) : !data && loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-xl bg-slate-200" />
              ))}
            </div>
          ) : data && data.items.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <p className="text-base font-medium text-slate-700">No images yet</p>
              <p className="mt-1 text-sm text-slate-500">
                {session ? "Upload the first image using the form." : "Sign in to upload the first image."}
              </p>
            </div>
          ) : data ? (
            <>
              <ul
                className={`grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}
              >
                {data.items.map((img) => (
                  <li
                    key={img.id}
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <button
                      type="button"
                      onClick={() => setViewing(img)}
                      className="block aspect-square w-full overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label={`View ${img.title ?? img.filename}`}
                    >
                      <img
                        src={img.url}
                        alt={img.title ?? img.filename}
                        loading="lazy"
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                    <div className="flex items-start justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900" title={img.title ?? img.filename}>
                          {img.title ?? img.filename}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {img.uploader} · {formatDate(img.uploaded_at)}
                        </p>
                      </div>
                      {isOwner(img) && (
                        <button
                          type="button"
                          onClick={() => setDeleting(img)}
                          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${img.title ?? img.filename}`}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {totalPages > 1 && (
                <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {data.page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          ) : null}
        </section>
      </main>

      {viewing && (
        <ImageViewer
          image={viewing}
          canDelete={isOwner(viewing)}
          onDelete={() => setDeleting(viewing)}
          onClose={closeViewer}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete image?"
          message={`“${deleting.title ?? deleting.filename}” will be permanently deleted.`}
          confirmLabel="Delete"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
