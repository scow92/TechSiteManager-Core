# TechSiteManager

TechSiteManager is a generic planning and record application for structured-
cabling work in technical spaces. It stores sites, rooms, racks, termination
points, devices, work packages, work items, circuits, physical segments,
distances, consumables, photos, assignments, audit history, and import
provenance.

The application is useful with no plugins. Core implements technical
foundations for generic search and editing, JSON/CSV export, authentication,
optimistic concurrency, offline shell/queue behavior, and backup/restore.
Those foundations do not yet form complete browser workflows for the frozen
product reference; see the
[core parity inventory](docs/CORE_PARITY_INVENTORY.md).

The browser provides a compact responsive planning shell with dark and light
themes, desktop and mobile navigation, consistent record cards and forms, and
visible loading, empty, error, and synchronization states. Shared presentation
is documented in [docs/VISUAL_PARITY.md](docs/VISUAL_PARITY.md); private source
terminology and interpretation remain plugin-owned.

## Status

This source repository is public. Version `1.1.0-rc.1` is a release candidate.
Plugin API V2 adds validated data-only presentation profiles and plugin-scoped
typed extension values while retaining compatible Plugin API V1 packages.
The version label identifies the candidate; it is not a production-readiness
or product-parity claim.

- **Implemented technical foundations:** generic persistence and APIs,
  authentication/authorization, import and plugin contracts, the responsive
  shell, selected offline primitives, and SQLite-safe backup/restore.
- **Partial browser workflows:** the inventory records 16 partial workflows;
  later cable, materials, users, PWA and operational paths remain incomplete.
- **Verified detailed workflows:** 12 of 34 inventory rows now have end-to-end
  implementation evidence. Six workflows are missing, no critical `FLOW-*`
  acceptance item is checked, and screenshot regression is not interaction
  parity.
- **Formal approval and production readiness:** not established. Required
  human approvals, migration evidence, full workflow acceptance, and
  operational gates remain incomplete.

The authoritative status sources are
[CORE_PARITY_INVENTORY.md](docs/CORE_PARITY_INVENTORY.md) and
[CORE_PLUGIN_RECOVERY_GUIDE.md](docs/CORE_PLUGIN_RECOVERY_GUIDE.md).

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
npm run test:visual
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
stores provide offline foundations. The generic queue engine replays FIFO,
retains transient and unclassified failures, and exposes permanent rejections.
The complete work-package graph and selected infrastructure mutations enqueue;
product-wide offline acceptance remains incomplete. The server is CommonJS on
Express, Knex, and SQLite. Purpose-built generic migrations create the
fresh-install schema; no candidate/legacy database bridge exists yet.

Plugin API V2 is a narrow trusted in-process boundary for import providers,
source connectors, named transformations, validated YAML import and
presentation profiles, and bounded source-specific exporters. Presentation
profiles contain data only: core validates the allowed components, bindings,
labels, field types and bounds, then core-owned browser components render them.
Plugin-scoped extension values use core-owned validation, persistence,
authorization, optimistic concurrency, import reconciliation and audit.
Plugins receive no supported Express, Knex, cookie, raw-request, browser-code,
or core-write handle. They are trusted code, not sandboxed code.

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
