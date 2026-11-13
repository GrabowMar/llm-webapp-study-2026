import type { ReactNode } from "react";
import { useAuth } from "../auth";
import { useRouter } from "../router";
import { Button } from "./ui";

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <button
            onClick={() => navigate("/")}
            className="text-xl font-bold tracking-tight text-slate-900"
          >
            Inkwell
          </button>
          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <button
              onClick={() => navigate("/")}
              className="text-slate-600 hover:text-slate-900"
            >
              Posts
            </button>
            {user ? (
              <>
                <Button onClick={() => navigate("/new")}>New post</Button>
                <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                  {user.username}
                  {user.is_admin && (
                    <span className="ml-1 text-xs uppercase tracking-wide text-amber-600">
                      admin
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await signOut();
                    navigate("/");
                  }}
                >
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate("/login")}
                  className="text-slate-600 hover:text-slate-900"
                >
                  Sign in
                </button>
                <Button onClick={() => navigate("/register")}>Register</Button>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-slate-400">
        Inkwell · a multi-author blog
      </footer>
    </div>
  );
}
