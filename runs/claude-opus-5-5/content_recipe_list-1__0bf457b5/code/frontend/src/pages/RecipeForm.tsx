import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, type RecipeInput } from "../api";
import { useAuth } from "../auth";
import { Link, navigate } from "../router";
import {
  ErrorBanner,
  Field,
  Spinner,
  inputClass,
  primaryButton,
  secondaryButton,
} from "../ui";

type Row = { key: number; text: string };

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export default function RecipeForm({ id }: { id?: number }) {
  const { username } = useAuth();
  const editing = id !== undefined;
  const nextKey = useRef(1);
  const newRow = (text = ""): Row => ({ key: nextKey.current++, text });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [prep, setPrep] = useState("");
  const [servings, setServings] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .categories()
      .then((r) => setCategories(r.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    setLoading(true);
    api
      .getRecipe(id)
      .then((r) => {
        if (cancelled) return;
        setTitle(r.title);
        setCategory(r.category);
        setPrep(String(r.prep_minutes));
        setServings(String(r.servings));
        setInstructions(r.instructions);
        setRows(r.ingredients.length ? r.ingredients.map((t) => newRow(t)) : [newRow()]);
        if (username && r.author.toLowerCase() !== username.toLowerCase()) {
          setError("Only the author can edit this recipe.");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load recipe.");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateRow = (key: number, text: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, text } : r)));
  const removeRow = (key: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : [newRow()]));
  const moveRow = (index: number, delta: number) =>
    setRows((rs) => {
      const target = index + delta;
      if (target < 0 || target >= rs.length) return rs;
      const copy = [...rs];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  const addRow = () => setRows((rs) => [...rs, newRow()]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});
    const input: RecipeInput = {
      title,
      category,
      instructions,
      prep_minutes: toNumber(prep),
      servings: toNumber(servings),
      ingredients: rows.map((r) => r.text).filter((t) => t.trim() !== ""),
    };
    try {
      const saved = id !== undefined ? await api.updateRecipe(id, input) : await api.createRecipe(input);
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fieldErrors);
        setError(
          err.status === 401
            ? "Your session has expired. Please sign in again."
            : Object.keys(err.fieldErrors).length
              ? "Please fix the highlighted fields."
              : err.message,
        );
      } else {
        setError("Something went wrong.");
      }
      setSaving(false);
    }
  };

  if (!username) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <p className="mb-4 text-stone-700">You need to sign in to {editing ? "edit" : "add"} recipes.</p>
        <Link to="/login" className={primaryButton}>
          Sign in
        </Link>
      </div>
    );
  }

  if (loading) return <Spinner />;

  const errClass = (name: string) => (fieldErrors[name] ? " border-red-400" : "");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold text-stone-900">
        {editing ? "Edit recipe" : "Add a recipe"}
      </h1>
      <form
        onSubmit={submit}
        noValidate
        className="space-y-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
      >
        <ErrorBanner message={error} />

        <Field label="Title" htmlFor="title" error={fieldErrors.title}>
          <input
            id="title"
            className={inputClass + errClass("title")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category" htmlFor="category" error={fieldErrors.category}>
            <input
              id="category"
              list="category-options"
              className={inputClass + errClass("category")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Dessert"
            />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Prep time (minutes)" htmlFor="prep" error={fieldErrors.prep_minutes}>
            <input
              id="prep"
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className={inputClass + errClass("prep_minutes")}
              value={prep}
              onChange={(e) => setPrep(e.target.value)}
            />
          </Field>
          <Field label="Servings" htmlFor="servings" error={fieldErrors.servings}>
            <input
              id="servings"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className={inputClass + errClass("servings")}
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 block text-sm font-medium text-stone-700">Ingredients</legend>
          <ol className="space-y-2">
            {rows.map((row, i) => (
              <li key={row.key} className="flex items-center gap-2">
                <span className="w-6 text-right text-sm text-stone-400">{i + 1}.</span>
                <input
                  aria-label={`Ingredient ${i + 1}`}
                  className={inputClass + errClass("ingredients")}
                  value={row.text}
                  onChange={(e) => updateRow(row.key, e.target.value)}
                  placeholder="e.g. 200 g flour"
                />
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  onClick={() => moveRow(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ingredient ${i + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30"
                  onClick={() => moveRow(i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label={`Move ingredient ${i + 1} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                  onClick={() => removeRow(row.key)}
                  aria-label={`Remove ingredient ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className={secondaryButton} onClick={addRow}>
            + Add ingredient
          </button>
          {fieldErrors.ingredients && (
            <p className="text-sm text-red-600" role="alert">
              {fieldErrors.ingredients}
            </p>
          )}
        </fieldset>

        <Field label="Instructions" htmlFor="instructions" error={fieldErrors.instructions}>
          <textarea
            id="instructions"
            rows={8}
            className={inputClass + errClass("instructions")}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="One step per line"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Link to={editing ? `/recipes/${id}` : "/"} className={secondaryButton}>
            Cancel
          </Link>
          <button type="submit" className={primaryButton} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add recipe"}
          </button>
        </div>
      </form>
    </div>
  );
}
