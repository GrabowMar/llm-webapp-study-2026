export interface Recipe {
  id: number;
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
  created_at: string;
  author: string;
}

export interface RecipeSummary {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
}

export interface RecipeList {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface RecipeInput {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
}

export interface AuthUser {
  id: number;
  username: string;
}

export interface CategoryCount {
  category: string;
  count: number;
}
