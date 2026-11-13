import { useEffect, useState } from "react";
import { apiRequest, type Recipe } from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function RecipePage({ id }: { id: number }) {
  const { token, username } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRecipe(null);
    setError("");
    apiRequest<Recipe>(`/api/recipes/${id}`)
      .then((data) => {
        if (!cancelled) {
          setRecipe(data);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!recipe) {
      return;
    }
    const confirmed = window.confirm(
      `Delete "${recipe.title}"? This cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    try {
      await apiRequest(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
        token,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete recipe.");
    }
  };

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Loading...</p>
    );
  }

  if (error || !recipe) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="font-medium text-red-700">
          {error || "Recipe not found."}
        </p>
        <a
          href="#/"
          className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline"
        >
          Back to recipes
        </a>
      </div>
    );
  }

  const isAuthor = username !== null && recipe.author === username;

  return (
    <article className="mx-auto max-w-3xl">
      <a
        href="#/"
        className="text-sm font-medium text-amber-700 hover:underline"
      >
        Back to recipes
      </a>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{recipe.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
              {recipe.category}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {recipe.prep_minutes !== null
                ? `${recipe.prep_minutes} min prep`
                : "Prep time n/a"}
            </span>
            {recipe.servings !== null && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                {recipe.servings} servings
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            by <span className="font-medium text-slate-600">{recipe.author}</span>
            {" · "}
            {formatDate(recipe.created_at)}
          </p>
        </div>

        {isAuthor && (
          <div className="flex gap-2">
            <a
              href={`#/edit/${recipe.id}`}
              className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              Edit
            </a>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md border border-red-300 bg-white px-4 py-1.5 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Ingredients</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-700">
          {recipe.ingredients.map((ingredient, index) => (
            <li key={`${index}-${ingredient}`}>{ingredient}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Instructions</h2>
        <div className="mt-3 whitespace-pre-line leading-relaxed text-slate-700">
          {recipe.instructions}
        </div>
      </section>
    </article>
  );
}
