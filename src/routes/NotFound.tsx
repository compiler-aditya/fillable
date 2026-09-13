import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="rounded-card border border-border bg-surface p-10 text-center">
      <h1 className="text-lg font-medium text-text">Page not found</h1>
      <Link to="/" className="mt-3 inline-block text-sm text-accent underline">
        Back to all medications
      </Link>
    </div>
  );
}
