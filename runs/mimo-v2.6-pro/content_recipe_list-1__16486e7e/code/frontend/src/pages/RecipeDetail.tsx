import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { Recipe } from "../types";

export default function RecipeDetail() {
  const { id } = useParams();
  const recipeId = Number(id);
  const { username } = useAuth();
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setConfirming(false);
    api.getRecipe(recipeId)
      .then((r) => {
        if (!cancelled) {
          setRecipe(r);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load the recipe");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  const performDelete = useCallback(async () => {
    setDeleting(true);
    setError("");
    try {
      await api.deleteRecipe(recipeId);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete the recipe");
      setDeleting(false);
      setConfirming(false);
    }
  }, [recipeId, navigate]);

  function onDeleteClick() {
    if (window.confirm("Delete this recipe? This cannot be undone.")) {
      void performDelete();
    } else {
      setConfirming(true);
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-stone-500">Loading recipe...</p>;
  }

  if (error && !recipe) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-10 text-center">
        <p className="text-lg font-semibold text-stone-800">{error}</p>
        <Link
          to="/"
          className="mt-4 inline-block rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Back to recipes
        </Link>
      </div>
    );
  }

  if (!recipe) {
    return null;
  }

  const isAuthor = username === recipe.author;

  return (
    <article>
      <Link to="/" className="text-sm font-medium text-emerald-700 hover:underline">
        &larr; Back to recipes
      </Link>

      <div className="mt-3 rounded-lg border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">{recipe.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                {recipe.category}
              </span>
              <span>{recipe.prep_minutes} min prep</span>
              <span>&middot;</span>
              <span>
                {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
              </span>
              <span>&middot;</span>
              <span>
                by <span className="font-medium text-stone-800">{recipe.author}</span>
              </span>
            </div>
          </div>
          {isAuthor && (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/recipes/${recipe.id}/edit`}
                className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={onDeleteClick}
                className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {confirming && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-800">
              Really delete &ldquo;{recipe.title}&rdquo;? This cannot be undone.
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void performDelete()}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_2fr]">
          <section>
            <h2 className="text-lg font-semibold text-stone-900">Ingredients</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-stone-700">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={`${index}-${ingredient}`}>{ingredient}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-stone-900">Instructions</h2>
            <div className="mt-3 whitespace-pre-line leading-7 text-stone-700">
              {recipe.instructions}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}
