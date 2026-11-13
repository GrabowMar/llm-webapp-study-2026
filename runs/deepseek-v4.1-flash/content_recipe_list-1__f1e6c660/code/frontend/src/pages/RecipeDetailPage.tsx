import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteRecipe, getRecipe, type Recipe } from "../api";
import { Alert, Button } from "../components/ui";
import { useAuth } from "../auth";

export default function RecipeDetailPage() {
  const { id } = useParams();
  const recipeId = Number(id);
  const navigate = useNavigate();
  const { username } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRecipe(recipeId)
      .then((result) => {
        if (!cancelled) setRecipe(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  async function handleDelete() {
    if (!recipe) return;
    if (!window.confirm(`Delete “${recipe.title}”? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteRecipe(recipe.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete recipe.");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-stone-500">
        Loading recipe…
      </p>
    );
  }

  if (error && !recipe) {
    return (
      <div className="space-y-4">
        <Alert>{error}</Alert>
        <Link to="/" className="text-sm font-medium text-amber-700 hover:underline">
          ← Back to recipes
        </Link>
      </div>
    );
  }

  if (!recipe) return null;

  const canEdit = username === recipe.author;

  return (
    <article>
      <Link
        to="/"
        className="text-sm font-medium text-amber-700 hover:underline"
      >
        ← Back to recipes
      </Link>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {recipe.category}
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-stone-900">
              {recipe.title}
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              by{" "}
              <span className="font-medium text-stone-700">{recipe.author}</span>{" "}
              · {new Date(recipe.created_at).toLocaleDateString()}
            </p>
          </div>

          {canEdit && (
            <div className="flex gap-2">
              <Link
                to={`/recipes/${recipe.id}/edit`}
                className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
              >
                Edit
              </Link>
              <Button
                type="button"
                variant="danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-y border-stone-100 py-4 text-sm">
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="text-stone-500">Prep time:</span>{" "}
            <span className="font-semibold text-stone-800">
              {recipe.prep_minutes} min
            </span>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <span className="text-stone-500">Servings:</span>{" "}
            <span className="font-semibold text-stone-800">
              {recipe.servings}
            </span>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <section>
            <h2 className="text-lg font-semibold text-stone-900">Ingredients</h2>
            <ul className="mt-3 space-y-2">
              {recipe.ingredients.map((ingredient, index) => (
                <li
                  key={`${index}-${ingredient}`}
                  className="flex items-start gap-2 text-sm text-stone-700"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{ingredient}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-stone-900">
              Instructions
            </h2>
            <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">
              {recipe.instructions}
            </div>
          </section>
        </div>
      </div>
    </article>
  );
}
