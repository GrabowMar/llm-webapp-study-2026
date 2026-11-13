import { useCallback, useEffect, useState } from "react";
import { ApiError, clearSession, listImages, loadSession, logout, saveSession, type GalleryImage, type Session } from "./api";
import { AuthPanel } from "./components/AuthPanel";
import { ImageCard } from "./components/ImageCard";
import { Lightbox } from "./components/Lightbox";
import { UploadForm } from "./components/UploadForm";

const PAGE_SIZE = 12;

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [items, setItems] = useState<GalleryImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listImages(page, PAGE_SIZE)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setTotal(result.total);
        setPageSize(result.page_size);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Could not load the gallery.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleSignIn(token: string, username: string) {
    const next = { token, username };
    saveSession(next);
    setSession(next);
  }

  async function handleSignOut() {
    const current = session;
    clearSession();
    setSession(null);
    if (current) {
      try {
        await logout(current.token);
      } catch {
        // Signing out locally is enough even if the token call fails.
      }
    }
  }

  function handleUploaded() {
    setPage(1);
    refresh();
  }

  function handleDeleted() {
    setSelected(null);
    refresh();
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
              G
            </span>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">Image Gallery</h1>
              <p className="mt-1 text-xs text-slate-400">Browse, share and manage images</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="text-sm text-slate-300">
                  Signed in as <span className="font-semibold text-indigo-300">{session.username}</span>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-400">Browsing as a guest</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">Gallery</h2>
                <p className="text-sm text-slate-400">
                  {total === 0 ? "No images yet" : `${total} image${total === 1 ? "" : "s"} · page ${page} of ${totalPages}`}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="animate-pulse overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                    <div className="aspect-4/3 bg-slate-800" />
                    <div className="space-y-2 p-4">
                      <div className="h-4 w-2/3 rounded bg-slate-800" />
                      <div className="h-3 w-1/2 rounded bg-slate-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-8 text-center">
                <p className="text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={refresh}
                  className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-2xl text-slate-500">
                  🖼
                </div>
                <h3 className="text-lg font-semibold text-slate-200">No images here yet</h3>
                <p className="mt-1 text-sm text-slate-400">
                  {session ? "Upload your first image to get started." : "Sign in to upload the first image."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((image) => (
                  <ImageCard
                    key={image.id}
                    image={image}
                    username={session?.username ?? null}
                    token={session?.token ?? null}
                    onOpen={setSelected}
                    onDeleted={handleDeleted}
                  />
                ))}
              </div>
            )}

            {!loading && !error && totalPages > 1 && (
              <nav aria-label="Gallery pages" className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-3 text-sm text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </section>

          <aside className="space-y-6">
            {session ? (
              <UploadForm token={session.token} onUploaded={handleUploaded} />
            ) : (
              <AuthPanel onSignIn={handleSignIn} />
            )}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm text-slate-400">
              <p className="font-medium text-slate-300">How it works</p>
              <p className="mt-2">
                Anyone can browse. Register or sign in to upload PNG and JPEG images, and you can
                delete the images you uploaded.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-500">
        Image Gallery · built with Flask, React and Tailwind CSS
      </footer>

      {selected && <Lightbox image={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
