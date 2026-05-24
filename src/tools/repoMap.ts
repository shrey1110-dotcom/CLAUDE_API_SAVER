import { TREE_EXCLUDE_DIRS } from "../constants.js";
import {
  buildDirectoryTree,
  detectFrameworks,
  detectLanguages,
  detectPackageManager,
  findImportantConfigFiles,
  readPackageScripts,
} from "../detect.js";
import { resolveRoot } from "../pathSafety.js";

export function repoMap(root?: string) {
  const resolvedRoot = resolveRoot(root);
  return {
    root: resolvedRoot,
    packageManager: detectPackageManager(resolvedRoot),
    languages: detectLanguages(resolvedRoot),
    frameworks: detectFrameworks(resolvedRoot),
    configFiles: findImportantConfigFiles(resolvedRoot),
    scripts: readPackageScripts(resolvedRoot),
    tree: buildDirectoryTree(resolvedRoot, TREE_EXCLUDE_DIRS, 2),
  };
}
