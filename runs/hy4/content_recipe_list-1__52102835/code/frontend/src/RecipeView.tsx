import { useEffect, useState } from "react";
import { api, ApiError, type Recipe } from "./api";
import {
  Banner,
  ConfirmDialog,
  dangerBtn,
  secondaryBtn,
  Spinner,
} from "./ui";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function RecipeView({
  id,
  username,
  onBack,
  onEdit,
  onDeleted,
  onSignIn,
}: {
  id: number;
  username: string | null;
  onBack: () => void;
  onEdit: (id: number) => void;
  onDeleted: () => void;
  onSignIn: () => void;
}) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .getRecipe(id)
      .then(setRecipe)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Could not load the recipe.");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.deleteRecipe(id);
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete the recipe.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (loading) return <Spinner label="Loading recipe…" />;

  if (error || !recipe) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10">
        <Banner>{error || "Recipe not found."}</Banner>
        <button type="button" className={secondaryBtn} onClick={onBack}>
          ← Back to recipes
        </button>
      </div>
    );
  }

  const isAuthor = username !== null && username.toLowerCase() === recipe.author.toLowerCase();

  return (
    <>
      <article className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 text-sm font-semibold text-amber-700 hover:underline"
        >
          ← Back to recipes
        </button>

        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-9">
          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-800">
            {recipe.category}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight text-stone-900">
            {recipe.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-stone-100 pb-6 text-sm text-stone-500">
            <span>
              By <span className="font-semibold text-stone-700">{recipe.author}</span>
            </span>
            <span>⏱ {recipe.prep_minutes} min prep</span>
            <span>🍽 Serves {recipe.servings}</span>
            <span>{formatDate(recipe.created_at)}</span>
          </div>

          <div className="mt-7">
            <h2 className="text-xl font-bold text-stone-900">Ingredients</h2>
            <ul className="mt-3 space-y-2">
              {recipe.ingredients.map((ingredient, index) => (
                <li key={`${index}-${ingredient}`} className="flex items-start gap-3 text-stone-700">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500"
                  />
                  <span>{ingredient}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-9">
            <h2 className="text-xl font-bold text-stone-900">Instructions</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-stone-700">
              {recipe.instructions.split("\n").map((line, index) => (
                <p key={index} className={line.trim() ? "" : "h-2"}>
                  {line || "\u00A0"}
                </p>
              ))}
            </div>
          </div>

          {isAuthor && (
            <div className="mt-9 flex flex-wrap gap-2 border-t border-stone-100 pt-6">
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => onEdit(recipe.id)}
              >
                Edit recipe
              </button>
              <button
                type="button"
                className={dangerBtn}
                onClick={() => setConfirming(true)}
              >
                Delete recipe
              </button>
            </div>
          )}
          {!username && (
            <p className="mt-8 border-t border-stone-100 pt-5 text-sm text-stone-500">
              Want to share a recipe of your own?{" "}
              <button
                type="button"
                onClick={onSignIn}
                className="font-semibold text-amber-700 underline-offset-2 hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </article>

      {deleteError && (
        <div className="mx-auto mt-4 max-w-3xl">
          <Banner>{deleteError}</Banner>
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete this recipe?"
          message={`“${recipe.title}” will be permanently removed. This cannot be undone.`}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
