import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteImage, listImages, logout, type Image } from "./api";
import AuthForms from "./components/AuthForms";
import GalleryGrid from "./components/GalleryGrid";
import Lightbox from "./components/Lightbox";
import Pager from "./components/Pager";
import UploadForm from "./components/UploadForm";

const PAGE_SIZE = 20;
const TOKEN_KEY = "gallery_token";
const USER_KEY = "gallery_user";

interface Session {
  token: string;
  username: string;
}

function readSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USER_KEY);
  return token && username ? { token, username } : null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(readSession);
  const [items, setItems] = useState<Image[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Image | null>(null);

  const refresh = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listImages(targetPage, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
      if (data.items.length === 0 && data.page > 1) {
        void refresh(Math.max(1, data.page - 1));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load images.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signIn(token: string, username: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
    setSession({ token, username });
  }

  async function signOut() {
    if (session) {
      try {
        await logout(session.token);
      } catch {
        /* ignore */
      }
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    setSession(null);
  }

  function onUploaded(image: Image) {
    if (page !== 1) {
      void refresh(1);
      return;
    }
    setItems((prev) => [image, ...prev].slice(0, PAGE_SIZE));
    setTotal((t) => t + 1);
  }

  async function removeImage(id: number) {
    if (!session) return;
    setActionError(null);
    try {
      await deleteImage(session.token, id);
      setLightbox((current) => (current && current.id === id ? null : current));
      const lastPage = Math.max(1, Math.ceil((total - 1) / PAGE_SIZE));
      void refresh(Math.min(page, lastPage));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not delete the image.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">
            <span className="text-indigo-600">▦</span> Image Gallery
          </h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-sm text-slate-600 sm:inline">
                Signed in as <strong className="font-semibold">{session.username}</strong>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Viewing as guest</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {actionError && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            <span role="alert">{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-4 shrink-0 font-medium hover:text-red-900"
              aria-label="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}
        {session ? (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <aside className="lg:sticky lg:top-16 lg:self-start">
              <UploadForm token={session.token} onUploaded={onUploaded} />
            </aside>
            <section aria-label="Gallery" className="min-w-0">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-slate-800">Gallery</h2>
                <p className="text-sm text-slate-500">{total} image{total === 1 ? "" : "s"}</p>
              </div>
              <GalleryGrid
                items={items}
                currentUsername={session.username}
                onOpen={setLightbox}
                onDelete={(id) => removeImage(id)}
                busy={loading}
                error={error}
                empty={!loading && items.length === 0}
              />
              {!error && (
                <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={(p) => refresh(p)} />
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
            <aside>
              <AuthForms onSignedIn={signIn} />
              <p className="mx-auto mt-3 max-w-sm text-center text-xs text-slate-500">
                Register or sign in to upload and manage your own images.
              </p>
            </aside>
            <section aria-label="Gallery" className="min-w-0">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-base font-semibold text-slate-800">Gallery</h2>
                <p className="text-sm text-slate-500">
                  {total} image{total === 1 ? "" : "s"}
                </p>
              </div>
              <GalleryGrid
                items={items}
                currentUsername={null}
                onOpen={setLightbox}
                onDelete={() => Promise.resolve()}
                busy={loading}
                error={error}
                empty={!loading && items.length === 0}
              />
              {!error && (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  onPage={(p) => void refresh(p)}
                />
              )}
            </section>
          </div>
        )}
      </main>

      {lightbox && (
        <Lightbox
          image={lightbox}
          onClose={() => setLightbox(null)}
          onDelete={removeImage}
          canDelete={!!session && session.username === lightbox.uploader}
        />
      )}
    </div>
  );
}
