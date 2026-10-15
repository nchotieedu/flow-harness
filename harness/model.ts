import { openai } from "@ai-sdk/openai";

// The one place the model is configured.
// Override with MODEL_ID in .dev.vars (e.g. a cheaper "-mini" variant).
// The provider reads OPENAI_API_KEY from the environment at request time
// (the server loads it from .dev.vars on startup).
export const model = openai(process.env.MODEL_ID ?? "gpt-5.5");
