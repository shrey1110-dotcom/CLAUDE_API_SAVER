export const EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);

export const TREE_EXCLUDE_DIRS = new Set([...EXCLUDE_DIRS, ".cursor"]);

export const MAX_OUTPUT_BYTES = 30_720;

export const MAX_FILE_BYTES = 512 * 1024;

export const MAX_OUTLINE_FILE_BYTES = 256 * 1024;

export const MAX_SYMBOL_BLOCK_LINES = 40;

export const MAX_WALK_FILES = 5000;

export const IMPORTANT_CONFIG_FILES = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "webpack.config.js",
  "rollup.config.js",
  "eslint.config.js",
  "eslint.config.mjs",
  ".eslintrc",
  ".eslintrc.json",
  ".eslintrc.js",
  "prettier.config.js",
  ".prettierrc",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Dockerfile",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "go.mod",
  "Cargo.toml",
  "Gemfile",
  "Makefile",
  "turbo.json",
  "pnpm-workspace.yaml",
];

export const LOCKFILES: Record<string, string> = {
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "package-lock.json": "npm",
  "bun.lockb": "bun",
  "bun.lock": "bun",
  "Cargo.lock": "cargo",
  "poetry.lock": "poetry",
  "uv.lock": "uv",
  "Gemfile.lock": "bundler",
};

export const FRAMEWORK_HINTS: Record<string, string[]> = {
  next: ["next"],
  react: ["react"],
  vue: ["vue"],
  nuxt: ["nuxt"],
  svelte: ["svelte", "@sveltejs/kit"],
  angular: ["@angular/core"],
  express: ["express"],
  fastify: ["fastify"],
  nestjs: ["@nestjs/core"],
  vite: ["vite"],
  tailwind: ["tailwindcss"],
  django: ["django"],
  flask: ["flask"],
  fastapi: ["fastapi"],
};

export const LANGUAGE_MARKERS: Record<string, string> = {
  "package.json": "javascript/typescript",
  "tsconfig.json": "typescript",
  "pyproject.toml": "python",
  "requirements.txt": "python",
  "go.mod": "go",
  "Cargo.toml": "rust",
  Gemfile: "ruby",
  "pom.xml": "java",
  "build.gradle": "java/kotlin",
};
