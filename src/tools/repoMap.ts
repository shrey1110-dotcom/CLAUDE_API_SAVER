import { getConfig, isCompactMode } from "../config.js";
import { TREE_EXCLUDE_DIRS } from "../constants.js";
import {
  buildCompactDirectoryTree,
  buildDirectoryTree,
  detectFrameworks,
  detectLanguages,
  detectPackageManager,
  findImportantConfigFiles,
  readPackageScripts,
} from "../detect.js";
import { resolveRoot } from "../pathSafety.js";

const COMPACT_CONFIG_FILE_LIMIT = 12;

export function repoMap(root?: string) {
  const resolvedRoot = resolveRoot(root);
  const config = getConfig();
  const scripts = readPackageScripts(resolvedRoot);
  const configFiles = findImportantConfigFiles(resolvedRoot);

  if (isCompactMode()) {
    const { tree, stats } = buildCompactDirectoryTree(
      resolvedRoot,
      TREE_EXCLUDE_DIRS,
      config.treeDepth,
      config.maxTreeEntriesPerDir,
    );

    return {
      packageManager: detectPackageManager(resolvedRoot),
      languages: detectLanguages(resolvedRoot),
      frameworks: detectFrameworks(resolvedRoot),
      configFiles: configFiles.slice(0, COMPACT_CONFIG_FILE_LIMIT),
      scripts: Object.keys(scripts),
      tree,
      summary: {
        totalFilesScanned: stats.totalFilesScanned,
        directoriesShown: stats.directoriesShown,
        excludedDirectoriesCount: stats.excludedDirectoriesCount,
      },
      truncated: stats.truncated || configFiles.length > COMPACT_CONFIG_FILE_LIMIT,
    };
  }

  return {
    root: resolvedRoot,
    packageManager: detectPackageManager(resolvedRoot),
    languages: detectLanguages(resolvedRoot),
    frameworks: detectFrameworks(resolvedRoot),
    configFiles,
    scripts,
    tree: buildDirectoryTree(resolvedRoot, TREE_EXCLUDE_DIRS, config.treeDepth),
  };
}
