import { useEffect, useState } from "react";
import { ApiError, api, type Recipe } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import { Badge, ErrorBanner, Spinner, dangerButton, formatMinutes, secondaryButton } from "../ui";

export default function RecipeDetail({ id }: { id: number }) {
  const { username } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRecipe(null);
    setError(null);
    api
      .getRecipe(id)
      .then((r) => !cancelled && setRecipe(r))
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load recipe.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteRecipe(id);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete recipe.");
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (error && !recipe) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Link to="/" className="text-sm font-medium text-amber-700 hover:underline">
          ← Back to recipes
        </Link>
      </div>
    );
  }
  if (!recipe) return <Spinner />;

  const isAuthor = username !== null && username.toLowerCase() === recipe.author.toLowerCase();

  return (
    <article className="space-y-6">
      <Link to="/" className="text-sm font-medium text-amber-700 hover:underline">
        ← Back to recipes
      </Link>
      <ErrorBanner message={error} />
      <header className="space-y-3 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <Badge>{recipe.category}</Badge>
        <h1 className="text-3xl font-bold text-stone-900">{recipe.title}</h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
          <div>
            <dt className="inline font-medium">Prep time: </dt>
            <dd className="inline">{formatMinutes(recipe.prep_minutes)}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Servings: </dt>
            <dd className="inline">{recipe.servings}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Author: </dt>
            <dd className="inline">{recipe.author}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Added: </dt>
            <dd className="inline">{new Date(recipe.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
        {isAuthor && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to={`/recipes/${recipe.id}/edit`} className={secondaryButton}>
              Edit
            </Link>
            <button type="button" className={dangerButton} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        )}
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:col-span-1">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">Ingredients</h2>
          <ul className="list-disc space-y-1 pl-5 text-stone-700">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:col-span-2">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">Instructions</h2>
          <p className="whitespace-pre-line leading-relaxed text-stone-700">{recipe.instructions}</p>
        </section>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 id="confirm-title" className="mb-2 text-lg font-semibold text-stone-900">
              Delete recipe?
            </h2>
            <p className="mb-6 text-sm text-stone-600">
              “{recipe.title}” will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setConfirming(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button type="button" className={dangerButton} onClick={remove} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
