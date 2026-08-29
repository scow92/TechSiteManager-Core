# Contributing

Contributions are welcome after the repository owner opens the project for
public contribution.

Unless explicitly stated otherwise, intentionally submitted contributions are
provided under the Apache License, Version 2.0 (`Apache-2.0`), consistent with
section 5 of the project licence. This does not override a separate written
agreement with the copyright owner.

Use fictional reproductions. Do not paste private source layouts, mappings,
records, URLs, identifiers, credentials, logs, screenshots, migration details,
or deployment topology into issues, commits, pull requests, tests, or CI.

Before opening a pull request:

1. Run lint, syntax, strict JavaScript type checking, unit/integration,
   browser, and relevant container tests with `npm run verify:release`.
2. Run the public disclosure scan and inspect all changed files manually.
3. Inspect package and container contents when dependencies or deployment
   files change.
4. Explain database, compatibility, security, backup, and rollback impact.
5. Confirm every example and fixture is invented for this repository.

TypeScript is a development-time checker only. Do not add a runtime loader or
generated JavaScript. See [docs/TYPESCRIPT.md](docs/TYPESCRIPT.md) for the
current checked scope and staged expansion policy.
