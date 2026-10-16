export type StopReason = "replied" | "opted_out" | "suppressed" | "manual";

export type StopSignals = { replied: boolean; optedOut: boolean; suppressed: boolean };

/** Why an enrollment must stop now, or null to keep going. Opt-out outranks a plain reply. */
export function evaluateStop(s: StopSignals): StopReason | null {
  if (s.optedOut) return "opted_out";
  if (s.suppressed) return "suppressed";
  if (s.replied) return "replied";
  return null;
}
