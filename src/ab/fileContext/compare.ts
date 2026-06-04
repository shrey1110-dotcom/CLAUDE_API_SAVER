import type { FileContextComparison, FileContextPlan, FileContextResult, FileContextVerdict } from "./types.js";

export function hasRealTokenUsage(result: FileContextResult): boolean {
  return result.tokenUsageSource === "real" && typeof result.clientTotalTokens === "number";
}

export function qualityWin(a: FileContextResult, b: FileContextResult): boolean {
  const aQuality = a.qualityScore ?? 0;
  const bQuality = b.qualityScore ?? 0;
  const aFiles = a.expectedFilesFound ?? 0;
  const bFiles = b.expectedFilesFound ?? 0;
  return bQuality > aQuality || bFiles > aFiles;
}

export function qualityRegression(a: FileContextResult, b: FileContextResult): boolean {
  const aQuality = a.qualityScore ?? 0;
  const bQuality = b.qualityScore ?? 0;
  const aFiles = a.expectedFilesFound ?? 0;
  const bFiles = b.expectedFilesFound ?? 0;
  return bQuality < aQuality || bFiles < aFiles;
}

export function combinedTokensB(result: FileContextResult): number | undefined {
  if (typeof result.clientTotalTokens !== "number") {
    return undefined;
  }
  return result.clientTotalTokens + (result.contextPackEstimatedTokens ?? 0);
}

export function tokenWin(a: FileContextResult, b: FileContextResult): boolean {
  if (!hasRealTokenUsage(a) || !hasRealTokenUsage(b)) {
    return false;
  }
  const aTotal = a.clientTotalTokens!;
  const bTotal = combinedTokensB(b);
  if (typeof bTotal !== "number") {
    return false;
  }
  return bTotal < aTotal;
}

export function tokenComparisonAvailable(a: FileContextResult, b: FileContextResult): boolean {
  return hasRealTokenUsage(a) && hasRealTokenUsage(b);
}

export function compareFileContextResults(
  plan: FileContextPlan,
  resultA: FileContextResult | undefined,
  resultB: FileContextResult | undefined,
): FileContextComparison {
  if (!resultA || !resultB) {
    return {
      plan,
      resultA,
      resultB,
      verdict: "INCOMPLETE_TEST",
      qualityWin: false,
      tokenWin: false,
      tokenComparisonAvailable: false,
      summary: "Record both no_context (A) and file_context_pack (B) before comparing.",
      comparedAt: new Date().toISOString(),
    };
  }

  const qWin = qualityWin(resultA, resultB);
  const qReg = qualityRegression(resultA, resultB);
  const tokensAvailable = tokenComparisonAvailable(resultA, resultB);
  const tWin = tokenWin(resultA, resultB);

  let verdict: FileContextVerdict;
  let summary: string;

  if (qReg && !qWin) {
    verdict = "QUALITY_REGRESSION";
    summary = "Test B scored lower on quality or found fewer expected files than Test A.";
  } else if (qWin && tWin) {
    verdict = "QUALITY_AND_TOKEN_WIN";
    summary = "Test B improved quality/file recall and used fewer real client tokens (including context pack).";
  } else if (tWin && !qReg) {
    verdict = "TOKEN_SAVINGS_PROVEN";
    summary = "Test B used fewer real client tokens than Test A with equal or better quality.";
  } else if (qWin) {
    verdict = "QUALITY_WIN";
    summary = tokensAvailable
      ? "Test B improved quality/file recall; real token usage did not show savings."
      : "Test B improved quality/file recall; token savings not evaluated (usage unavailable).";
  } else if (!tokensAvailable) {
    verdict = "TOKEN_USAGE_UNAVAILABLE";
    summary = "No meaningful quality change; real token usage unavailable for both runs.";
  } else {
    verdict = "NO_MEANINGFUL_CHANGE";
    summary = "Test B did not beat Test A on quality or real token usage.";
  }

  return {
    plan,
    resultA,
    resultB,
    verdict,
    qualityWin: qWin,
    tokenWin: tWin,
    tokenComparisonAvailable: tokensAvailable,
    summary,
    comparedAt: new Date().toISOString(),
  };
}
