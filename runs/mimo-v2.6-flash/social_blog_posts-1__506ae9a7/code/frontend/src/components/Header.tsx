type Props = {
  username: string | null;
  onSignOut: () => void;
};

export default function Header({ username, onSignOut }: Props) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4">
        <a href="#/" className="text-xl font-bold text-indigo-600">
          Blog
        </a>
        <nav className="flex items-center gap-4 text-sm font-medium text-gray-600">
          <a href="#/" className="hover:text-indigo-600">
            Posts
          </a>
          {username && (
            <a href="#/write" className="hover:text-indigo-600">
              Write
            </a>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {username ? (
            <>
              <span className="text-gray-700">
                Signed in as <span className="font-semibold">{username}</span>
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a
                href="#/login"
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign in
              </a>
              <a
                href="#/register"
                className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500"
              >
                Register
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
