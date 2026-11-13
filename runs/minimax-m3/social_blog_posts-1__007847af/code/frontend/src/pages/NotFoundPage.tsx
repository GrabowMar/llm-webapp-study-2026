import { Link } from "react-router-dom";

import Layout from "../components/Layout";

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page you were looking for does not exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          Back to all posts
        </Link>
      </div>
    </Layout>
  );
}
