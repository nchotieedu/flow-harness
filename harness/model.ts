import { createOpenAI } from "@ai-sdk/openai";

// ── The one place the model is configured ───────────────────────────────────
//
// Everything reads `model` from here. Switching providers is a .dev.vars
// change, zero code changes:
//
//   MODEL_PROVIDER=glm      → Zhipu/Z.ai GLM (OpenAI-compatible endpoint)
//   MODEL_PROVIDER=openai   → OpenAI (needs OPENAI_API_KEY)
//   MODEL_PROVIDER=custom   → ANY OpenAI-compatible endpoint (LM Studio,
//                             OpenRouter, vLLM, Ollama…) via CUSTOM_BASE_URL
//
//   MODEL_ID=glm-5.3-flash  → the model name the provider serves
//
// All providers go through the chat-completions API (.chat), so any
// OpenAI-compatible endpoint works unchanged.
//
// Keys are read per provider (GLM_API_KEY / OPENAI_API_KEY / CUSTOM_API_KEY),
// so you can keep several at once and switch freely.

type Provider = "glm" | "openai" | "custom";

const provider = (process.env.MODEL_PROVIDER ?? "glm") as Provider;
const modelId = process.env.MODEL_ID ?? "glm-5.3-flash";

function buildModel() {
  switch (provider) {
    case "glm":
      return createOpenAI({
        name: "glm",
        baseURL: process.env.GLM_BASE_URL ?? "https://api.z.ai/api/paas/v4",
        apiKey: process.env.GLM_API_KEY ?? "",
      }).chat(modelId);

    case "openai":
      return createOpenAI().chat(modelId);

    case "custom":
      if (!process.env.CUSTOM_BASE_URL) {
        throw new Error("MODEL_PROVIDER=custom requires CUSTOM_BASE_URL in .dev.vars");
      }
      return createOpenAI({
        name: "custom",
        baseURL: process.env.CUSTOM_BASE_URL,
        apiKey: process.env.CUSTOM_API_KEY ?? "",
      }).chat(modelId);
  }
}

export const model = buildModel();
