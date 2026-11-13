import { Link } from "react-router-dom";
import type { RecipeSummary } from "../types";

export default function RecipeCard({ recipe }: { recipe: RecipeSummary }) {
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-stone-900">
          <Link to={`/recipes/${recipe.id}`} className="hover:text-amber-700">
            {recipe.title}
          </Link>
        </h2>
        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          {recipe.category}
        </span>
      </div>
      <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
        <span>
          <span className="font-medium text-stone-500">Prep</span> {recipe.prep_minutes} min
        </span>
        <span>
          <span className="font-medium text-stone-500">By</span> {recipe.author}
        </span>
      </div>
    </article>
  );
}
