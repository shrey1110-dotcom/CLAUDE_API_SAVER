import { AUTH_DISCOVERY_EXPECTED_FILES } from "../authDiscoveryQuality.js";

export function countExpectedFilesFromList(filesListed: string[]): number {
  const haystack = filesListed.join("\n").toLowerCase();
  let count = 0;
  for (const expected of AUTH_DISCOVERY_EXPECTED_FILES) {
    const basename = expected.split("/").pop() ?? expected;
    if (haystack.includes(expected.toLowerCase()) || haystack.includes(basename.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

export function allExpectedFilesFound(count: number): boolean {
  return count >= AUTH_DISCOVERY_EXPECTED_FILES.length;
}
