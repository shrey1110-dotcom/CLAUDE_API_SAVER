import { getConfig, isCompactMode } from "../config.js";
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
  const config = getConfig();
  const scripts = readPackageScripts(resolvedRoot);

  return {
    root: isCompactMode() ? "." : resolvedRoot,
    packageManager: detectPackageManager(resolvedRoot),
    languages: detectLanguages(resolvedRoot),
    frameworks: detectFrameworks(resolvedRoot),
    configFiles: findImportantConfigFiles(resolvedRoot),
    scripts: isCompactMode() ? Object.keys(scripts) : scripts,
    tree: buildDirectoryTree(resolvedRoot, TREE_EXCLUDE_DIRS, config.treeDepth),
  };
}
