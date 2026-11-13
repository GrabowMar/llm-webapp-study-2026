import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { api, ApiError, type RecipePayload } from "../api";
import { ErrorBanner, Spinner } from "../components";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export default function RecipeForm() {
  const { id } = useParams();
  const isEdit = id !== undefined;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("15");
  const [servings, setServings] = useState("4");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    api
      .getRecipe(Number(id))
      .then((r) => {
        setTitle(r.title);
        setCategory(r.category);
        setIngredients(r.ingredients.length ? r.ingredients : [""]);
        setInstructions(r.instructions);
        setPrepMinutes(String(r.prep_minutes));
        setServings(String(r.servings));
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load recipe.")
      )
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function setIngredient(index: number, value: string) {
    setIngredients((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: RecipePayload = {
      title,
      category,
      ingredients: ingredients.map((s) => s.trim()).filter((s) => s.length > 0),
      instructions,
      prep_minutes: Number(prepMinutes),
      servings: Number(servings),
    };
    setBusy(true);
    try {
      if (isEdit) await api.updateRecipe(Number(id), payload);
      else await api.createRecipe(payload);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (loadError)
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={loadError} />
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to={isEdit ? `/recipes/${id}` : "/"}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-amber-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {isEdit ? "Edit recipe" : "Add a recipe"}
      </h1>

      <form
        onSubmit={onSubmit}
        className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div>
          <label className={labelClass}>Title</label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chicken Tikka Masala"
            required
          />
        </div>

        <div>
          <label className={labelClass}>Category</label>
          <input
            className={inputClass}
            list="category-options"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Dinner"
            required
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelClass + " mb-0"}>Ingredients</label>
            <button
              type="button"
              onClick={() => setIngredients((prev) => [...prev, ""])}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add ingredient
            </button>
          </div>
          <div className="space-y-2">
            {ingredients.map((value, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-right text-xs text-slate-400">{i + 1}</span>
                <input
                  className={inputClass}
                  value={value}
                  onChange={(e) => setIngredient(i, e.target.value)}
                  placeholder={`Ingredient ${i + 1}`}
                />
                <button
                  type="button"
                  title="Remove ingredient"
                  disabled={ingredients.length === 1}
                  onClick={() =>
                    setIngredients((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Empty ingredient rows are ignored.
          </p>
        </div>

        <div>
          <label className={labelClass}>Instructions</label>
          <textarea
            className={inputClass + " min-h-40 resize-y"}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="One step per line — line breaks are kept."
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Prep time (minutes)</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Servings</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              required
            />
          </div>
        </div>

        <ErrorBanner message={error} />

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : isEdit ? "Save changes" : "Create recipe"}
          </button>
          <Link
            to={isEdit ? `/recipes/${id}` : "/"}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
