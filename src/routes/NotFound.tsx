import { Link } from "react-router-dom";
import { Page } from "../components/SiteChrome";

export function NotFound() {
  return (
    <Page>
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">Page not found</h1>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-primary underline">
          Back to all medications
        </Link>
      </div>
    </Page>
  );
}
