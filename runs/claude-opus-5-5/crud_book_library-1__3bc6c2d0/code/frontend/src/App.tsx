import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ApiError, api, session, setUnauthorizedHandler, type Book, type BookInput, type Review } from "./api";

type Route =
  | { name: "list" }
  | { name: "login" }
  | { name: "register" }
  | { name: "new" }
  | { name: "book"; id: number }
  | { name: "edit"; id: number }
  | { name: "notfound" };

function parseRoute(pathname: string): Route {
  if (pathname === "/" || pathname === "") return { name: "list" };
  if (pathname === "/login") return { name: "login" };
  if (pathname === "/register") return { name: "register" };
  if (pathname === "/books/new") return { name: "new" };
  let m = pathname.match(/^\/books\/(\d+)\/?$/);
  if (m) return { name: "book", id: Number(m[1]) };
  m = pathname.match(/^\/books\/(\d+)\/edit\/?$/);
  if (m) return { name: "edit", id: Number(m[1]) };
  return { name: "notfound" };
}

function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

const btn =
  "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
const btnPrimary = `${btn} bg-indigo-600 text-white hover:bg-indigo-500`;
const btnSecondary = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
const btnDanger = `${btn} bg-red-600 text-white hover:bg-red-500`;
const inputCls =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="text-amber-500" aria-label={`${value} out of 5`}>
      {"★".repeat(full)}
      <span className="text-slate-300">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function Alert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

