"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { publicEnv } from "@/lib/env";

export type LoginState = { sent?: boolean; email?: string; error?: string } | undefined;

const schema = z.object({
  email: z.email("Enter a valid email address."),
  next: z.string().startsWith("/").optional().or(z.literal("")),
});

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const next = parsed.data.next && !parsed.data.next.startsWith("//") ? parsed.data.next : "/profile";
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.message };
  return { sent: true, email: parsed.data.email };
}
