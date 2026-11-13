import { Link } from "react-router-dom";
import type { RecipeSummary } from "../api";

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="group flex h-full flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            {recipe.category}
          </span>
          <span className="text-xs font-medium text-stone-500">
            {recipe.prep_minutes} min
          </span>
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-snug text-stone-900 group-hover:text-amber-700">
          {recipe.title}
        </h2>
      </div>
      <p className="mt-4 text-sm text-stone-500">
        by <span className="font-medium text-stone-700">{recipe.author}</span>
      </p>
    </Link>
  );
}
