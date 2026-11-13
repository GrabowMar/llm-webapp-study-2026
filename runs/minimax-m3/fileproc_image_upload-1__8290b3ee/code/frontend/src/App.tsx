import { useCallback, useEffect, useState } from "react";
import { ApiError, deleteImage, fetchImages } from "./api";
import AuthPanel from "./components/AuthPanel";
import ImageCard from "./components/ImageCard";
import Lightbox from "./components/Lightbox";
import Pagination from "./components/Pagination";
import UploadForm from "./components/UploadForm";
import { useAuth } from "./hooks/useAuth";
import type { ImageItem } from "./types";

const PAGE_SIZE = 12;

export default function App() {
  const { token, user, restoring, signIn, signOut } = useAuth();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImageItem | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const result = await fetchImages(page, PAGE_SIZE, token);
      setImages(result.items);
      setTotal(result.total);
    } catch (caught) {
      setImages([]);
      setTotal(0);
      setListError(
        caught instanceof ApiError
          ? caught.message
          : "The gallery could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [page, token]);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function handleDelete(image: ImageItem) {
    const confirmed = window.confirm(
      `Delete “${image.title || image.filename}”? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    if (!token) {
      return;
    }
    try {
      await deleteImage(token, image.id);
      setSelected((current) => (current?.id === image.id ? null : current));
      const remaining = images.length - 1;
      const lastPage = Math.max(1, Math.ceil((total - 1) / PAGE_SIZE));
      if (remaining === 0 && page > 1) {
        setPage(lastPage);
      } else {
        await loadImages();
      }
    } catch (caught) {
      setListError(
        caught instanceof ApiError
          ? caught.message
          : "The image could not be deleted.",
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              Image Gallery
            </h1>
            <p className="text-sm text-slate-500">
              Browse, share and manage your pictures.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {restoring ? (
              <span className="text-sm text-slate-500">Checking session…</span>
            ) : user ? (
              <>
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                  Signed in as {user.username}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <span className="text-sm text-slate-500">Not signed in</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {!user ? (
          <div className="mx-auto max-w-md">
            <AuthPanel onAuthenticated={signIn} />
          </div>
        ) : (
          <UploadForm
            token={token ?? ""}
            onUploaded={() => {
              setPage(1);
              void loadImages();
            }}
          />
        )}

        <section aria-label="Gallery" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Images</h2>
            {!loading && total > 0 ? (
              <p className="text-sm text-slate-500">
                {total} {total === 1 ? "image" : "images"}
              </p>
            ) : null}
          </div>

          {listError ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {listError}
            </p>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square animate-pulse rounded-2xl bg-slate-200"
                />
              ))}
            </div>
          ) : images.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-2xl">
                🖼️
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">
                No images yet
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                {user
                  ? "Upload your first PNG or JPEG to start the gallery."
                  : "The gallery is empty. Sign in to upload the first image."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {images.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  canDelete={Boolean(user && image.uploader === user.username)}
                  onOpen={setSelected}
                  onDelete={(target) => void handleDelete(target)}
                />
              ))}
            </div>
          )}

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </section>
      </main>

      {selected ? (
        <Lightbox image={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
