import { Link } from "../router";
import { PageTitle, buttonClass, cardClass } from "../ui";

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md text-center">
      <PageTitle>Page not found</PageTitle>
      <div className={cardClass}>
        <p className="mb-4 text-sm text-slate-600">
          That page does not exist.
        </p>
        <Link to="/" className={buttonClass}>
          Back home
        </Link>
      </div>
    </div>
  );
}
