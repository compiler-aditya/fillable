/**
 * The default Convex runtime exposes deployment environment variables on
 * `process.env`, but not the rest of Node.
 *
 * Declaring only this — rather than pulling in `@types/node` — keeps the wider
 * Node API out of reach, so a file without `"use node";` cannot typecheck
 * against built-ins that would fail at runtime.
 */
declare const process: {
  env: Record<string, string | undefined>;
};
