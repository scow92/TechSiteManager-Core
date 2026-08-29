# Public repository agent rules

This tree is the generic TechSiteManager core. Keep it usable and testable with
an empty plugin list.

Never add corporate information, real operational fixtures, internal URLs,
private hostnames or paths, credentials, source-derived mappings, private
schema reproductions, private migration knowledge, or screenshots/logs that
contain such material. Reproduce requirements only with clearly fictional
entities and values.

Plugin API V2 supports explicitly configured CommonJS import providers, source
connectors, named transforms, validated YAML import profiles, data-only
presentation profiles, plugin-scoped typed extension fields, and bounded
exporters. Core alone owns renderers, routes, validation, persistence,
authorization, migrations, and offline behavior. Do not add plugin browser
scripts, arbitrary HTML/CSS, arbitrary routes, plugin migrations or Knex
access, authentication providers, schedules, runtime installation, discovery,
marketplace behavior, or hot reload. Continue accepting compatible V1 packages.

Preserve authentication, authorization, origin checks, CSP, safe static-file
allowlisting, optimistic concurrency, transactional import apply, field
ownership, recoverable source absence, audit, offline durability, and SQLite-
safe backup/restore.

Use Node 24. Run `npm run lint`, `npm run syntax`, `npm run typecheck`, `npm test`, and relevant
Playwright/container checks. Tests must use throwaway data directories and only
fictional data. Do not commit runtime databases, backups, uploads, logs,
coverage, caches, package archives, environment files, or resolved secrets.

The browser uses native ES modules without a framework or build step.
`public/js/main.js` is the module entry; classic `idb.js` and `offline.js` load
first for the existing durable offline APIs. Keep every imported shell module
in `public/sw.js` and bump its cache version atomically when the shell changes.
