import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  activeModelId,
  activeProviderName,
  chatCompletion,
  listModels,
} from "./lib/model";

/** Which provider is live, what model it defaults to, and what it serves. */
export const models = internalAction({
  args: { filter: v.optional(v.string()) },
  returns: v.object({
    provider: v.string(),
    defaultModel: v.string(),
    models: v.array(v.string()),
  }),
  handler: async (_ctx, args) => {
    const provider = await activeProviderName();
    const defaultModel = await activeModelId();
    const all = await listModels();
    const needle = args.filter?.toLowerCase();
    return {
      provider,
      defaultModel,
      models:
        needle === undefined
          ? all.slice(0, 40)
          : all.filter((m) => m.toLowerCase().includes(needle)).slice(0, 40),
    };
  },
});

/**
 * Diagnose a misconfigured endpoint without leaking the key.
 *
 * Reports the URL actually constructed, the status, the content type and the
 * first bytes of the body. A base URL is not a secret; the key never appears.
 * This exists because "unexpected token '<'" only tells you the reply was HTML,
 * not which URL produced it.
 */
export const diagnose = internalAction({
  args: {},
  returns: v.object({
    provider: v.string(),
    modelsUrl: v.string(),
    status: v.number(),
    contentType: v.string(),
    looksLikeJson: v.boolean(),
    bodyStart: v.string(),
    keyPresent: v.boolean(),
    baseUrlSet: v.boolean(),
  }),
  handler: async () => {
    const provider = await activeProviderName();
    const rawBase = process.env.OPENAI_BASE_URL;
    const base = (rawBase ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    const modelsUrl = `${base}/models`;

    const key = process.env.OPENAI_API_KEY ?? "";
    const response = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await response.text();
    const trimmed = text.trimStart();

    return {
      provider,
      modelsUrl,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "unknown",
      looksLikeJson: trimmed.startsWith("{") || trimmed.startsWith("["),
      bodyStart: trimmed.slice(0, 220),
      keyPresent: key.length > 0,
      baseUrlSet: rawBase !== undefined && rawBase.length > 0,
    };
  },
});

/** One real completion, to prove the model id and JSON mode both work. */
export const ping = internalAction({
  args: {},
  returns: v.object({
    provider: v.string(),
    model: v.string(),
    reply: v.string(),
  }),
  handler: async () => {
    const provider = await activeProviderName();
    const model = await activeModelId();
    const reply = await chatCompletion({
      model,
      jsonObject: true,
      maxTokens: 2000,
      reasoningEffort: "low",
      messages: [
        {
          role: "user",
          content:
            'Reply with only this JSON: {"ok": true, "sum": <the number 2+2>}',
        },
      ],
    });
    return { provider, model, reply };
  },
});
