# Contributing to GeoNexus

Thank you for your interest in contributing.

GeoNexus is an academic project under development. Contributions should be focused, reviewable, and consistent with the project's documented scope.

## Before making changes

1. Check existing issues and discussions to avoid duplicate work.
2. For substantial changes, open an issue first to discuss the proposed approach.
3. Do not commit credentials, private land records, personal data, or unlicensed datasets.
4. Do not present experimental boundary detection as a certified survey result.

## Development workflow

1. Fork the repository or create a feature branch.
2. Use a descriptive branch name, such as `feat/parcel-search`, `fix/map-layer-rendering`, or `docs/setup-guide`.
3. Keep each change focused and avoid unrelated formatting changes.
4. Add or update tests when changing application behavior.
5. Update documentation when commands, APIs, configuration, or features change.
6. Run the relevant checks before opening a pull request.

## Commit messages

Use concise, imperative commit messages. Suggested prefixes:

- `feat:` new functionality
- `fix:` bug fixes
- `docs:` documentation
- `refactor:` code restructuring without behavior changes
- `test:` tests
- `chore:` maintenance and tooling

Example: `feat: add parcel boundary comparison`

## Pull requests

Include:

- A clear summary of the change and its motivation.
- Related issue numbers, if applicable.
- Screenshots for user-interface changes.
- Test commands and their results.
- Any migration, configuration, or compatibility notes.

Keep pull requests small enough to review effectively.

## Data and security requirements

- Use synthetic or appropriately licensed demonstration data.
- Never commit API keys, passwords, tokens, private keys, or production environment files.
- Do not add real personal, ownership, or sensitive cadastral information.
- Treat AI-generated geometry as a suggestion that requires human verification.

By submitting a contribution, you agree that it is provided under the repository's MIT License, subject to your rights in the contribution.
