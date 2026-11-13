import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, Field, inputCls, primaryBtn, secondaryBtn } from "../ui";

export function RecipeForm() {
  const { id } = useParams();
  const editing = id !== undefined;
  const navigate = useNavigate();
  const { username, signOut } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [prep, setPrep] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api
      .get(id)
      .then((r) => {
        if (r.author !== username) {
          setError("Only the author may edit this recipe");
          return;
        }
        setTitle(r.title);
        setCategory(r.category);
        setPrep(String(r.prep_minutes));
        setServings(String(r.servings));
        setIngredients(r.ingredients.length ? r.ingredients : [""]);
        setInstructions(r.instructions);
        setLoading(false);
      })
      .catch((e) => setError(e.message));
  }, [id, editing, username]);

  function toNumber(s: string): number | null {
    return /^\s*\d+\s*$/.test(s) ? Number(s) : null;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setFields({});
    setBusy(true);
    const input = {
      title,
      category,
      prep_minutes: toNumber(prep),
      servings: toNumber(servings),
      ingredients: ingredients.filter((i) => i.trim() !== ""),
      instructions,
    };
    try {
      const saved = editing ? await api.update(id, input) : await api.create(input);
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          signOut();
          navigate("/login");
          return;
        }
        setFields(err.fields);
        setError(Object.keys(err.fields).length ? "" : err.message);
      } else {
        setError("Something went wrong");
      }
      setBusy(false);
    }
  }

  const setIngredient = (i: number, v: string) => setIngredients(ingredients.map((x, j) => (j === i ? v : x)));

  if (loading) return error ? <ErrorBox message={error} /> : <p className="text-stone-500">Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold">{editing ? "Edit recipe" : "Add a recipe"}</h1>
      {error && <ErrorBox message={error} />}
      <Field label="Title" htmlFor="title" error={fields.title}>
        <input id="title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category" htmlFor="category" error={fields.category}>
          <input id="category" className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Prep time (minutes)" htmlFor="prep" error={fields.prep_minutes}>
          <input id="prep" inputMode="numeric" className={inputCls} value={prep} onChange={(e) => setPrep(e.target.value)} />
        </Field>
        <Field label="Servings" htmlFor="servings" error={fields.servings}>
          <input id="servings" inputMode="numeric" className={inputCls} value={servings} onChange={(e) => setServings(e.target.value)} />
        </Field>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-700">Ingredients</legend>
        {ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2">
            <input aria-label={`Ingredient ${i + 1}`} className={inputCls} value={ing} onChange={(e) => setIngredient(i, e.target.value)} />
            <button
              type="button"
              className={secondaryBtn}
              aria-label={`Remove ingredient ${i + 1}`}
              onClick={() => setIngredients(ingredients.length > 1 ? ingredients.filter((_, j) => j !== i) : [""])}
            >
              Remove
            </button>
          </div>
        ))}
        {fields.ingredients && (
          <p role="alert" className="text-sm text-red-700">
            {fields.ingredients}
          </p>
        )}
        <button type="button" className={secondaryBtn} onClick={() => setIngredients([...ingredients, ""])}>
          Add ingredient
        </button>
      </fieldset>
      <Field label="Instructions" htmlFor="instructions" error={fields.instructions}>
        <textarea id="instructions" rows={8} className={inputCls} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </Field>
      <div className="flex gap-3">
        <button type="submit" className={primaryBtn} disabled={busy}>
          {editing ? "Save changes" : "Add recipe"}
        </button>
        <Link to={editing ? `/recipes/${id}` : "/"} className={secondaryBtn}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