function Field({
  label,
  error,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : "Something went wrong.";
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [username, setUsername] = useState<string | null>(() => (session.token() ? session.username() : null));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      session.clear();
      setUsername(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = (token: string, name: string) => {
    session.set(token, name);
    setUsername(name);
  };

  const signOut = async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    session.clear();
    setUsername(null);
  };

  let page: ReactNode;
  switch (route.name) {
    case "list":
      page = <BookList signedIn={!!username} />;
      break;
    case "login":
      page = <AuthForm mode="login" onSignedIn={signIn} />;
      break;
    case "register":
      page = <AuthForm mode="register" onSignedIn={signIn} />;
      break;
    case "new":
      page = username ? <BookForm /> : <SignInPrompt what="add a book" />;
      break;
    case "edit":
      page = username ? <BookForm id={route.id} /> : <SignInPrompt what="edit a book" />;
      break;
    case "book":
      page = <BookDetail id={route.id} username={username} />;
      break;
    default:
      page = (
        <div className="py-16 text-center">
          <h1 className="text-2xl font-semibold">Page not found</h1>
          <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
            Back to the library
          </Link>
        </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-indigo-700">
            Book Library
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {username ? (
              <>
                <span className="text-slate-600">
                  Signed in as <strong data-testid="current-user">{username}</strong>
                </span>
                <button type="button" className={btnSecondary} onClick={signOut}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className={btnSecondary}>
                  Sign in
                </Link>
                <Link to="/register" className={btnPrimary}>
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{page}</main>
    </div>
  );
}

function SignInPrompt({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
      <p>
        You need to{" "}
        <Link to="/login" className="text-indigo-600 hover:underline">
          sign in
        </Link>{" "}
        to {what}.
      </p>
    </div>
  );
}

function AuthForm({ mode, onSignedIn }: { mode: "login" | "register"; onSignedIn: (t: string, u: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  useEffect(() => {
    setError(null);
    setFieldErrors({});
  }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      if (!isLogin) await api.register(username, password);
      const res = await api.login(username, password);
      onSignedIn(res.token, res.username ?? username);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">{isLogin ? "Sign in" : "Create an account"}</h1>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert message={error} />
        <Field label="Username" htmlFor="username" error={fieldErrors.username}>
          <input
            id="username"
            name="username"
            className={inputCls}
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password}>
          <input
            id="password"
            name="password"
            type="password"
            className={inputCls}
            value={password}
            autoComplete={isLogin ? "current-password" : "new-password"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button type="submit" className={`${btnPrimary} w-full`} disabled={busy}>
          {isLogin ? "Sign in" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        {isLogin ? (
          <>
            No account?{" "}
            <Link to="/register" className="text-indigo-600 hover:underline">
              Register
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link to="/login" className="text-indigo-600 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

const PAGE_SIZE = 10;

function BookList({ signedIn }: { signedIn: boolean }) {
  const params = new URLSearchParams(window.location.search);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(Math.max(1, Number(params.get("page")) || 1));
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (search) qs.set("q", search);
    if (page > 1) qs.set("page", String(page));
    const next = `/${qs.toString() ? `?${qs}` : ""}`;
    if (window.location.pathname + window.location.search !== next) window.history.replaceState(null, "", next);
    api
      .listBooks(search, page, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setBooks(res.items);
        setTotal(res.total);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [search, page]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Books</h1>
        {signedIn && (
          <Link to="/books/new" className={btnPrimary}>
            Add book
          </Link>
        )}
      </div>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
      >
        <input
          type="search"
          name="q"
          aria-label="Search books"
          placeholder="Search by title, author or ISBN"
          className={inputCls}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className={btnSecondary}>
          Search
        </button>
        {search && (
          <button
            type="button"
            className={btnSecondary}
            onClick={() => {
              setQuery("");
              setSearch("");
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </form>
      <Alert message={error} />
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3">Year</th>
              <th className="px-4 py-3">Average rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {books.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/books/${b.id}`} className="text-indigo-700 hover:underline">
                    {b.title}
                  </Link>
                </td>
                <td className="px-4 py-3">{b.author}</td>
                <td className="px-4 py-3">{b.year ?? "—"}</td>
                <td className="px-4 py-3">
                  {b.average_rating === null ? (
                    <span className="text-slate-400">No reviews</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Stars value={b.average_rating} />
                      <span>{b.average_rating.toFixed(1)}</span>
                      <span className="text-slate-400">({b.review_count})</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && books.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  {search ? "No books match your search." : "No books yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {total} book{total === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className={btnSecondary} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className={btnSecondary}
            disabled={page >= pages || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function BookForm({ id }: { id?: number }) {
  const editing = id !== undefined;
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [year, setYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!editing) return;
    api
      .getBook(id)
      .then((b) => {
        setTitle(b.title);
        setAuthor(b.author);
        setYear(b.year === null ? "" : String(b.year));
        setIsbn(b.isbn ?? "");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const input: BookInput = { title, author };
    const y = year.trim();
    if (y) input.year = /^-?\d+$/.test(y) ? Number(y) : y;
    if (isbn.trim()) input.isbn = isbn.trim();
    try {
      const book = editing ? await api.updateBook(id, input) : await api.createBook(input);
      navigate(`/books/${book.id}`);
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-semibold">{editing ? "Edit book" : "Add a book"}</h1>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Alert message={error} />
        <Field label="Title" htmlFor="title" error={fieldErrors.title}>
          <input id="title" name="title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Author" htmlFor="author" error={fieldErrors.author}>
          <input id="author" name="author" className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Year (optional)" htmlFor="year" error={fieldErrors.year}>
            <input
              id="year"
              name="year"
              inputMode="numeric"
              className={inputCls}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </Field>
          <Field label="ISBN (optional)" htmlFor="isbn" error={fieldErrors.isbn}>
            <input id="isbn" name="isbn" className={inputCls} value={isbn} onChange={(e) => setIsbn(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Link to={editing ? `/books/${id}` : "/"} className={btnSecondary}>
            Cancel
          </Link>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {editing ? "Save changes" : "Add book"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BookDetail({ id, username }: { id: number; username: string | null }) {
  const [book, setBook] = useState<Book | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, r] = await Promise.all([api.getBook(id), api.listReviews(id)]);
      setBook(b);
      setReviews(r.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else setError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!book || !window.confirm(`Delete "${book.title}" and all its reviews?`)) return;
    setDeleting(true);
    try {
      await api.deleteBook(id);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };

  if (notFound)
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold">Book not found</h1>
        <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to the library
        </Link>
      </div>
    );
  if (!book) return error ? <Alert message={error} /> : <p className="text-slate-500">Loading…</p>;

  const alreadyReviewed = !!username && reviews.some((r) => r.username.toLowerCase() === username.toLowerCase());

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-indigo-600 hover:underline">
        ← All books
      </Link>
      <Alert message={error} />
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{book.title}</h1>
            <p className="text-slate-600">by {book.author}</p>
          </div>
          {username && (
            <div className="flex gap-2">
              <Link to={`/books/${book.id}/edit`} className={btnSecondary}>
                Edit
              </Link>
              <button type="button" className={btnDanger} onClick={remove} disabled={deleting}>
                Delete
              </button>
            </div>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Year</dt>
            <dd className="font-medium">{book.year ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">ISBN</dt>
            <dd className="font-medium break-all">{book.isbn ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Average rating</dt>
            <dd className="font-medium">
              {book.average_rating === null ? "No reviews" : (
                <span className="flex items-center gap-2">
                  <Stars value={book.average_rating} /> {book.average_rating.toFixed(1)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Reviews</dt>
            <dd className="font-medium">{book.review_count}</dd>
          </div>
        </dl>
      </section>

      {username && !alreadyReviewed && <ReviewForm bookId={book.id} onAdded={load} />}
      {username && alreadyReviewed && (
        <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          You have already reviewed this book.
        </p>
      )}
      {!username && (
        <p className="text-sm text-slate-600">
          <Link to="/login" className="text-indigo-600 hover:underline">
            Sign in
          </Link>{" "}
          to rate this book.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Reviews</h2>
        {reviews.length === 0 && <p className="text-sm text-slate-500">No reviews yet.</p>}
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{r.username}</span>
                <span className="flex items-center gap-3">
                  <Stars value={r.rating} />
                  <span className="text-slate-600">{r.rating}/5</span>
                  <time dateTime={r.created_at} className="text-slate-500">
                    {formatDate(r.created_at)}
                  </time>
                </span>
              </div>
              {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReviewForm({ bookId, onAdded }: { bookId: number; onAdded: () => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!rating) {
      setFieldErrors({ rating: "Please choose a rating." });
      return;
    }
    setBusy(true);
    try {
      await api.addReview(bookId, rating, comment);
      setRating(0);
      setComment("");
      await onAdded();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm" noValidate>
      <h2 className="text-lg font-semibold">Rate this book</h2>
      <Alert message={error} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none ${n <= rating ? "text-amber-500" : "text-slate-300"} hover:text-amber-400`}
            >
              ★
            </button>
          ))}
        </div>
        {fieldErrors.rating && <p className="mt-1 text-sm text-red-600">{fieldErrors.rating}</p>}
      </fieldset>
      <Field label="Comment (optional)" htmlFor="comment" error={fieldErrors.comment}>
        <textarea
          id="comment"
          name="comment"
          rows={3}
          className={inputCls}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Field>
      <button type="submit" className={btnPrimary} disabled={busy}>
        Submit review
      </button>
    </form>
  );
}
