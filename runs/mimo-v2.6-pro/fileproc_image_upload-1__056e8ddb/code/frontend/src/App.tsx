import { useCallback, useEffect, useState } from "react";
import AuthPanel from "./components/AuthPanel";
import Gallery from "./components/Gallery";
import ImageModal from "./components/ImageModal";
import UploadForm from "./components/UploadForm";
import * as api from "./lib/api";

const PAGE_SIZE = 12;
const TOKEN_KEY = "gallery.token";
const USERNAME_KEY = "gallery.username";

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem(USERNAME_KEY),
  );

  const [images, setImages] = useState<api.GalleryImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<api.GalleryImage | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listImages(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setImages(result.items);
        setTotal(result.total);
        setListError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setListError(err instanceof Error ? err.message : "Could not load images.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = useCallback(() => setReloadKey((key) => key + 1), []);

  const handleUploaded = useCallback(() => {
    setPage(1);
    refresh();
  }, [refresh]);

  const handleSignedIn = useCallback((newToken: string, user: string) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USERNAME_KEY, user);
    setToken(newToken);
    setUsername(user);
  }, []);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
    setSelected(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selected || !token) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteImage(token, selected.id);
      const lastOnPage = images.length === 1 && page > 1;
      setSelected(null);
      if (lastOnPage) setPage((p) => Math.max(1, p - 1));
      else refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete the image.");
    } finally {
      setDeleting(false);
    }
  }, [selected, token, images.length, page, refresh]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
            Image Gallery
          </h1>
          {token && username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-semibold text-slate-900">{username}</span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Browse freely — sign in to upload.</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        {token ? (
          <UploadForm token={token} onUploaded={handleUploaded} />
        ) : (
          <AuthPanel onSignedIn={handleSignedIn} />
        )}

        <section aria-label="Gallery">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Gallery</h2>
            <p className="text-sm text-slate-500">
              {total} image{total === 1 ? "" : "s"}
            </p>
          </div>

          <Gallery
            images={images}
            loading={loading}
            error={listError}
            onSelect={(image) => {
              setDeleteError(null);
              setSelected(image);
            }}
          />

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </section>
      </main>

      {selected && (
        <ImageModal
          image={selected}
          isOwner={username !== null && selected.uploader === username}
          error={deleteError}
          busy={deleting}
          onClose={() => {
            setDeleteError(null);
            setSelected(null);
          }}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
