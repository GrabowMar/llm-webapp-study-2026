import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, ChefHat, Clock3, Pencil, Sprout, Trash2, Users } from "lucide-react";
import { api, ApiError, type Recipe } from "./api";
import FoodArt, { dishFor } from "./FoodArt";
import { ErrorBox, Loading, Modal, secondaryButton } from "./ui";

export default function RecipeDetail({ id, username, token, onBack, onEdit, onDeleted, onUnauthorized }: { id: number; username: string; token: string; onBack: () => void; onEdit: () => void; onDeleted: () => void; onUnauthorized: () => void }) {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api<Recipe>(`/recipes/${id}`, { signal: controller.signal }).then(setRecipe).catch(caught => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught.message); });
    return () => controller.abort();
  }, [id, retry]);

  async function remove() {
    setDeleting(true);
    setDeleteError("");
    try { await api(`/recipes/${id}`, { method: "DELETE" }, token); setConfirm(false); onDeleted(); }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { setConfirm(false); onUnauthorized(); }
      else setDeleteError(caught instanceof Error ? caught.message : "Couldn’t delete the recipe.");
    } finally { setDeleting(false); }
  }

  return <div className="py-9 sm:py-11">
    <button onClick={onBack} className="mb-7 flex items-center gap-2 text-xs text-muted transition hover:text-olive"><ArrowLeft size={15} /> Back to the recipe book</button>
    {error ? <div className="space-y-4"><ErrorBox message={error} /><button onClick={() => setRetry(value => value + 1)} className={secondaryButton}>Try again</button></div> : !recipe ? <Loading /> : <>
      <div className="grid overflow-hidden rounded-2xl border border-line bg-white md:grid-cols-2">
        <div className="aspect-[1.4] md:aspect-auto md:min-h-96"><FoodArt dish={dishFor(recipe.title, recipe.category)} /></div>
        <div className="flex flex-col justify-center p-7 sm:p-10"><span className="mb-4 w-fit rounded-md bg-sage px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-olive">{recipe.category}</span><h1 className="font-serif text-4xl leading-tight tracking-tight lg:text-[45px]">{recipe.title}</h1><div className="mt-6 flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage font-serif text-olive">{recipe.author.charAt(0).toUpperCase()}</span><span className="text-xs text-muted">From <span className="font-medium text-ink">{recipe.author}</span>’s kitchen</span></div><div className="mt-7 flex flex-wrap gap-5 border-t border-line pt-5 text-xs text-muted"><span className="flex items-center gap-2"><Clock3 size={17} strokeWidth={1.5} /><span><b className="font-medium text-ink">{recipe.prep_minutes} min</b><span className="mt-1 block text-[10px]">Prep time</span></span></span><span className="flex items-center gap-2"><Users size={17} strokeWidth={1.5} /><span><b className="font-medium text-ink">{recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}</b><span className="mt-1 block text-[10px]">At the table</span></span></span><span className="flex items-center gap-2"><CalendarDays size={17} strokeWidth={1.5} /><span><b className="font-medium text-ink">{new Date(recipe.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</b><span className="mt-1 block text-[10px]">Shared on</span></span></span></div>
          {username === recipe.author && <div className="mt-7 flex gap-3"><button onClick={onEdit} className={secondaryButton}><Pencil size={14} /> Edit recipe</button><button onClick={() => { setDeleteError(""); setConfirm(true); }} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-terra transition hover:bg-red-50"><Trash2 size={14} /> Delete</button></div>}
        </div>
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1.8fr] lg:gap-16">
        <section><div className="mb-5 flex items-center gap-2.5"><Sprout size={21} strokeWidth={1.4} className="text-olive" /><h2 className="font-serif text-[28px]">A few good ingredients</h2></div><p className="mb-5 text-xs text-muted">For {recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}. A little preparation goes a long way.</p><ul className="divide-y divide-line rounded-xl border border-line bg-white px-5">{recipe.ingredients.map((ingredient, index) => <li key={index} className="flex items-start gap-3 py-4 text-sm leading-6"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-olive/65" />{ingredient}</li>)}</ul></section>
        <section><div className="mb-5 flex items-center gap-2.5"><ChefHat size={23} strokeWidth={1.4} className="text-olive" /><h2 className="font-serif text-[28px]">Let’s make something good.</h2></div><div className="whitespace-pre-wrap break-words text-sm leading-[2] text-ink/80">{recipe.instructions}</div><div className="mt-8 border-t border-line pt-5 font-serif text-lg italic text-olive">Made with care. Best enjoyed together.</div></section>
      </div>
    </>}
    {confirm && <Modal title="Take it off the menu?" onClose={() => { if (!deleting) setConfirm(false); }}><p className="text-sm leading-7 text-muted">Are you sure you want to delete <span className="font-medium text-ink">{recipe?.title}</span>? This can’t be undone.</p>{deleteError && <div className="mt-4"><ErrorBox message={deleteError} /></div>}<div className="mt-7 flex justify-end gap-3"><button disabled={deleting} onClick={() => setConfirm(false)} className={secondaryButton}>Keep recipe</button><button disabled={deleting} onClick={remove} className="flex items-center gap-2 rounded-lg bg-terra px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-800 disabled:opacity-50"><Trash2 size={15} />{deleting ? "Deleting…" : "Delete recipe"}</button></div></Modal>}
  </div>;
}
