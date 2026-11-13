import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-black text-amber-500">404</p>
      <h1 className="mt-3 text-2xl font-bold text-stone-900">
        Recipe not found
      </h1>
      <p className="mt-2 text-sm text-stone-500">
        The page you were looking for isn’t on the menu.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
      >
        Back to recipes
      </Link>
    </div>
  );
}
