#!/usr/bin/env sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 18+ and retry."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install npm and retry."
  exit 1
fi

echo "Installing ScopeKit globally..."
npm install -g scopekit

echo ""
echo "Run setup in your repository:"
echo "  scopekit setup"
echo ""
echo "Or without a global install:"
echo "  npx scopekit setup"
