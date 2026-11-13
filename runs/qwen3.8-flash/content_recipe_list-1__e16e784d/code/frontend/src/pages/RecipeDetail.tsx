import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  ListChecks,
  Pencil,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { api, ApiError, type Recipe } from "../api";
import { useAuth } from "../AuthContext";
import { ErrorBanner, Spinner } from "../components";

export default function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { username } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getRecipe(Number(id))
      .then((r) => {
        setRecipe(r);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err instanceof Error ? err.message : "Failed to load recipe.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    load();
  }, [load]);

  async function onDelete() {
    if (!recipe) return;
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.deleteRecipe(recipe.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipe.");
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (notFound)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Recipe not found</h1>
        <Link to="/" className="mt-4 inline-block font-medium text-amber-700 hover:underline">
          Back to all recipes
        </Link>
      </div>
    );
  if (!recipe)
    return <div className="mx-auto max-w-3xl px-4 py-8"><ErrorBanner message={error} /></div>;

  const isAuthor = username !== null && username === recipe.author;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-amber-700"
      >
        <ArrowLeft className="h-4 w-4" /> All recipes
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {recipe.category}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{recipe.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-4 w-4" /> {recipe.author}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {recipe.prep_minutes} min
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Serves {recipe.servings}
          </span>
        </div>

        <hr className="my-6 border-slate-100" />

        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700">
            <ListChecks className="h-4 w-4 text-amber-600" /> Ingredients
          </h2>
          {recipe.ingredients.length === 0 ? (
            <p className="text-sm italic text-slate-400">No ingredients listed.</p>
          ) : (
            <ul className="list-disc space-y-1.5 pl-6 marker:text-amber-500">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-slate-700">
                  {ing}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
            Instructions
          </h2>
          <p className="whitespace-pre-line leading-relaxed text-slate-700">
            {recipe.instructions}
          </p>
        </section>

        {isAuthor && (
          <div className="mt-8 flex gap-3 border-t border-slate-100 pt-6">
            <Link
              to={`/recipes/${recipe.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <button
              onClick={onDelete}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <ErrorBanner message={error} />
      </div>
    </div>
  );
}
