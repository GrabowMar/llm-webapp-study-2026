import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Recipe } from "../api";
import { useAuth } from "../auth";

export default function RecipeDetail() {
  const { id } = useParams();
  const { username } = useAuth();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getRecipe(Number(id))
      .then((r) => {
        if (!cancelled) setRecipe(r);
      })
      .catch(() => {
        if (!cancelled) setError("Recipe not found.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return <p className="text-stone-500">{error}</p>;
  }
  if (!recipe) {
    return <p className="text-stone-500">Loading…</p>;
  }

  const isAuthor = username !== null && username === recipe.author;

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.deleteRecipe(recipe!.id);
      navigate("/");
    } catch {
      setError("Could not delete the recipe.");
      setDeleting(false);
    }
  }

  return (
    <div>
      <Link to="/" className="text-sm text-amber-700 hover:underline">
        ← Back to recipes
      </Link>
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{recipe.title}</h1>
            <p className="mt-2 text-sm text-stone-600">
              <span className="mr-2 rounded bg-amber-100 px-2 py-0.5 text-amber-800">
                {recipe.category}
              </span>
              {recipe.prep_minutes != null && (
                <span className="mr-2">Prep: {recipe.prep_minutes} min</span>
              )}
              {recipe.servings != null && <span>Serves {recipe.servings}</span>}
            </p>
            <p className="mt-1 text-sm text-stone-500">by {recipe.author}</p>
          </div>
          {isAuthor && (
            <div className="flex gap-2">
              <Link
                to={`/recipes/${recipe.id}/edit`}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Edit
              </Link>
              <button
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Ingredients</h2>
            <ul className="list-inside list-disc space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Instructions</h2>
            <p className="whitespace-pre-line">{recipe.instructions}</p>
          </section>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold">Delete recipe?</h3>
            <p className="mt-2 text-sm text-stone-600">
              This will permanently delete “{recipe.title}”. This cannot be undone.
            </p>
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
