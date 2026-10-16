import { hiringPlay } from "./hiring";
import type { PlayDefinition, PlayType } from "./types";

const comingSoon = (type: PlayType, label: string, description: string): PlayDefinition => ({
  type,
  label,
  description,
  runnable: false,
  parseParams: (raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}),
  run: async () => {
    throw new Error(`${label} is not available yet.`);
  },
});

export const PLAYS: Record<PlayType, PlayDefinition> = {
  hiring_signal: hiringPlay as unknown as PlayDefinition,
  decision_makers: comingSoon("decision_makers", "Decision-makers at best-fit accounts", "Finds named people with your buyer titles at companies that fit, from their own team pages and press. Coming in a later phase."),
  local_business: comingSoon("local_business", "Local businesses by category and city", "Finds businesses of a category in a city through the Google Places API. Coming in a later phase."),
};

export function getPlay(type: PlayType): PlayDefinition {
  const p = PLAYS[type];
  if (!p) throw new Error(`Unknown play type ${type}`);
  return p;
}
