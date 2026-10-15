import { z } from "zod";

/**
 * Server-side env access. Import only from server code.
 * Fails fast with a readable message when a required variable is missing.
 */
const serverSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  CRAWLER_CONTACT_URL: z.string().default("http://localhost:3000/bot"),
  LLM_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  SEARCH_PROVIDER: z.enum(["mock", "tavily", "brave"]).default("mock"),
  TAVILY_API_KEY: z.string().optional(),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  ENRICHMENT_PROVIDERS: z.string().default("mockA,mockB"),
  /** Run queued jobs inside the web process right after enqueue (dev convenience). */
  JOBS_INLINE: z.enum(["true", "false"]).default(process.env.NODE_ENV === "production" ? "false" : "true"),
});

let cached: z.infer<typeof serverSchema> | undefined;

export function env() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}\nCopy .env.example to .env.local and fill it in.`);
  }
  cached = parsed.data;
  return cached;
}

/** Values safe to use in the browser (NEXT_PUBLIC_* are inlined at build time). */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
