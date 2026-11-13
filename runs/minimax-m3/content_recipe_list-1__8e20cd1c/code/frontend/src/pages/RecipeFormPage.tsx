import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import RecipeForm from "../components/RecipeForm";
import type { Recipe, RecipeInput } from "../types";

interface RecipeFormPageProps {
  mode: "create" | "edit";
}

export default function RecipeFormPage({ mode }: RecipeFormPageProps) {
  const { id } = useParams();
  const recipeId = Number(id);
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .categories()
      .then((list) => setCategories(list.map((entry) => entry.category)))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (ready && !user) navigate("/signin", { replace: true });
  }, [ready, user, navigate]);

  useEffect(() => {
    if (mode !== "edit") return;
    let active = true;
    api
      .getRecipe(recipeId)
      .then((result) => {
        if (!active) return;
        setRecipe(result);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Could not load this recipe.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, recipeId]);

  const handleSubmit = async (input: RecipeInput) => {
    if (mode === "create") {
      const created = await api.createRecipe(input);
      navigate(`/recipes/${created.id}`);
      return;
    }
    const updated = await api.updateRecipe(recipeId, input);
    navigate(`/recipes/${updated.id}`);
  };

  if (mode === "edit" && loading) {
    return <p className="text-sm text-stone-500">Loading recipe...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/" className="w-fit text-sm font-medium text-amber-700 hover:underline">
          Back to all recipes
        </Link>
        <h1 className="font-display text-3xl font-bold text-stone-900">
          {mode === "create" ? "Add a recipe" : "Edit recipe"}
        </h1>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <RecipeForm
        initial={mode === "edit" ? recipe : null}
        categories={categories}
        submitLabel={mode === "create" ? "Publish recipe" : "Save changes"}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
