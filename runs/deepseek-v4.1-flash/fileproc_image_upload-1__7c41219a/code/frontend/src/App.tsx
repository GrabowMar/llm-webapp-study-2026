import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  clearSession,
  deleteImage,
  fetchImages,
  fetchMe,
  getStoredUsername,
  getToken,
  login,
  register,
  storeSession,
  uploadImage,
} from "./api";
import type { ImageItem, ImagePage } from "./api";

const PAGE_SIZE = 12;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60";

const primaryButton =
  "inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButton =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60";

const dangerButton =
  "inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60";

type AuthMode = "signin" | "register";

function AuthPanel({
  onSignedIn,
}: {
  onSignedIn: (token: string, username: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(username.trim(), password);
      }
      const token = await login(username.trim(), password);
      onSignedIn(token, username.trim());
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(["signin", "register"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={`flex-1 rounded-md px-3 py-2 transition ${
              mode === value
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {value === "signin" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="auth-username" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Username
          </label>
          <input
            id="auth-username"
            className={inputClass}
            value={username}
            autoComplete="username"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            className={inputClass}
            value={password}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" className={`${primaryButton} w-full`} disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "register"
              ? "Create account"
              : "Sign in"}
        </button>
        <p className="text-center text-xs text-slate-500">
          {mode === "register"
            ? "Registration signs you in automatically."
            : "Welcome back to the gallery."}
        </p>
      </form>
    </section>
  );
}

function UploadPanel({
  onUploaded,
  onClose,
}: {
  onUploaded: (image: ImageItem) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const chooseFile = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const okType =
      selected.type === "image/png" ||
      selected.type === "image/jpeg" ||
      /\.(png|jpe?g)$/i.test(selected.name);
    if (!okType) {
      setFile(null);
      setError("Only PNG and JPEG images are allowed.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(selected);
  };

  const readAsBase64 = (selected: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(selected);
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Choose a PNG or JPEG image first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const data = await readAsBase64(file);
      const image = await uploadImage({
        filename: file.name,
        data,
        title: title.trim() ? title.trim() : undefined,
      });
      onUploaded(image);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Upload an image</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-medium text-slate-400 transition hover:text-slate-600"
        >
          Cancel
        </button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <input
            ref={inputRef}
            id="upload-file"
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:border-indigo-400"
          />
          <p className="mt-1 text-xs text-slate-500">PNG or JPEG, up to 50 MB.</p>
        </div>
        {previewUrl && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            <img
              src={previewUrl}
              alt="Selected image preview"
              className="mx-auto max-h-64 w-auto object-contain"
            />
          </div>
        )}
        <div>
          <label htmlFor="upload-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Title <span className="font-normal normal-case text-slate-400">(optional)</span>
          </label>
          <input
            id="upload-title"
            className={inputClass}
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A short caption"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" className={`${primaryButton} w-full`} disabled={busy || !file}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>
    </section>
  );
}

function ImageModal({
  image,
  canDelete,
  onClose,
  onDeleted,
}: {
  image: ImageItem;
  canDelete: boolean;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const remove = async () => {
    if (!window.confirm(`Delete “${image.title || image.filename}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteImage(image.id);
      onDeleted(image.id);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={image.title || image.filename}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="truncate pr-4 text-base font-semibold text-slate-900">
            {image.title || image.filename}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-2 py-1 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-950 p-3">
          <img
            src={image.url}
            alt={image.title || image.filename}
            className="max-h-[65vh] w-auto max-w-full object-contain"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            <div>
              <dt className="inline font-semibold text-slate-500">File: </dt>
              <dd className="inline break-all">{image.filename}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Title: </dt>
              <dd className="inline">{image.title || "—"}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Size: </dt>
              <dd className="inline">{formatBytes(image.size_bytes)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Uploaded: </dt>
              <dd className="inline">{formatDate(image.uploaded_at)}</dd>
            </div>
          </dl>
          {canDelete && (
            <button
              type="button"
              className={dangerButton}
              onClick={remove}
              disabled={busy}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ImageCard({
  image,
  onOpen,
}: {
  image: ImageItem;
  onOpen: (image: ImageItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(image)}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-300"
    >
      <div className="aspect-square overflow-hidden bg-slate-100">
        <img
          src={image.url}
          alt={image.title || image.filename}
          loading="lazy"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold text-slate-900">
          {image.title || image.filename}
        </p>
        <p className="truncate text-xs text-slate-500">by {image.uploader}</p>
        <p className="mt-auto text-xs text-slate-400">{formatDate(image.uploaded_at)}</p>
      </div>
    </button>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getStoredUsername);
  const [checking, setChecking] = useState<boolean>(() => Boolean(getToken()));
  const [authOpen, setAuthOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ImagePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ImageItem | null>(null);

  const loadImages = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchImages(targetPage, PAGE_SIZE);
      setData(result);
      if (result.page !== targetPage) setPage(result.page);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      setUsername(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (!cancelled) {
          storeSession(getToken()!, me.username);
          setUsername(me.username);
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setUsername(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadImages(page);
  }, [page, loadImages]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / data.page_size));
  }, [data]);

  const handleSignedIn = (token: string, name: string) => {
    storeSession(token, name);
    setUsername(name);
    setAuthOpen(false);
    setPage(1);
    void loadImages(1);
  };

  const handleSignOut = () => {
    clearSession();
    setUsername(null);
    setUploadOpen(false);
  };

  const handleUploaded = () => {
    setPage(1);
    void loadImages(1);
  };

  const handleDeleted = (id: number) => {
    if (data && data.items.length === 1 && page > 1) {
      setPage((current) => current - 1);
    } else {
      void loadImages(page);
    }
    setSelected((current) => (current?.id === id ? null : current));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
              ▣
            </span>
            <div>
              <h1 className="text-lg font-bold leading-tight text-slate-900">Image Gallery</h1>
              <p className="text-xs text-slate-500">Share your PNG and JPEG images</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {username ? (
              <>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
                  {username}
                </span>
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setUploadOpen((open) => !open)}
                >
                  Upload
                </button>
                <button type="button" className={secondaryButton} onClick={handleSignOut}>
                  Sign out
                </button>
              </>
            ) : checking ? (
              <span className="text-sm text-slate-500">Checking session…</span>
            ) : (
              <button
                type="button"
                className={primaryButton}
                onClick={() => setAuthOpen((open) => !open)}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {authOpen && !username && (
          <div className="mx-auto w-full max-w-md">
            <AuthPanel onSignedIn={handleSignedIn} />
          </div>
        )}

        {uploadOpen && username && (
          <div className="mx-auto w-full max-w-xl">
            <UploadPanel onUploaded={handleUploaded} onClose={() => setUploadOpen(false)} />
          </div>
        )}

        <section aria-label="Gallery">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Latest uploads</h2>
            {data && (
              <p className="text-sm text-slate-500">
                {data.total} {data.total === 1 ? "image" : "images"}
              </p>
            )}
          </div>

          {loading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="aspect-square animate-pulse bg-slate-200" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-medium text-red-700">{error}</p>
              <button
                type="button"
                className={`${secondaryButton} mt-3`}
                onClick={() => void loadImages(page)}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && data && data.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-500">
                ▣
              </div>
              <h3 className="text-lg font-semibold text-slate-900">No images yet</h3>
              <p className="mt-1 text-sm text-slate-500">
                {username
                  ? "Be the first to upload a PNG or JPEG image."
                  : "Sign in to upload the first image."}
              </p>
              {username ? (
                <button
                  type="button"
                  className={`${primaryButton} mt-4`}
                  onClick={() => setUploadOpen(true)}
                >
                  Upload an image
                </button>
              ) : (
                <button
                  type="button"
                  className={`${primaryButton} mt-4`}
                  onClick={() => setAuthOpen(true)}
                >
                  Sign in
                </button>
              )}
            </div>
          )}

          {!loading && !error && data && data.items.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.items.map((image) => (
                <ImageCard key={image.id} image={image} onOpen={setSelected} />
              ))}
            </div>
          )}

          {!loading && !error && data && data.total > data.page_size && (
            <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </button>
            </nav>
          )}
        </section>
      </main>

      {selected && (
        <ImageModal
          image={selected}
          canDelete={Boolean(username) && selected.uploader === username}
          onClose={() => setSelected(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
