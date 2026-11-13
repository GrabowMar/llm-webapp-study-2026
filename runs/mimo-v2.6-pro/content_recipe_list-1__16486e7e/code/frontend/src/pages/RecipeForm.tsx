import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import type { RecipeInput } from "../types";

export default function RecipeForm() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const editing = editingId !== null;
  const { signedIn } = useAuth();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.listCategories().then((res) => setCategories(res.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    setLoading(true);
    api.getRecipe(editingId)
      .then((recipe) => {
        if (cancelled) return;
        setTitle(recipe.title);
        setCategory(recipe.category);
        setPrepMinutes(String(recipe.prep_minutes));
        setServings(String(recipe.servings));
        setIngredients(recipe.ingredients.length > 0 ? [...recipe.ingredients] : [""]);
        setInstructions(recipe.instructions);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the recipe");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, editingId]);

  function setIngredient(index: number, value: string) {
    setIngredients((prev) => prev.map((item, i) => (i === index ? value : item)));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, ""]);
  }

  function removeIngredient(index: number) {
    setIngredients((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [""]));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors({});

    const payload: RecipeInput = {
      title,
      ingredients: ingredients.map((item) => item.trim()).filter((item) => item.length > 0),
      instructions,
      category,
      prep_minutes: prepMinutes.trim() === "" ? Number.NaN : Number(prepMinutes),
      servings: servings.trim() === "" ? Number.NaN : Number(servings),
    };

    try {
      const recipe = editing
        ? await api.updateRecipe(editingId, payload)
        : await api.createRecipe(payload);
      navigate(`/recipes/${recipe.id}`);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.errors);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setSaving(false);
    }
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-10 text-center">
        <h1 className="text-2xl font-bold text-stone-900">
          {editing ? "Edit recipe" : "Add a recipe"}
        </h1>
        <p className="mt-2 text-stone-600">You need to be signed in to do this.</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link
            to="/signin"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Register
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="py-10 text-center text-stone-500">Loading recipe...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold text-stone-900">
        {editing ? "Edit recipe" : "Add a recipe"}
      </h1>
      <p className="mt-1 text-stone-600">
        {editing
          ? "Update the fields below and save your changes."
          : "Share something delicious with everyone."}
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-5 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {Object.entries(fieldErrors).map(([field, message]) => (
                  <li key={field}>
                    <span className="font-medium">{field}:</span> {message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-stone-700">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div>
          <label htmlFor="recipe-category" className="block text-sm font-medium text-stone-700">
            Category
          </label>
          <input
            id="recipe-category"
            type="text"
            list="known-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Dessert"
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
          <datalist id="known-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="prep" className="block text-sm font-medium text-stone-700">
              Prep time (minutes)
            </label>
            <input
              id="prep"
              type="number"
              min={0}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <div>
            <label htmlFor="servings" className="block text-sm font-medium text-stone-700">
              Servings
            </label>
            <input
              id="servings"
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Ingredients</legend>
          <div className="mt-2 space-y-2">
            {ingredients.map((ingredient, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ingredient}
                  onChange={(e) => setIngredient(index, e.target.value)}
                  placeholder={`Ingredient ${index + 1}`}
                  aria-label={`Ingredient ${index + 1}`}
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  className="shrink-0 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-3 rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Add ingredient
          </button>
        </fieldset>

        <div>
          <label htmlFor="instructions" className="block text-sm font-medium text-stone-700">
            Instructions
          </label>
          <textarea
            id="instructions"
            rows={8}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="One step per line..."
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Save changes" : "Create recipe"}
          </button>
          <Link
            to={editing ? `/recipes/${editingId}` : "/"}
            className="rounded-md border border-stone-300 bg-white px-5 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
