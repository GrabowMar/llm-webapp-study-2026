import { useCallback, useEffect, useState } from "react";
import { clearSession, getUsername } from "./api";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import DirectoryPage from "./pages/DirectoryPage";
import CustomerDetailPage from "./pages/CustomerDetailPage";
import CustomerNewPage from "./pages/CustomerNewPage";
import { usePath } from "./router";

export default function App() {
  const path = usePath();
  const [username, setUsername] = useState<string | null>(() => getUsername());

  const signOut = useCallback(() => {
    clearSession();
    setUsername(null);
  }, []);

  useEffect(() => {
    const onCleared = () => setUsername(null);
    window.addEventListener("directory:session-cleared", onCleared);
    return () => window.removeEventListener("directory:session-cleared", onCleared);
  }, []);

  useEffect(() => {
    if (!username && path !== "/") {
      window.history.replaceState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [username, path]);

  if (!username) {
    return <AuthPage onSignedIn={setUsername} />;
  }

  let content: React.ReactNode;
  const detailMatch = path.match(/^\/customers\/(\d+)$/);
  if (path === "/customers/new") {
    content = <CustomerNewPage />;
  } else if (detailMatch) {
    content = (
      <CustomerDetailPage
        key={detailMatch[1]}
        id={Number(detailMatch[1])}
        onSignedOut={signOut}
      />
    );
  } else {
    content = <DirectoryPage onSignedOut={signOut} />;
  }

  return (
    <Layout username={username} onSignedOut={signOut}>
      {content}
    </Layout>
  );
}
