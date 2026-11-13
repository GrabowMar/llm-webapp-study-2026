import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Image = {
  id: number;
  filename: string;
  title: string | null;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
  url: string;
  uploader: string;
};

type ListResponse = {
  items: Image[];
  total: number;
  page: number;
  page_size: number;
};

const TOKEN_KEY = "gallery_token";
const USERNAME_KEY = "gallery_username";

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

function setAuth(token: string | null, username: string | null) {
  if (token && username) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  }
}

async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    return { ok: false, status: 0, data: null, error: "network error" };
  }

  if (res.status === 204) {
    return { ok: true, status: 204, data: null, error: null };
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data && typeof data.error === "string"
        ? data.error
        : `request failed (${res.status})`;
    return { ok: false, status: res.status, data, error: message };
  }
  return { ok: true, status: res.status, data: data as T, error: null };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function Field(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {props.label}
      </span>
      <input
        type={props.type ?? "text"}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

function AuthForms({
  onAuthed,
  compact,
}: {
  onAuthed: (username: string) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
          setError(res.error ?? "registration failed");
          return;
        }
      }
      const login = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (!login.ok || !login.data || !login.data.token) {
        setError(login.error ?? "sign in failed");
        return;
      }
      setAuth(login.data.token, username);
      onAuthed(username);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "w-full" : "mx-auto mt-16 max-w-sm"}>
      {!compact && (
        <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
          Image gallery
        </h1>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex rounded-lg bg-gray-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
            className={`flex-1 rounded-md py-1.5 ${
              mode === "login" ? "bg-white shadow" : "text-gray-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError("");
            }}
            className={`flex-1 rounded-md py-1.5 ${
              mode === "register" ? "bg-white shadow" : "text-gray-600"
            }`}
          >
            Register
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
          />
          <ErrorBanner message={error} />
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [filename, setFilename] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | null) {
    setError("");
    if (!file) {
      setPreview(null);
      setFilename("");
      return;
    }
    const lower = file.name.toLowerCase();
    const ok = lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg");
    if (!ok) {
      setError("only PNG and JPEG images are supported");
      setPreview(null);
      setFilename(file.name);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!preview) {
      setError("choose a PNG or JPEG image");
      return;
    }
    setBusy(true);
    try {
      const res = await api("/api/images", {
        method: "POST",
        body: JSON.stringify({
          filename: filename || "image",
          title: title || undefined,
          data: preview,
        }),
      });
      if (!res.ok) {
        setError(res.error ?? "upload failed");
        return;
      }
      setFilename("");
      setTitle("");
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      onUploaded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload image</h2>
      <form onSubmit={submit} className="space-y-4">
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="max-h-48 rounded-lg border border-gray-200 object-contain"
          />
        )}
        <Field label="Filename" value={filename} onChange={setFilename} />
        <Field label="Title (optional)" value={title} onChange={setTitle} />
        <ErrorBanner message={error} />
        <button
          type="submit"
          disabled={busy || !preview}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Upload
        </button>
      </form>
    </section>
  );
}

function Viewer({ image, onClose }: { image: Image; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-gray-900">
              {image.title || image.filename}
            </h3>
            <p className="text-xs text-gray-500">
              {image.filename} · {formatBytes(image.size_bytes)} ·{" "}
              {formatDate(image.uploaded_at)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="flex max-h-[80vh] items-center justify-center bg-gray-900 p-4">
          <img
            src={image.url}
            alt={image.title || image.filename}
            className="max-h-[75vh] max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}

function Gallery({
  username,
  onAuthed,
}: {
  username: string | null;
  onAuthed: (u: string) => void;
}) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<Image | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const load = useCallback(
    async (p: number, size: number) => {
      setLoading(true);
      setError("");
      const res = await api<ListResponse>(
        `/api/images?page=${p}&page_size=${size}`
      );
      if (!res.ok) {
        setError(res.error ?? "failed to load images");
        setData(null);
      } else {
        setData(res.data);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    load(page, pageSize);
  }, [page, pageSize, load]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  async function handleDelete(id: number) {
    setDeleting(id);
    setError("");
    try {
      const res = await api(`/api/images/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(res.error ?? "delete failed");
        return;
      }
      setConfirmDelete(null);
      await load(page, pageSize);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          {username ? (
            <UploadForm onUploaded={() => load(page, pageSize)} />
          ) : (
            <AuthForms onAuthed={onAuthed} compact />
          )}
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Gallery</h2>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              Per page
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                {[12, 24, 48].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ErrorBanner message={error} />

          {loading ? (
            <p className="py-12 text-center text-gray-500">Loading…</p>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
              <p className="text-gray-500">No images yet.</p>
              {username ? (
                <p className="mt-1 text-sm text-gray-400">
                  Upload the first one to get started.
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-400">
                  Sign in and upload the first image.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {data.items.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setViewer(img)}
                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md"
                  >
                    <div className="aspect-square w-full bg-gray-100">
                      <img
                        src={img.url}
                        alt={img.title || img.filename}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {img.title || img.filename}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {img.uploader} · {formatDate(img.uploaded_at)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {data.total} image{data.total === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {data.page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {viewer && (
        <Viewer
          image={viewer}
          onClose={() => {
            setViewer(null);
            setConfirmDelete(null);
          }}
        />
      )}

      {viewer && username === viewer.uploader && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4">
          {confirmDelete === viewer.id ? (
            <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-white px-4 py-3 shadow-lg">
              <span className="text-sm text-gray-700">
                Delete this image?
              </span>
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(viewer.id)}
                disabled={deleting === viewer.id}
                className="rounded-md bg-red-600 px-3 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(viewer.id)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [username, setUsername] = useState<string | null>(getUsername());

  const token = getToken();

  const signOut = () => {
    setAuth(null, null);
    setUsername(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <h1 className="text-xl font-semibold">Image gallery</h1>
          {token && username ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                Signed in as{" "}
                <span className="font-medium text-gray-900">{username}</span>
              </span>
              <button
                onClick={signOut}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Sign out
              </button>
            </div>
          ) : (
            <span className="text-sm text-gray-500">Browse the gallery</span>
          )}
        </div>
      </header>
      <Gallery username={username} onAuthed={setUsername} />
    </div>
  );
}
