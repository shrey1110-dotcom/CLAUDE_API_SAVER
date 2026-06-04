export const FILE_CONTEXT_DEFAULT_TASK =
  "Find where authentication, login, or user session logic is implemented";

export const FILE_CONTEXT_DEFAULT_PACK_PATH = ".context-packs/auth-discovery.md";

export const FILE_CONTEXT_TEST_A_PROMPT = `Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.`;

export const FILE_CONTEXT_TEST_B_PROMPT = `Use the provided context pack. Do not ask to scan the repo unless the context pack says full file verification is needed.

Task:
Find where authentication, login, or user session logic is implemented in this repo. Do not edit files. Give exact files, functions, and a short explanation of why each matters.`;

export function promptForMode(mode: "no_context" | "file_context_pack"): string {
  return mode === "no_context" ? FILE_CONTEXT_TEST_A_PROMPT : FILE_CONTEXT_TEST_B_PROMPT;
}
