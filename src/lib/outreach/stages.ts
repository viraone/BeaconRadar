import { BELIEF_STAGES, COLD_TOUCH_STAGES, type BeliefStage } from "@/config/outreach";

export function stageIndex(stage: BeliefStage): number {
  return BELIEF_STAGES.indexOf(stage);
}

/** The highest stage a draft may target for a lead whose confirmed stage is `leadStage`: one rung up. */
export function maxTargetStage(leadStage: BeliefStage): BeliefStage {
  return BELIEF_STAGES[Math.min(stageIndex(leadStage) + 1, BELIEF_STAGES.length - 1)];
}

export function isStageAllowed(target: BeliefStage, leadStage: BeliefStage): boolean {
  return stageIndex(target) <= stageIndex(maxTargetStage(leadStage));
}

export function isColdTouchStage(stage: BeliefStage): boolean {
  return COLD_TOUCH_STAGES.includes(stage);
}
