import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Recipe } from "../api";
import { useAuth } from "../auth";
import { dangerBtn, ErrorBox, secondaryBtn } from "../ui";

export function RecipePage() {
  const { id = "" } = useParams();
  const { username } = useAuth();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRecipe(null);
    setError("");
    api.get(id).then(setRecipe).catch((e) => setError(e.message));
  }, [id]);

  async function remove() {
    setBusy(true);
    try {
      await api.remove(id);
      navigate("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
      setConfirming(false);
      setBusy(false);
    }
  }

  if (error && !recipe) return <ErrorBox message={error} />;
  if (!recipe) return <p className="text-stone-500">Loading…</p>;
  const mine = username === recipe.author;

  return (
    <article className="space-y-5 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <Link to="/" className="text-sm text-amber-800 underline">
        &larr; All recipes
      </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{recipe.title}</h1>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{recipe.category}</span>
          <span>{recipe.prep_minutes} min prep</span>
          <span>Serves {recipe.servings}</span>
          <span>by {recipe.author}</span>
        </p>
      </header>
      {error && <ErrorBox message={error} />}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Ingredients</h2>
        <ul className="list-disc space-y-1 pl-6">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>{ing}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-lg font-semibold">Instructions</h2>
        <p className="whitespace-pre-line">{recipe.instructions}</p>
      </section>
      {mine && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-stone-200 pt-4">
          <Link to={`/recipes/${recipe.id}/edit`} className={secondaryBtn}>
            Edit
          </Link>
          {confirming ? (
            <>
              <span className="text-sm">Delete this recipe permanently?</span>
              <button type="button" className={dangerBtn} onClick={remove} disabled={busy}>
                Yes, delete
              </button>
              <button type="button" className={secondaryBtn} onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={dangerBtn} onClick={() => setConfirming(true)}>
              Delete
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
