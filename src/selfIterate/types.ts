export type RecommendationClass = "safe_auto" | "needs_review" | "do_not_auto_apply";

export interface SelfIterateFinding {
  id: string;
  category: string;
  severity: "info" | "warning" | "failure";
  message: string;
  evidence?: string;
}

export interface SelfIterateRecommendation {
  id: string;
  class: RecommendationClass;
  title: string;
  detail: string;
  action?: string;
}

export interface SelfIterateAnalysis {
  generatedAt: string;
  findings: SelfIterateFinding[];
}
