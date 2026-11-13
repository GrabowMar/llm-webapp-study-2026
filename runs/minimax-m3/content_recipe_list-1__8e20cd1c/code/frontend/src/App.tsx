import { Link, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import Header from "./components/Header";
import AuthPage from "./pages/AuthPage";
import BrowsePage from "./pages/BrowsePage";
import RecipeFormPage from "./pages/RecipeFormPage";
import RecipePage from "./pages/RecipePage";

function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="font-display text-3xl font-bold text-stone-900">Page not found</h1>
      <Link to="/" className="text-sm font-medium text-amber-700 hover:underline">
        Back to all recipes
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-stone-50 text-stone-800">
        <Header />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Routes>
            <Route path="/" element={<BrowsePage />} />
            <Route path="/recipes/new" element={<RecipeFormPage mode="create" />} />
            <Route path="/recipes/:id" element={<RecipePage />} />
            <Route path="/recipes/:id/edit" element={<RecipeFormPage mode="edit" />} />
            <Route path="/signin" element={<AuthPage mode="signin" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto w-full max-w-5xl px-4 py-4 text-xs text-stone-500">
            Recipe Book - cook, share and browse recipes.
          </div>
        </footer>
      </div>
    </AuthProvider>
  );
}
