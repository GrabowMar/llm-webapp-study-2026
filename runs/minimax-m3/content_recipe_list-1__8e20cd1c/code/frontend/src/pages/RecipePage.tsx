import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import type { Recipe } from "../types";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function RecipePage() {
  const { id } = useParams();
  const recipeId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!Number.isFinite(recipeId)) {
      setError("That recipe does not exist.");
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    api
      .getRecipe(recipeId)
      .then((result) => {
        if (!active) return;
        setRecipe(result);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Could not load this recipe.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  const isAuthor = Boolean(
    recipe && user && recipe.author.toLowerCase() === user.username.toLowerCase(),
  );

  const handleDelete = async () => {
    if (!recipe) return;
    const confirmed = window.confirm(`Delete "${recipe.title}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeleting(true);
    try {
      await api.deleteRecipe(recipe.id);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete this recipe.");
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-stone-500">Loading recipe...</p>;
  }

  if (error || !recipe) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error ?? "Recipe not found."}
        </p>
        <Link to="/" className="text-sm font-medium text-amber-700 hover:underline">
          Back to all recipes
        </Link>
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link to="/" className="w-fit text-sm font-medium text-amber-700 hover:underline">
          Back to all recipes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-stone-900">{recipe.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                {recipe.category}
              </span>
              <span>{recipe.prep_minutes} min prep</span>
              <span>Serves {recipe.servings}</span>
              <span>By {recipe.author}</span>
              <span>Added {formatDate(recipe.created_at)}</span>
            </div>
          </div>
          {isAuthor ? (
            <div className="flex gap-2">
              <Link
                to={`/recipes/${recipe.id}/edit`}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-1">
          <h2 className="font-display text-xl font-bold text-stone-900">Ingredients</h2>
          {recipe.ingredients.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">No ingredients listed.</p>
          ) : (
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-stone-700">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index}>{ingredient}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h2 className="font-display text-xl font-bold text-stone-900">Instructions</h2>
          {recipe.instructions ? (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">
              {recipe.instructions}
            </p>
          ) : (
            <p className="mt-3 text-sm text-stone-500">No instructions yet.</p>
          )}
        </section>
      </div>
    </article>
  );
}
