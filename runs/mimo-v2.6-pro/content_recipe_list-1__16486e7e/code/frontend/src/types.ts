export type RecipeSummary = {
  id: number;
  title: string;
  category: string;
  prep_minutes: number;
  author: string;
};

export type Recipe = {
  id: number;
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
  created_at: string;
  author: string;
};

export type RecipePage = {
  items: RecipeSummary[];
  total: number;
  page: number;
  page_size: number;
};

export type RecipeInput = {
  title: string;
  ingredients: string[];
  instructions: string;
  category: string;
  prep_minutes: number;
  servings: number;
};
