import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type ApiErrors, type Recipe } from "./api";
import {
  Banner,
  FieldError,
  inputClass,
  labelClass,
  primaryBtn,
  secondaryBtn,
  Spinner,
} from "./ui";

type FormState = {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: string;
  servings: string;
};

const emptyForm: FormState = {
  title: "",
  ingredients: [""],
  instructions: "",
  category: "",
  prep_minutes: "0",
  servings: "1",
};

function toForm(recipe: Recipe): FormState {
  return {
    title: recipe.title,
    ingredients: recipe.ingredients.length ? [...recipe.ingredients] : [""],
    instructions: recipe.instructions,
    category: recipe.category,
    prep_minutes: String(recipe.prep_minutes),
    servings: String(recipe.servings),
  };
}

export function RecipeForm({
  recipeId,
  categories,
  onCancel,
  onSaved,
}: {
  recipeId: number | null;
  categories: string[];
  onCancel: () => void;
  onSaved: (id: number) => void;
}) {
  const isEdit = recipeId !== null;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<ApiErrors>({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (recipeId === null) {
      setForm(emptyForm);
      return;
    }
    setLoading(true);
    api
      .getRecipe(recipeId)
      .then((recipe) => setForm(toForm(recipe)))
      .catch((err: unknown) => {
        setLoadError(err instanceof ApiError ? err.message : "Could not load the recipe.");
      })
      .finally(() => setLoading(false));
  }, [recipeId]);

  const update = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((current) => ({ ...current, [field]: value }));
      setErrors((current) => {
        if (!(field in current)) return current;
        const next = { ...current };
        delete next[field as string];
        return next;
      });
    },
    [],
  );

  function setIngredient(index: number, value: string) {
    setForm((current) => ({
      ...current,
      ingredients: current.ingredients.map((item, i) => (i === index ? value : item)),
    }));
    setErrors((current) => {
      if (!current.ingredients) return current;
      const next = { ...current };
      delete next.ingredients;
      return next;
    });
  }

  function addIngredient() {
    setForm((current) => ({ ...current, ingredients: [...current.ingredients, ""] }));
  }

  function removeIngredient(index: number) {
    setForm((current) => ({
      ...current,
      ingredients:
        current.ingredients.length > 1
          ? current.ingredients.filter((_, i) => i !== index)
          : [""],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setGeneral("");
    const payload = {
      title: form.title,
      ingredients: form.ingredients,
      instructions: form.instructions,
      category: form.category,
      prep_minutes: Number(form.prep_minutes),
      servings: Number(form.servings),
    };
    try {
      const saved =
        recipeId === null
          ? await api.createRecipe(payload)
          : await api.updateRecipe(recipeId, payload);
      onSaved(saved.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.errors);
        setGeneral(err.message);
        if (err.status === 401) setGeneral("Your session has expired. Please sign in again.");
      } else {
        setGeneral("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading form…" />;

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <Banner>{loadError}</Banner>
        <button type="button" className={secondaryBtn} onClick={onCancel}>
          ← Back to recipes
        </button>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl">
      <button
        type="button"
        onClick={onCancel}
        className="mb-5 text-sm font-semibold text-amber-700 hover:underline"
      >
        ← Back to recipes
      </button>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-stone-900">
          {isEdit ? "Edit recipe" : "Add a recipe"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {isEdit
            ? "Update the details below and save your changes."
            : "Share something delicious with everyone."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
          {general && <Banner>{general}</Banner>}

          <div>
            <label className={labelClass} htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className={inputClass}
              value={form.title}
              onChange={(event) => update("title", event.target.value)}
              placeholder="e.g. Grandma's apple pie"
            />
            <FieldError message={errors.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="category">
                Category
              </label>
              <input
                id="category"
                className={inputClass}
                list="category-options"
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="e.g. Dessert"
              />
              <datalist id="category-options">
                {categories.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <FieldError message={errors.category} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="prep_minutes">
                  Prep (min)
                </label>
                <input
                  id="prep_minutes"
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  value={form.prep_minutes}
                  onChange={(event) => update("prep_minutes", event.target.value)}
                />
                <FieldError message={errors.prep_minutes} />
              </div>
              <div>
                <label className={labelClass} htmlFor="servings">
                  Servings
                </label>
                <input
                  id="servings"
                  type="number"
                  min="0"
                  step="1"
                  className={inputClass}
                  value={form.servings}
                  onChange={(event) => update("servings", event.target.value)}
                />
                <FieldError message={errors.servings} />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className={labelClass + " mb-0"}>Ingredients</span>
              <button
                type="button"
                onClick={addIngredient}
                className="text-sm font-semibold text-amber-700 hover:underline"
              >
                + Add ingredient
              </button>
            </div>
            <p className="mb-2 text-xs text-stone-400">
              Ingredients are kept in the order you enter them.
            </p>
            <div className="space-y-2">
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-xs font-semibold text-stone-400">
                    {index + 1}
                  </span>
                  <input
                    className={inputClass}
                    value={ingredient}
                    onChange={(event) => setIngredient(index, event.target.value)}
                    placeholder={`Ingredient ${index + 1}`}
                    aria-label={`Ingredient ${index + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    aria-label={`Remove ingredient ${index + 1}`}
                    className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-2 text-sm font-bold text-stone-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <FieldError message={errors.ingredients} />
          </div>

          <div>
            <label className={labelClass} htmlFor="instructions">
              Instructions
            </label>
            <textarea
              id="instructions"
              rows={7}
              className={`${inputClass} resize-y leading-relaxed`}
              value={form.instructions}
              onChange={(event) => update("instructions", event.target.value)}
              placeholder={"One step per line.\nLine breaks are preserved."}
            />
            <p className="mt-1 text-xs text-stone-400">Line breaks will be kept.</p>
            <FieldError message={errors.instructions} />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-stone-100 pt-5">
            <button type="button" className={secondaryBtn} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={primaryBtn} disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add recipe"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
