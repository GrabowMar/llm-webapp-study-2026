export type RecipeSummary = {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
};

export type Recipe = RecipeSummary & {
  ingredients: string[];
  instructions: string;
  servings: number;
  created_at: string;
};

export type RecipeFields = Pick<Recipe, "title" | "category" | "prep_minutes" | "servings" | "ingredients" | "instructions">;
export type RecipePage = { items: RecipeSummary[]; total: number; page: number; page_size: number };

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("We couldn’t reach the kitchen. Check your connection and try again.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || "Something went wrong. Please try again.", response.status, data.errors);
  return data as T;
}
