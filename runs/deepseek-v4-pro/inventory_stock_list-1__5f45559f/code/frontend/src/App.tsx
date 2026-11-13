import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { clearSession, getUsername, isSignedIn } from "./auth";
import AuthPage from "./pages/AuthPage";
import InventoryPage from "./pages/InventoryPage";
import ItemForm from "./pages/ItemForm";
import ItemPage from "./pages/ItemPage";

export default function App() {
  const [signedIn, setSignedIn] = useState(isSignedIn());
  const [username, setUsername] = useState(getUsername());
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => {
      setSignedIn(isSignedIn());
      setUsername(getUsername());
    };
    window.addEventListener("storage", check);
    window.addEventListener("auth-change", check);
    return () => {
      window.removeEventListener("storage", check);
      window.removeEventListener("auth-change", check);
    };
  }, []);

  function signOut() {
    clearSession();
    setSignedIn(false);
    setUsername(null);
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold">
            Warehouse Inventory
          </Link>
          <div className="flex items-center gap-3">
            {signedIn ? (
              <>
                <span className="text-sm text-gray-600">{username}</span>
                <button
                  onClick={signOut}
                  className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<InventoryPage signedIn={signedIn} />} />
          <Route
            path="/auth"
            element={<AuthPage onAuthChange={() => setSignedIn(isSignedIn())} />}
          />
          <Route path="/items/:id" element={<ItemPage signedIn={signedIn} />} />
          <Route path="/items/:id/edit" element={<ItemForm />} />
          <Route path="/items/new" element={<ItemForm />} />
        </Routes>
      </main>
    </div>
  );
}
