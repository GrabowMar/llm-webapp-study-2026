import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  deleteImage,
  listImages,
  loadSession,
  saveSession,
  type ImageItem,
  type ImageList,
  type Session,
} from "./api";
import AuthForms from "./components/AuthForms";
import Gallery from "./components/Gallery";
import ImageDetail from "./components/ImageDetail";
import UploadForm from "./components/UploadForm";

const PAGE_SIZE = 12;

function totalPagesOf(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ImageList>({
    items: [],
    total: 0,
    page: 1,
    page_size: PAGE_SIZE,
  });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImageItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    try {
      const data = await listImages(pageToLoad, PAGE_SIZE);
      const pages = totalPagesOf(data.total);
      if (data.items.length === 0 && data.page > pages) {
        setPage(pages);
        return;
      }
      setList(data);
      setListError(null);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Failed to load images.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const handleAuthed = (next: Session) => {
    saveSession(next);
    setSession(next);
    setNotice(null);
  };

  const handleSignOut = () => {
    saveSession(null);
    setSession(null);
    setSelected(null);
    setNotice("Signed out.");
  };

  const handleAuthError = (message: string) => {
    saveSession(null);
    setSession(null);
    setSelected(null);
    setNotice(message);
  };

  const handleUploaded = () => {
    setNotice(null);
    if (page === 1) {
      void load(1);
    } else {
      setPage(1);
    }
  };

  const handleDelete = async (image: ImageItem) => {
    if (!session) return;
    try {
      await deleteImage(image.id, session);
      setSelected(null);
      setNotice(`Deleted "${image.title || image.filename}".`);
      await load(page);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        handleAuthError("Your session expired. Please sign in again.");
      } else {
        setNotice(
          err instanceof ApiError ? err.message : "Failed to delete image.",
        );
      }
    }
  };

  const pages = totalPagesOf(list.total);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <h1 className="text-xl font-bold tracking-tight">Image Gallery</h1>
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                Signed in as{" "}
                <span className="font-medium text-slate-900">
                  {session.username}
                </span>
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-slate-500">Browsing as guest</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
          >
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="font-medium text-slate-400 hover:text-slate-600"
              aria-label="Dismiss message"
            >
              Dismiss
            </button>
          </div>
        )}

        {!session ? (
          <AuthForms onAuthed={handleAuthed} />
        ) : (
          <UploadForm
            session={session}
            onUploaded={handleUploaded}
            onAuthError={handleAuthError}
          />
        )}

        <section aria-label="Gallery" className="space-y-4">
          <Gallery
            images={list.items}
            loading={loading}
            error={listError}
            onOpen={setSelected}
          />

          {list.total > 0 && (
            <nav
              aria-label="Pagination"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-slate-600">
                {list.total} image{list.total === 1 ? "" : "s"} · Page {page} of{" "}
                {pages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={page >= pages}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </section>
      </main>

      {selected && (
        <ImageDetail
          image={selected}
          session={session}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
