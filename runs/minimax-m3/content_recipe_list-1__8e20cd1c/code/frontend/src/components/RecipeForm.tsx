import { useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api";
import type { Recipe, RecipeInput } from "../types";
import TextField from "./TextField";

interface RecipeFormProps {
  initial?: Recipe | null;
  categories: string[];
  submitLabel: string;
  onSubmit: (input: RecipeInput) => Promise<void>;
}

export default function RecipeForm({ initial, categories, submitLabel, onSubmit }: RecipeFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [prepMinutes, setPrepMinutes] = useState(String(initial?.prep_minutes ?? 30));
  const [servings, setServings] = useState(String(initial?.servings ?? 2));
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [ingredients, setIngredients] = useState<string[]>(
    initial && initial.ingredients.length > 0 ? [...initial.ingredients] : [""],
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateIngredient = (index: number, value: string) => {
    setIngredients((current) => current.map((item, position) => (position === index ? value : item)));
  };

  const removeIngredient = (index: number) => {
    setIngredients((current) =>
      current.length === 1 ? [""] : current.filter((_, position) => position !== index),
    );
  };

  const addIngredient = () => {
    setIngredients((current) => [...current, ""]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});
    setSaving(true);

    const input: RecipeInput = {
      title: title.trim(),
      ingredients: ingredients.map((item) => item.trim()).filter((item) => item.length > 0),
      instructions,
      category: category.trim(),
      prep_minutes: prepMinutes.trim() === "" ? 0 : Number(prepMinutes),
      servings: servings.trim() === "" ? 0 : Number(servings),
    };

    try {
      await onSubmit(input);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors);
        setFormError(Object.keys(error.fieldErrors).length > 0 ? null : error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      {formError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {formError}
        </p>
      ) : null}

      <TextField
        id="title"
        label="Title"
        value={title}
        onChange={setTitle}
        error={fieldErrors.title}
        placeholder="Roasted tomato soup"
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <TextField
          id="category"
          label="Category"
          value={category}
          onChange={setCategory}
          error={fieldErrors.category}
          placeholder="Dinner"
          list="category-options"
        />
        <TextField
          id="prep_minutes"
          label="Prep minutes"
          type="number"
          min={0}
          value={prepMinutes}
          onChange={setPrepMinutes}
          error={fieldErrors.prep_minutes}
        />
        <TextField
          id="servings"
          label="Servings"
          type="number"
          min={1}
          value={servings}
          onChange={setServings}
          error={fieldErrors.servings}
        />
      </div>

      <datalist id="category-options">
        {categories.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-stone-700">Ingredients</span>
          <button
            type="button"
            onClick={addIngredient}
            className="rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
          >
            Add ingredient
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {ingredients.map((ingredient, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                aria-label={`Ingredient ${index + 1}`}
                value={ingredient}
                onChange={(event) => updateIngredient(index, event.target.value)}
                placeholder="200 g flour"
                className={`w-full rounded-lg border px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 ${
                  fieldErrors.ingredients ? "border-red-400 bg-red-50" : "border-stone-300 bg-white"
                }`}
              />
              <button
                type="button"
                onClick={() => removeIngredient(index)}
                aria-label={`Remove ingredient ${index + 1}`}
                className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-red-300 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {fieldErrors.ingredients ? (
          <p className="text-xs font-medium text-red-600">{fieldErrors.ingredients}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="instructions" className="text-sm font-medium text-stone-700">
          Instructions
        </label>
        <textarea
          id="instructions"
          name="instructions"
          rows={8}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          aria-invalid={fieldErrors.instructions ? true : undefined}
          placeholder={"Chop the onions.\nSimmer for 20 minutes."}
          className={`rounded-lg border px-3 py-2 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-200 ${
            fieldErrors.instructions ? "border-red-400 bg-red-50" : "border-stone-300 bg-white"
          }`}
        />
        <p className="text-xs text-stone-500">Each line break starts a new step.</p>
        {fieldErrors.instructions ? (
          <p className="text-xs font-medium text-red-600">{fieldErrors.instructions}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
