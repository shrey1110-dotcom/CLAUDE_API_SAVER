import type { AbRunResult } from "./types.js";

export interface RepeatStats {
  values: number[];
  mean: number;
  median: number;
  min: number;
  max: number;
  standardDeviation: number;
  outlierWarning: boolean;
  largestOutlier?: number;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateRepeatStats(values: number[] | undefined): RepeatStats | undefined {
  const nums = (values ?? []).filter((value) => Number.isFinite(value));
  if (nums.length === 0) {
    return undefined;
  }

  const sorted = [...nums].sort((a, b) => a - b);
  const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const variance = nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length;
  const max = sorted[sorted.length - 1];
  const outlierWarning = sorted.length > 1 && max > median * 2;

  return {
    values: nums,
    mean: round(mean),
    median: round(median),
    min: sorted[0],
    max,
    standardDeviation: round(Math.sqrt(variance)),
    outlierWarning,
    largestOutlier: outlierWarning ? max : undefined,
  };
}

export function clientRepeatStats(result: AbRunResult | undefined): RepeatStats | undefined {
  if (!result) return undefined;
  return calculateRepeatStats(
    result.clientTotalTokenRepeats?.length ? result.clientTotalTokenRepeats : result.clientTotalTokens !== undefined ? [result.clientTotalTokens] : undefined,
  );
}

export function combinedRepeatStats(result: AbRunResult | undefined): RepeatStats | undefined {
  if (!result) return undefined;
  return calculateRepeatStats(
    result.combinedTotalTokenRepeats?.length
      ? result.combinedTotalTokenRepeats
      : result.combinedTotalTokens !== undefined
        ? [result.combinedTotalTokens]
        : undefined,
  );
}

export function formatStats(stats: RepeatStats | undefined): string {
  if (!stats) return "-";
  return `mean ${stats.mean}, median ${stats.median}, min ${stats.min}, max ${stats.max}, sd ${stats.standardDeviation}${stats.outlierWarning ? `, OUTLIER max ${stats.largestOutlier}` : ""}`;
}
