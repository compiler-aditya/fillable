import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { LandingPage } from "./LandingPage";
import { Board } from "./routes/Board";
import { Conflicts } from "./routes/Conflicts";
import { Drug } from "./routes/Drug";
import { NotFound } from "./routes/NotFound";
import { Pipeline } from "./routes/Pipeline";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (typeof convexUrl !== "string" || convexUrl.length === 0) {
  // Failing loudly beats a blank page whose network tab shows requests to
  // "undefined".
  throw new Error("VITE_CONVEX_URL is not set. Run `npx convex dev` first.");
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* ConvexAuthProvider, not ConvexProvider — the plain one never sends tokens. */}
    <ConvexAuthProvider client={convex}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                onGetStarted={() => window.location.assign("/explore")}
              />
            }
          />
          <Route path="/explore" element={<Board />} />
          <Route path="/d/:slug" element={<Drug />} />
          <Route path="/conflicts" element={<Conflicts />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ConvexAuthProvider>
  </StrictMode>,
);
