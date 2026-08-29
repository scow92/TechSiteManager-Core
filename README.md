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

This repository is a private public-release candidate. It must not be made
public until the owner completes the disclosure review and chooses an outbound
license. No license has been granted yet.

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

The browser is plain JavaScript with a service-worker shell and IndexedDB
queues. The server is CommonJS on Express, Knex, and SQLite. One intentionally
designed migration creates the generic fresh-install schema.

Plugin API V1 is a narrow trusted in-process boundary for import providers,
source connectors, named transformations, validated YAML profiles, and bounded
source-specific exporters. Plugins receive no supported Express, Knex, cookie,
raw-request, or core-write handle. They are trusted code, not sandboxed code.

Configured packages require exact version pins. Provider descriptors are
rendered by the generic browser shell, and bounded exporters are invoked only
through core-owned authenticated routes.

See [docs/PLUGINS.md](docs/PLUGINS.md),
[docs/IMPORT_PROVIDER_API.md](docs/IMPORT_PROVIDER_API.md), and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
