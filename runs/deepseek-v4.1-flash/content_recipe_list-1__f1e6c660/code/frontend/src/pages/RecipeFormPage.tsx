import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  createRecipe,
  getRecipe,
  updateRecipe,
  type Recipe,
  type RecipeInput,
} from "../api";
import { Alert, Button, FieldError, Input } from "../components/ui";
import { useAuth } from "../auth";

interface FormState {
  title: string;
  category: string;
  prep_minutes: string;
  servings: string;
  ingredients: string[];
  instructions: string;
}

const emptyForm: FormState = {
  title: "",
  category: "",
  prep_minutes: "30",
  servings: "2",
  ingredients: [""],
  instructions: "",
};

export default function RecipeFormPage({ mode }: { mode: "create" | "edit" }) {
  const isEdit = mode === "edit";
  const { id } = useParams();
  const recipeId = Number(id);
  const navigate = useNavigate();
  const { username } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [ingredientError, setIngredientError] = useState<string | undefined>();

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    getRecipe(recipeId)
      .then((recipe: Recipe) => {
        if (cancelled) return;
        if (username !== recipe.author) {
          setLoadError("You may only edit your own recipes.");
          setLoading(false);
          return;
        }
        setForm({
          title: recipe.title,
          category: recipe.category,
          prep_minutes: String(recipe.prep_minutes),
          servings: String(recipe.servings),
          ingredients:
            recipe.ingredients.length > 0 ? recipe.ingredients : [""],
          instructions: recipe.instructions,
        });
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, recipeId, username]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function updateIngredient(index: number, value: string) {
    setIngredientError(undefined);
    setForm((current) => {
      const ingredients = [...current.ingredients];
      ingredients[index] = value;
      return { ...current, ingredients };
    });
  }

  function addIngredient() {
    setForm((current) => ({
      ...current,
      ingredients: [...current.ingredients, ""],
    }));
  }

  function removeIngredient(index: number) {
    setForm((current) => {
      if (current.ingredients.length === 1) return { ...current, ingredients: [""] };
      return {
        ...current,
        ingredients: current.ingredients.filter((_, i) => i !== index),
      };
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);

    const numberOrNaN = (value: string) =>
      value.trim() === "" ? Number.NaN : Number(value);

    const payload: RecipeInput = {
      title: form.title,
      category: form.category,
      prep_minutes: numberOrNaN(form.prep_minutes),
      servings: numberOrNaN(form.servings),
      ingredients: form.ingredients
        .map((ingredient) => ingredient.trim())
        .filter((ingredient) => ingredient.length > 0),
      instructions: form.instructions,
    };

    if (payload.ingredients.length === 0) {
      setIngredientError("At least one ingredient is required.");
      setSubmitting(false);
      return;
    }

    try {
      const recipe = isEdit
        ? await updateRecipe(recipeId, payload)
        : await createRecipe(payload);
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = { ...err.fields };
        if (fieldErrors.ingredients) {
          setIngredientError(fieldErrors.ingredients);
          delete fieldErrors.ingredients;
        }
        setErrors(fieldErrors);
        if (!Object.keys(fieldErrors).length) setFormError(err.message);
      } else {
        setFormError("Could not save the recipe. Please try again.");
      }
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-stone-500">
        Loading recipe…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert>{loadError}</Alert>
        <Link
          to="/"
          className="text-sm font-medium text-amber-700 hover:underline"
        >
          ← Back to recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to={isEdit ? `/recipes/${recipeId}` : "/"}
        className="text-sm font-medium text-amber-700 hover:underline"
      >
        ← {isEdit ? "Back to recipe" : "Back to recipes"}
      </Link>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          {isEdit ? "Edit recipe" : "Add a recipe"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {isEdit
            ? "Update the details and save your changes."
            : "Share something delicious with the community."}
        </p>

        {formError && (
          <div className="mt-4">
            <Alert>{formError}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <Input
            label="Title"
            value={form.title}
            onChange={(value) => update("title", value)}
            error={errors.title}
            placeholder="e.g. Weeknight lemon pasta"
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Category"
              value={form.category}
              onChange={(value) => update("category", value)}
              error={errors.category}
              placeholder="Dinner"
            />
            <Input
              label="Prep time (minutes)"
              type="number"
              min={0}
              value={form.prep_minutes}
              onChange={(value) => update("prep_minutes", value)}
              error={errors.prep_minutes}
            />
            <Input
              label="Servings"
              type="number"
              min={1}
              value={form.servings}
              onChange={(value) => update("servings", value)}
              error={errors.servings}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-stone-700">
                Ingredients
              </span>
              <button
                type="button"
                onClick={addIngredient}
                className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
              >
                + Add ingredient
              </button>
            </div>
            <div className="space-y-2">
              {form.ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-right text-xs font-medium text-stone-400">
                    {index + 1}.
                  </span>
                  <input
                    type="text"
                    value={ingredient}
                    onChange={(event) =>
                      updateIngredient(index, event.target.value)
                    }
                    placeholder="e.g. 2 cloves garlic, minced"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    aria-label={`Remove ingredient ${index + 1}`}
                    className="shrink-0 rounded-md border border-stone-300 bg-white px-2.5 py-2 text-sm text-stone-500 transition hover:border-red-300 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <FieldError message={ingredientError} />
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-stone-700">
              Instructions
            </span>
            <textarea
              value={form.instructions}
              onChange={(event) => update("instructions", event.target.value)}
              rows={8}
              placeholder={"One step per line…\nBoil the pasta.\nToss with sauce."}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200 ${
                errors.instructions ? "border-red-400" : "border-stone-300"
              }`}
            />
            <FieldError message={errors.instructions} />
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              to={isEdit ? `/recipes/${recipeId}` : "/"}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-100"
            >
              Cancel
            </Link>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create recipe"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
