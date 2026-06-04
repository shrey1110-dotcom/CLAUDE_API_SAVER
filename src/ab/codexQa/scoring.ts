import type { CodexQaTaskProfile } from "./profiles.js";

export interface CodexQaScore {
  taskName: string;
  matchedFiles: string[];
  missingFiles: string[];
  matchedConcepts: string[];
  missingConcepts: string[];
  matchedCategories: string[];
  missingCategories: string[];
  expectedFilesFound: boolean;
  expectedConceptsFound: boolean;
  outputCategoriesFound: boolean;
  qualityScore: number;
  passed: boolean;
  note: string;
}

function includesPattern(text: string, pattern: string): boolean {
  return text.toLowerCase().includes(pattern.toLowerCase());
}

function scorePart(matched: number, total: number, weight: number): number {
  if (total === 0) return weight;
  return (matched / total) * weight;
}

export function scoreCodexQaText(profile: CodexQaTaskProfile, text: string): CodexQaScore {
  const matchedFiles = profile.expectedFilePatterns.filter((pattern) => includesPattern(text, pattern));
  const missingFiles = profile.expectedFilePatterns.filter((pattern) => !matchedFiles.includes(pattern));
  const matchedConcepts = profile.expectedConcepts.filter((concept) => includesPattern(text, concept));
  const missingConcepts = profile.expectedConcepts.filter((concept) => !matchedConcepts.includes(concept));
  const matchedCategories = profile.expectedOutputCategories
    .filter((category) => category.patterns.some((pattern) => includesPattern(text, pattern)))
    .map((category) => category.name);
  const missingCategories = profile.expectedOutputCategories
    .map((category) => category.name)
    .filter((name) => !matchedCategories.includes(name));

  const expectedFilesFound = matchedFiles.length >= profile.minExpectedFileMatches;
  const expectedConceptsFound = matchedConcepts.length >= profile.minExpectedConceptMatches;
  const outputCategoriesFound = matchedCategories.length >= profile.minExpectedCategoryMatches;

  const rawScore =
    scorePart(matchedFiles.length, profile.expectedFilePatterns.length, 5) +
    scorePart(matchedConcepts.length, profile.expectedConcepts.length, 3) +
    scorePart(matchedCategories.length, profile.expectedOutputCategories.length, 2);
  const qualityScore = Math.max(1, Math.min(10, Math.round(rawScore)));
  const passed =
    qualityScore >= profile.passThreshold &&
    expectedFilesFound &&
    expectedConceptsFound &&
    outputCategoriesFound;

  return {
    taskName: profile.taskName,
    matchedFiles,
    missingFiles,
    matchedConcepts,
    missingConcepts,
    matchedCategories,
    missingCategories,
    expectedFilesFound,
    expectedConceptsFound,
    outputCategoriesFound,
    qualityScore,
    passed,
    note: `${profile.taskName} scoring: files ${matchedFiles.length}/${profile.expectedFilePatterns.length}, concepts ${matchedConcepts.length}/${profile.expectedConcepts.length}, categories ${matchedCategories.length}/${profile.expectedOutputCategories.length}.`,
  };
}

