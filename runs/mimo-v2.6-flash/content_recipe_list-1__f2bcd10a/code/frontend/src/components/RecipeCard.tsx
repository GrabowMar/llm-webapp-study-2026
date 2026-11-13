import type { RecipeListItem } from "../api";

export default function RecipeCard({ recipe }: { recipe: RecipeListItem }) {
  return (
    <a
      href={`#/recipes/${recipe.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
    >
      <h3 className="line-clamp-2 text-base font-semibold text-slate-800 group-hover:text-amber-700">
        {recipe.title}
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {recipe.category}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {recipe.prep_minutes !== null
            ? `${recipe.prep_minutes} min`
            : "Prep time n/a"}
        </span>
      </div>
      <p className="mt-auto pt-3 text-sm text-slate-500">
        by <span className="font-medium text-slate-600">{recipe.author}</span>
      </p>
    </a>
  );
}
