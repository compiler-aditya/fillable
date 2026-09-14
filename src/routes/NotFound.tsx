import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Card } from "../components/ui/card";

export function NotFound() {
  return (
    <AppShell title="Not found">
    <Card className="px-6 py-14 text-center">
      <h1 className="text-lg font-medium">Page not found</h1>
      <Link
        to="/"
        className="mt-3 inline-block text-sm text-primary underline underline-offset-2"
      >
        Back to all medications
      </Link>
    </Card>
    </AppShell>
  );
}
