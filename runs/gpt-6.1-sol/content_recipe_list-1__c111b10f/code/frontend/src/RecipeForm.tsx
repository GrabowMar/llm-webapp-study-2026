import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, ChefHat, GripVertical, Plus, Sprout, Trash2 } from "lucide-react";
import { api, ApiError, type Recipe, type RecipeFields } from "./api";
import { ErrorBox, Field, inputClass, Loading, primaryButton, secondaryButton } from "./ui";

const blank: RecipeFields = { title: "", category: "", ingredients: ["", ""], instructions: "", prep_minutes: 20, servings: 2 };

export default function RecipeForm({ id, token, username, onSignIn, onCancel, onSaved, onUnauthorized }: { id?: number; token: string; username: string; onSignIn: () => void; onCancel: () => void; onSaved: (recipe: Recipe) => void; onUnauthorized: () => void }) {
  const [form, setForm] = useState<RecipeFields>(blank);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(!!id);
  const [author, setAuthor] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api<{ items: string[] }>("/categories", { signal: controller.signal }).then(data => setCategories(data.items)).catch(() => {});
    if (id) {
      setLoading(true);
      setLoadError("");
      api<Recipe>(`/recipes/${id}`, { signal: controller.signal }).then(recipe => { setForm(recipe); setAuthor(recipe.author); })
        .catch(caught => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setLoadError(caught.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [id, retry]);

  function update<K extends keyof RecipeFields>(field: K, value: RecipeFields[K]) {
    setForm(current => ({ ...current, [field]: value }));
    setFields(current => ({ ...current, [field]: "" }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setFields({});
    try {
      const recipe = await api<Recipe>(id ? `/recipes/${id}` : "/recipes", { method: id ? "PUT" : "POST", body: JSON.stringify({ title: form.title, category: form.category, ingredients: form.ingredients, instructions: form.instructions, prep_minutes: form.prep_minutes, servings: form.servings }) }, token);
      onSaved(recipe);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn’t save your recipe. Please try again.");
      if (caught instanceof ApiError) { setFields(caught.fields); if (caught.status === 401) onUnauthorized(); }
    } finally { setBusy(false); }
  }

  function accessibility(name: string) { return { "aria-invalid": !!fields[name], "aria-describedby": fields[name] ? `${name}-error` : undefined }; }

  return <div className="mx-auto max-w-3xl py-9 sm:py-11">
    <button onClick={onCancel} className="mb-7 flex items-center gap-2 text-xs text-muted transition hover:text-olive"><ArrowLeft size={15} />{id ? "Back to your recipe" : "Back to the recipe book"}</button>
    <div className="mb-8"><span className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.8px] text-olive"><Sprout size={16} /> A little of your kitchen</span><h1 className="font-serif text-4xl tracking-tight sm:text-[44px]">{id ? "Make it even more yours." : "Something worth sharing."}</h1><p className="mt-3 text-sm leading-6 text-muted">{id ? "A new twist, a little refinement. Keep your recipe just the way you like it." : "Simple or special, everyday or once a year. We’d love to try your favorite."}</p></div>
    {loading ? <Loading text="Getting your recipe ready…" /> : loadError ? <div className="space-y-4"><ErrorBox message={loadError} /><button onClick={() => setRetry(value => value + 1)} className={secondaryButton}>Try again</button></div> : !token ? <div className="rounded-xl border border-line bg-white p-8 text-center"><ChefHat size={36} strokeWidth={1.4} className="mx-auto mb-4 text-olive" /><h2 className="font-serif text-2xl">First, make yourself at home.</h2><p className="my-4 text-sm text-muted">Sign in to share and manage your recipes.</p><button onClick={onSignIn} className={primaryButton}>Sign in to continue <ArrowRight size={16} /></button></div> : id && username && author !== username ? <ErrorBox message="Only the author can edit this recipe. You can still make and share a recipe of your own." /> : <form noValidate onSubmit={submit} className="space-y-7">
      {error && <ErrorBox message={error} />}
      <section className="space-y-5 rounded-xl border border-line bg-white p-6 sm:p-8"><h2 className="mb-1 font-serif text-2xl">The essentials</h2>
        <Field label="Recipe title" name="title" error={fields.title}><input id="title" className={inputClass} placeholder="What’s cooking?" value={form.title} onChange={event => update("title", event.target.value)} {...accessibility("title")} /></Field>
        <div className="grid gap-5 sm:grid-cols-3"><Field label="Category" name="category" error={fields.category}><input id="category" list="recipe-categories" className={inputClass} placeholder="e.g. Dinner" value={form.category} onChange={event => update("category", event.target.value)} {...accessibility("category")} /><datalist id="recipe-categories">{categories.map(category => <option key={category} value={category} />)}</datalist></Field><Field label="Prep time (minutes)" name="prep_minutes" error={fields.prep_minutes}><input id="prep_minutes" type="number" min="0" max="1440" step="1" className={inputClass} value={Number.isNaN(form.prep_minutes) ? "" : form.prep_minutes} onChange={event => update("prep_minutes", event.target.value === "" ? NaN : Number(event.target.value))} {...accessibility("prep_minutes")} /></Field><Field label="Servings" name="servings" error={fields.servings}><input id="servings" type="number" min="1" max="100" step="1" className={inputClass} value={Number.isNaN(form.servings) ? "" : form.servings} onChange={event => update("servings", event.target.value === "" ? NaN : Number(event.target.value))} {...accessibility("servings")} /></Field></div>
      </section>
      <section className="rounded-xl border border-line bg-white p-6 sm:p-8"><h2 className="font-serif text-2xl">A few good ingredients</h2><p className="mb-5 mt-2 text-xs leading-6 text-muted">One ingredient per row, with the quantity. We’ll keep them in this order.</p><div className="space-y-3" aria-describedby={fields.ingredients ? "ingredients-error" : undefined}>{form.ingredients.map((ingredient, index) => <div key={index} className="flex items-center gap-2"><GripVertical size={15} className="shrink-0 text-line" /><span className="w-4 shrink-0 text-xs text-muted">{index + 1}</span><input id={index === 0 ? "ingredients" : `ingredient-${index}`} aria-label={`Ingredient ${index + 1}`} className={inputClass} placeholder={index === 0 ? "e.g. 200 g pasta" : "Another lovely ingredient"} value={ingredient} onChange={event => update("ingredients", form.ingredients.map((value, position) => position === index ? event.target.value : value))} {...accessibility("ingredients")} /><button type="button" aria-label={`Remove ingredient ${index + 1}`} onClick={() => update("ingredients", form.ingredients.filter((_, position) => position !== index))} className="rounded-lg p-2.5 text-muted transition hover:bg-red-50 hover:text-terra"><Trash2 size={16} /></button></div>)}</div>{fields.ingredients && <p id="ingredients-error" role="alert" className="mt-2 text-xs text-red-700">{fields.ingredients}</p>}<button type="button" disabled={form.ingredients.length >= 100} onClick={() => update("ingredients", [...form.ingredients, ""])} className="mt-5 flex items-center gap-1.5 rounded-md px-1 py-1.5 text-xs font-medium text-olive hover:bg-sage disabled:opacity-50"><Plus size={15} /> Add an ingredient</button></section>
      <section className="rounded-xl border border-line bg-white p-6 sm:p-8"><h2 className="mb-5 font-serif text-2xl">Let’s make something good.</h2><Field label="Instructions" name="instructions" error={fields.instructions} hint="Write it just as you’d explain it to a friend. Line breaks are kept."><textarea id="instructions" rows={9} className={`${inputClass} resize-y leading-7`} placeholder="Start here…" value={form.instructions} onChange={event => update("instructions", event.target.value)} {...accessibility("instructions")} /></Field></section>
      <div className="flex items-center justify-between gap-4"><p className="hidden text-xs text-muted sm:block">From <span className="font-medium text-olive">{username || "your"}</span>’s kitchen, with love.</p><div className="ml-auto flex gap-3"><button type="button" disabled={busy} onClick={onCancel} className={secondaryButton}>Cancel</button><button disabled={busy} className={primaryButton}>{busy ? "Saving your recipe…" : id ? "Save changes" : "Share your recipe"}<ArrowRight size={16} /></button></div></div>
    </form>}
  </div>;
}
