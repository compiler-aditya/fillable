/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as drugs from "../drugs.js";
import type * as events from "../events.js";
import type * as gatewayCheck from "../gatewayCheck.js";
import type * as http from "../http.js";
import type * as ingest_fda from "../ingest/fda.js";
import type * as lib_fdaApi from "../lib/fdaApi.js";
import type * as lib_fdaRecord from "../lib/fdaRecord.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_mask from "../lib/mask.js";
import type * as lib_model from "../lib/model.js";
import type * as lib_svix from "../lib/svix.js";
import type * as pipeline from "../pipeline.js";
import type * as stats from "../stats.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  drugs: typeof drugs;
  events: typeof events;
  gatewayCheck: typeof gatewayCheck;
  http: typeof http;
  "ingest/fda": typeof ingest_fda;
  "lib/fdaApi": typeof lib_fdaApi;
  "lib/fdaRecord": typeof lib_fdaRecord;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/mask": typeof lib_mask;
  "lib/model": typeof lib_model;
  "lib/svix": typeof lib_svix;
  pipeline: typeof pipeline;
  stats: typeof stats;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  scrapePool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"scrapePool">;
};
