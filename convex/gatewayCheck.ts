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
