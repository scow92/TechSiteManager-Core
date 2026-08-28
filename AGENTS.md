# Public repository agent rules

This tree is the generic TechSiteManager core. Keep it usable and testable with
an empty plugin list.

Never add corporate information, real operational fixtures, internal URLs,
private hostnames or paths, credentials, source-derived mappings, private
schema reproductions, private migration knowledge, or screenshots/logs that
contain such material. Reproduce requirements only with clearly fictional
entities and values.

Plugin API V1 supports only explicitly configured CommonJS import providers,
source connectors, named transforms, validated YAML profiles, and required
bounded exporters. Do not add arbitrary routes, browser scripts, migrations,
schemas, authentication providers, schedules, offline mutations, runtime
installation, discovery, marketplace behavior, or hot reload.

Preserve authentication, authorization, origin checks, CSP, safe static-file
allowlisting, optimistic concurrency, transactional import apply, field
ownership, recoverable source absence, audit, offline durability, and SQLite-
safe backup/restore.

Use Node 24. Run `npm run lint`, `npm run syntax`, `npm test`, and relevant
Playwright/container checks. Tests must use throwaway data directories and only
fictional data. Do not commit runtime databases, backups, uploads, logs,
coverage, caches, package archives, environment files, or resolved secrets.
