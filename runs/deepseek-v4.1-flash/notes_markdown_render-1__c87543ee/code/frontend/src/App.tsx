import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import AuthPage from "./AuthPage";
import Layout from "./Layout";
import NoteEditor from "./NoteEditor";
import NotesPage from "./NotesPage";
import PublicNotePage from "./PublicNotePage";
import { AuthProvider, useAuth } from "./auth";
import { Spinner } from "./components";

function CenteredSpinner() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Spinner />
    </div>
  );
}

function ProtectedLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <CenteredSpinner />;
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <CenteredSpinner />;
  return user ? <Navigate to="/notes" replace /> : <AuthPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/p/:id" element={<PublicNotePage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/notes/:id" element={<NoteEditor />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
