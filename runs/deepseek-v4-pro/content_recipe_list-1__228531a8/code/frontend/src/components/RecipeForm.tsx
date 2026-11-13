import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type RecipeInput } from "../api";
import { useAuth } from "../auth";

interface FormState {
  title: string;
  category: string;
  prep_minutes: string;
  servings: string;
  instructions: string;
  ingredients: string[];
}

function toInput(state: FormState): RecipeInput {
  return {
    title: state.title,
    category: state.category,
    prep_minutes: state.prep_minutes.trim() === "" ? null : Number(state.prep_minutes),
    servings: state.servings.trim() === "" ? null : Number(state.servings),
    instructions: state.instructions,
    ingredients: state.ingredients.map((s) => s.trim()).filter((s) => s !== ""),
  };
}

export default function RecipeForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const { username } = useAuth();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<string[]>([
    "Breakfast",
    "Main",
    "Dessert",
    "Soup",
    "Salad",
  ]);
  const [state, setState] = useState<FormState>({
    title: "",
    category: "",
    prep_minutes: "",
    servings: "",
    instructions: "",
    ingredients: [""],
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(!editing);

  useEffect(() => {
    api.categories().then((r) => {
      if (r.categories.length) setCategories(r.categories);
    });
  }, []);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    api
      .getRecipe(Number(id))
      .then((r) => {
        if (cancelled) return;
        if (username === null || r.author !== username) {
          setError("You may only edit your own recipes.");
          return;
        }
        setState({
          title: r.title,
          category: r.category,
          prep_minutes: r.prep_minutes != null ? String(r.prep_minutes) : "",
          servings: r.servings != null ? String(r.servings) : "",
          instructions: r.instructions,
          ingredients: r.ingredients.length ? r.ingredients : [""],
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("Recipe not found.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, editing, username]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function setIngredient(index: number, value: string) {
    setState((s) => {
      const next = [...s.ingredients];
      next[index] = value;
      return { ...s, ingredients: next };
    });
  }

  function addIngredient() {
    setState((s) => ({ ...s, ingredients: [...s.ingredients, ""] }));
  }

  function removeIngredient(index: number) {
    setState((s) => ({
      ...s,
      ingredients: s.ingredients.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const input = toInput(state);
    try {
      if (editing) {
        await api.updateRecipe(Number(id), input);
      } else {
        await api.createRecipe(input);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  if (!username) {
    return (
      <p className="text-stone-600">
        You must <span className="font-medium">sign in</span> to{" "}
        {editing ? "edit" : "add"} recipes.
      </p>
    );
  }

  if (error && !ready) {
    return <p className="text-red-700">{error}</p>;
  }

  if (!ready) {
    return <p className="text-stone-500">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">
        {editing ? "Edit recipe" : "Add a recipe"}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Title</label>
          <input
            value={state.title}
            onChange={(e) => setField("title", e.target.value)}
            className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              list="category-options"
              value={state.category}
              onChange={(e) => setField("category", e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Prep (minutes)</label>
            <input
              type="number"
              min="0"
              value={state.prep_minutes}
              onChange={(e) => setField("prep_minutes", e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Servings</label>
            <input
              type="number"
              min="0"
              value={state.servings}
              onChange={(e) => setField("servings", e.target.value)}
              className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Ingredients</label>
          <div className="space-y-2">
            {state.ingredients.map((ing, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={ing}
                  onChange={(e) => setIngredient(i, e.target.value)}
                  placeholder="Ingredient"
                  className="flex-1 rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  disabled={state.ingredients.length === 1}
                  className="rounded-md border border-stone-300 px-3 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addIngredient}
            className="mt-2 text-sm text-amber-700 hover:underline"
          >
            + Add ingredient
          </button>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Instructions</label>
          <textarea
            value={state.instructions}
            onChange={(e) => setField("instructions", e.target.value)}
            rows={6}
            className="w-full rounded-md border border-stone-300 px-3 py-2 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : editing ? "Save changes" : "Add recipe"}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-100"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
