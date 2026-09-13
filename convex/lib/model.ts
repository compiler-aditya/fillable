import { getServiceToken } from "convex/server";

/**
 * Model access, provider-agnostic.
 *
 * Three paths, resolved at call time by which credential exists:
 *
 *  1. `OPENAI_API_KEY` — OpenAI directly.
 *  2. `GEMINI_API_KEY` — Gemini's OpenAI-compatible endpoint.
 *  3. Neither — the Convex AI Gateway, which needs no provider key but does
 *     require a paid Convex plan.
 *
 * `MODEL_PROVIDER` pins one explicitly; `MODEL_ID` pins a specific model.
 * Switching providers is therefore an environment variable, not a refactor —
 * which matters when a free tier is right for a hundred test iterations and a
 * different provider is right for the run that gets recorded.
 *
 * Model ids are written in gateway form ("openai/gpt-4o-mini") throughout, and
 * the prefix is stripped for providers that want a bare id, so callers never
 * need to know which path is live.
 */

const GATEWAY_BASE = "https://ai-gateway.convex.dev/v1";
const OPENAI_BASE = "https://api.openai.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Default model per provider, in gateway form.
 *
 * Overridable with MODEL_ID when a specific model is wanted.
 */
const DEFAULT_MODEL: Record<string, string> = {
  openai: "openai/gpt-4o-mini",
  gemini: "gemini/gemini-3.8-flash",
  "convex-gateway": "openai/gpt-4o-mini",
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderName = "openai" | "gemini" | "convex-gateway";

type Provider = {
  name: ProviderName;
  baseUrl: string;
  authorization: string;
  /** Convert a gateway-form model id into what this provider expects. */
  modelId: (id: string) => string;
};

/** Strip a `provider/` prefix; providers other than the gateway want bare ids. */
const stripPrefix = (id: string): string => {
  const slash = id.indexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
};

/**
 * Which provider to use.
 *
 * MODEL_PROVIDER pins one explicitly; otherwise the first credential present
 * wins, OpenAI first. Order matters for the hackathon: OpenAI is a sponsor and
 * gets recorded as the model actually used, so it should not be shadowed by a
 * key left set from local testing.
 */
async function resolveProvider(): Promise<Provider> {
  const pinned = process.env.MODEL_PROVIDER?.toLowerCase();

  const openaiKey = process.env.OPENAI_API_KEY;
  if (
    (pinned === undefined || pinned === "openai") &&
    openaiKey !== undefined &&
    openaiKey.length > 0
  ) {
    return {
      name: "openai",
      baseUrl: OPENAI_BASE,
      authorization: `Bearer ${openaiKey}`,
      modelId: stripPrefix,
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (
    (pinned === undefined || pinned === "gemini") &&
    geminiKey !== undefined &&
    geminiKey.length > 0
  ) {
    return {
      name: "gemini",
      baseUrl: GEMINI_BASE,
      authorization: `Bearer ${geminiKey}`,
      modelId: stripPrefix,
    };
  }

  try {
    const token = await getServiceToken("ai-gateway");
    return {
      name: "convex-gateway",
      baseUrl: GATEWAY_BASE,
      authorization: `Bearer ${token}`,
      modelId: (id) => (id.includes("/") ? id : `openai/${id}`),
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      "No model provider available. Set OPENAI_API_KEY or GEMINI_API_KEY on " +
        "the deployment, or enable the Convex AI Gateway. Gateway said: " +
        detail.slice(0, 200),
    );
  }
}

export async function activeProviderName(): Promise<ProviderName> {
  return (await resolveProvider()).name;
}

/**
 * The model to use, in gateway form.
 *
 * MODEL_ID overrides; otherwise the active provider's default. Callers pass
 * this straight to chatCompletion, which translates it per provider.
 */
export async function activeModelId(): Promise<string> {
  const override = process.env.MODEL_ID;
  if (override !== undefined && override.length > 0) return override;
  const provider = await resolveProvider();
  return DEFAULT_MODEL[provider.name] ?? "openai/gpt-4o-mini";
}

/** Model ids the active provider serves. */
export async function listModels(): Promise<string[]> {
  const provider = await resolveProvider();
  const response = await fetch(`${provider.baseUrl}/models`, {
    headers: { Authorization: provider.authorization },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${provider.name} /models failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const parsed: unknown = JSON.parse(text);
  const data =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).data
      : null;
  if (!Array.isArray(data)) return [];
  return data
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      return typeof row.id === "string" ? row.id : "";
    })
    .filter((id) => id.length > 0);
}

/**
 * One chat completion, returning the raw assistant text.
 *
 * `jsonObject` forces a parseable reply for proposals, which are consumed as
 * data rather than shown as prose.
 */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type CompletionArgs = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  jsonObject?: boolean;
  maxTokens?: number;
  /**
   * Thinking models spend the token budget on reasoning before emitting any
   * output, so a modest max_tokens returns a truncated fragment rather than an
   * error. For structured extraction, "low" keeps the budget on the answer.
   */
  reasoningEffort?: "low" | "medium" | "high";
};

export async function chatCompletion(args: CompletionArgs): Promise<string> {
  let lastError: Error | undefined;

  // Providers return 503 under load and 429 on rate limits, both transient. A
  // negotiation round that dies on a capacity spike is a broken product, so
  // absorb them here rather than letting the round fail.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptCompletion(args);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const status = Number(/\b(\d{3})\b/.exec(lastError.message)?.[1] ?? 0);
      if (!RETRYABLE_STATUS.has(status) || attempt === MAX_ATTEMPTS) {
        throw lastError;
      }
      // 0.5s, 1s, 2s — enough for a demand spike to pass without stalling a demo.
      await delay(500 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error("Completion failed");
}

async function attemptCompletion(args: CompletionArgs): Promise<string> {
  const provider = await resolveProvider();

  const body: Record<string, unknown> = {
    model: provider.modelId(args.model),
    messages: args.messages,
    temperature: args.temperature ?? 0.2,
  };
  if (args.jsonObject === true) {
    body.response_format = { type: "json_object" };
  }
  if (args.maxTokens !== undefined) {
    body.max_tokens = args.maxTokens;
  }
  if (args.reasoningEffort !== undefined) {
    body.reasoning_effort = args.reasoningEffort;
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: provider.authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${provider.name} completion failed: ${response.status} ${text.slice(0, 400)}`,
    );
  }

  const parsed = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new Error("Model returned an empty completion");
  }
  return content;
}
