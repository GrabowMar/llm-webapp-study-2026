import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  apiRequest,
  type FieldErrors,
  type Recipe,
} from "../api";
import { useAuth } from "../auth";
import { navigate } from "../router";
import FieldErrorMessages from "../components/FieldErrors";

function toApiNumber(raw: string): number | string | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : trimmed;
}

export default function RecipeFormPage({ id }: { id?: number } = {}) {
  const { token } = useAuth();
  const isEdit = id !== undefined;

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [prepMinutes, setPrepMinutes] = useState("");
  const [servings, setServings] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest<{ items: string[] }>("/api/categories")
      .then((data) => {
        if (!cancelled) {
          setCategories(data.items);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (id === undefined) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiRequest<Recipe>(`/api/recipes/${id}`, { token })
      .then((recipe) => {
        if (cancelled) {
          return;
        }
        setTitle(recipe.title);
        setCategory(recipe.category);
        setPrepMinutes(
          recipe.prep_minutes !== null ? String(recipe.prep_minutes) : "",
        );
        setServings(
          recipe.servings !== null ? String(recipe.servings) : "",
        );
        setIngredients(
          recipe.ingredients.length > 0 ? [...recipe.ingredients] : [""],
        );
        setInstructions(recipe.instructions);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message);
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
  }, [id, token]);

  const setIngredient = (index: number, value: string) => {
    setIngredients((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    );
  };

  const addIngredient = () => {
    setIngredients((current) => [...current, ""]);
  };

  const removeIngredient = (index: number) => {
    setIngredients((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError("");

    const payload = {
      title,
      category,
      ingredients,
      instructions,
      prep_minutes: toApiNumber(prepMinutes),
      servings: toApiNumber(servings),
    };

    try {
      const saved = await apiRequest<Recipe>(
        isEdit ? `/api/recipes/${id}` : "/api/recipes",
        { method: isEdit ? "PUT" : "POST", body: payload, token },
      );
      navigate(`/recipes/${saved.id}`);
    } catch (err) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(0, err instanceof Error ? err.message : "Save failed.");
      setFieldErrors(apiError.errors);
      setFormError(apiError.message);
      if (apiError.status === 401) {
        setFormError("Your session has expired. Please sign in again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="py-16 text-center text-sm text-slate-500">Loading...</p>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 px-6 py-8 text-center">
        <p className="font-medium text-red-700">{loadError}</p>
        <a
          href="#/"
          className="mt-3 inline-block text-sm font-medium text-amber-700 hover:underline"
        >
          Back to recipes
        </a>
      </div>
    );
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {isEdit ? "Edit recipe" : "Add a recipe"}
      </h1>

      {formError && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {formError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="recipe-title"
            className="block text-sm font-medium text-slate-700"
          >
            Title
          </label>
          <input
            id="recipe-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Classic Tomato Soup"
            className={inputClass}
          />
          <FieldErrorMessages messages={fieldErrors.title} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="recipe-category"
              className="block text-sm font-medium text-slate-700"
            >
              Category
            </label>
            <input
              id="recipe-category"
              type="text"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="e.g. Dessert"
              list="category-suggestions"
              className={inputClass}
            />
            <datalist id="category-suggestions">
              {categories.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
            <FieldErrorMessages messages={fieldErrors.category} />
          </div>

          <div>
            <label
              htmlFor="recipe-prep"
              className="block text-sm font-medium text-slate-700"
            >
              Prep minutes
            </label>
            <input
              id="recipe-prep"
              type="number"
              min="0"
              value={prepMinutes}
              onChange={(event) => setPrepMinutes(event.target.value)}
              placeholder="e.g. 30"
              className={inputClass}
            />
            <FieldErrorMessages messages={fieldErrors.prep_minutes} />
          </div>

          <div>
            <label
              htmlFor="recipe-servings"
              className="block text-sm font-medium text-slate-700"
            >
              Servings
            </label>
            <input
              id="recipe-servings"
              type="number"
              min="0"
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              placeholder="e.g. 4"
              className={inputClass}
            />
            <FieldErrorMessages messages={fieldErrors.servings} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">
              Ingredients
            </label>
            <button
              type="button"
              onClick={addIngredient}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              Add ingredient
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {ingredients.map((ingredient, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs text-slate-400">
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={ingredient}
                  onChange={(event) => setIngredient(index, event.target.value)}
                  placeholder="e.g. 2 cups flour"
                  aria-label={`Ingredient ${index + 1}`}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(index)}
                  aria-label={`Remove ingredient ${index + 1}`}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
            {ingredients.length === 0 && (
              <p className="text-sm text-slate-500">
                No ingredients yet. Add the first one.
              </p>
            )}
          </div>
          <FieldErrorMessages messages={fieldErrors.ingredients} />
        </div>

        <div>
          <label
            htmlFor="recipe-instructions"
            className="block text-sm font-medium text-slate-700"
          >
            Instructions
          </label>
          <textarea
            id="recipe-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={8}
            placeholder={"Mix the ingredients.\nBake for 20 minutes."}
            className={`${inputClass} font-mono leading-relaxed`}
          />
          <FieldErrorMessages messages={fieldErrors.instructions} />
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Save changes" : "Create recipe"}
          </button>
          <a
            href={isEdit ? `#/recipes/${id}` : "#/"}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </a>
        </div>
      </form>
    </div>
  );
}
