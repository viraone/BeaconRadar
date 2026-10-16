/**
 * List prices per 1M tokens, USD, used only to ESTIMATE spend. Conservative:
 * DeepSeek peak, cache-miss rates (off-peak is half; cache hits are ~50x cheaper),
 * so real bills are at or below the estimate. Source: provider pricing pages, 2026-10.
 */
export const LLM_PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  "deepseek-flash": { input: 0.3, output: 1.2 },
  "deepseek-v4-pro": { input: 1.32, output: 3.96 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  mock: { input: 0, output: 0 },
};

export function priceFor(model: string): { input: number; output: number } | null {
  if (LLM_PRICES_PER_MTOK[model]) return LLM_PRICES_PER_MTOK[model];
  const key = Object.keys(LLM_PRICES_PER_MTOK).find((k) => model.startsWith(k));
  return key ? LLM_PRICES_PER_MTOK[key] : null;
}
