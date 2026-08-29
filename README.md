# TechSiteManager

TechSiteManager is a generic planning and record application for structured-
cabling work in technical spaces. It stores sites, rooms, racks, termination
points, devices, work packages, work items, circuits, physical segments,
distances, consumables, photos, assignments, audit history, and import
provenance.

The application is useful with no plugins. Search, editing, generic JSON/CSV
export, authentication, optimistic concurrency, offline shell support, and
backup/restore are core capabilities.

## Status

This source repository is public. Version `1.0.0-rc.1` remains a release
candidate and Plugin API V1 remains the supported plugin contract.

GitHub recorded public visibility on 2026-08-29 at 08:40:53 UTC, while `main`
pointed at commit `5d98b43f349c8329df71b0c1a603782b0c4ff368`. Making the
source repository public did not publish an npm package, public container
image, GitHub release, Pages site, or hosted TechSiteManager deployment.

## Run locally

Use Node 24:

```bash
npm ci
npm start
```

The default server listens on `127.0.0.1:3000` and creates `data/` with a fresh
SQLite database. On first visit, create the first administrator.

Run with the fictional example provider:

```bash
PLUGIN_CONFIG_FILE="$PWD/config/fictional-plugin.json" npm start
```

The example consumes only the invented data in
`examples/fictional-plugin/example-plan.json`.

## Verification

```bash
npm run lint
npm run syntax
npm run typecheck
npm test
npm run test:e2e
npm run scan:public
```

For containers:

```bash
docker build -t techsitemanager:local .
docker compose up -d
curl --fail http://127.0.0.1:3000/api/health
```

## Architecture

The browser is plain JavaScript using native ES modules without a framework,
bundler, transpiler, or build step. A service-worker shell and IndexedDB
queues provide offline support. Offline mutations replay in FIFO order; transient and unclassified
failures remain queued, while permanent rejections are visible and explicitly
retryable. The server is CommonJS on Express, Knex, and SQLite. One
intentionally designed migration creates the generic fresh-install schema.

Plugin API V1 is a narrow trusted in-process boundary for import providers,
source connectors, named transformations, validated YAML profiles, and bounded
source-specific exporters. Plugins receive no supported Express, Knex, cookie,
raw-request, or core-write handle. They are trusted code, not sandboxed code.

Configured packages require exact version pins. Provider descriptors are
rendered by the generic browser shell, and bounded exporters are invoked only
through core-owned authenticated routes.

See [docs/PLUGINS.md](docs/PLUGINS.md),
[docs/IMPORT_PROVIDER_API.md](docs/IMPORT_PROVIDER_API.md), and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The runtime/language policy is recorded
in [ADR 0001](docs/adr/0001-node-javascript-typescript.md).
The privacy-safe measurement approach is documented in
[docs/PERFORMANCE_MEASUREMENT.md](docs/PERFORMANCE_MEASUREMENT.md).

## Licence

Original TechSiteManager code is licensed under the Apache License, Version
2.0 (`Apache-2.0`). See [LICENSE](LICENSE) and [COPYRIGHT.md](COPYRIGHT.md).
Third-party components remain under their respective licences; see
[docs/THIRD_PARTY_LICENSES.md](docs/THIRD_PARTY_LICENSES.md).

The copyright owner confirmed ownership of the original code and selected
`Apache-2.0` as the outbound licence. The publication event is not evidence of
technical, security, disclosure, organizational, or release approval that has
not otherwise been recorded.
