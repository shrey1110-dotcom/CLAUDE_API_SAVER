# Contributing to ScopeKit

Thanks for helping improve ScopeKit. Small, focused pull requests are easier to
review and safer to release.

## Development setup

ScopeKit requires Node.js 18 or newer.

```bash
git clone https://github.com/shrey1110-dotcom/ScopeKit.git
cd ScopeKit
npm install
npm run build
```

## Making a change

1. Create a branch from `clean-main`.
2. Keep the change focused on one fix or feature.
3. Add or update tests when behavior changes.
4. Run the relevant checks before opening a pull request.

For most changes, start with:

```bash
npm run build
npm test
```

Security-sensitive changes should also run:

```bash
npm run test:security
```

## Pull requests

In the pull request description, explain what changed, why it changed, and how
you validated it. Link any related issue and call out compatibility or security
considerations when they apply.

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE).
