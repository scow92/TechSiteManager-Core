# Generic core implementation plan

This is the public-safe delivery checklist for the generic candidate. It
contains no source-system mappings, legacy schema knowledge, operational data,
or private repository details.

## Repository construction and disclosure

- [x] Start from a new root commit with no inherited Git ancestry.
- [x] Keep the candidate and its remote private during the original
  implementation and evidence review.
- [x] Define and enforce the candidate source allowlist.
- [x] Use one generic fresh-install migration rather than historical
  migrations.
- [x] Complete tracked-file, package, secret, binary, dependency, licence, and
  container-layer review.
- [x] Verify the implementation branch from a fresh private clone; repeat on
  the final documentation commit before handoff.

## Generic core

- [x] Model sites, rooms, racks, termination points, devices, work packages,
  work items, circuits, segments, distances, consumables, photos, users,
  sessions, audit, and import provenance.
- [x] Give linkable records stable opaque public identifiers.
- [x] Provide zero-plugin reads, package search, generic JSON/CSV exports,
  optimistic concurrency, authentication, role checks, and backup/restore.
- [x] Complete mutation validation, audit, entity existence checks, and
  optimistic-concurrency coverage across the generic routes.
- [x] Extend zero-plugin search across generic infrastructure and package child
  records.
- [x] Add login throttling without account-existence disclosure.
- [x] Complete browser navigation and remaining authorization regression
  coverage.

## Plugin and import contract

- [x] Load only explicitly configured CommonJS packages.
- [x] Validate manifests, compatibility, profiles, contribution identifiers,
  package roots, and duplicate registry identifiers before freezing the
  registry.
- [x] Support bounded providers, connectors, named transforms, strict YAML
  profiles, and bounded exporters without plugin routes or browser code.
- [x] Stage, validate, preview, reconcile, approve, and atomically apply
  imports with stable links and field ownership.
- [x] Preserve manual divergence and represent source absence without deleting
  core records.
- [x] Tighten configuration/contribution schemas and approval validation.
- [x] Expose required exporters through a bounded core-owned route.
- [x] Complete descriptor-driven controls for every supported input type.

## Offline and operations

- [x] Keep API traffic out of the service-worker cache.
- [x] Use IndexedDB for disposable caches, durable operations, dead letters,
  dirty packages, and pending logout.
- [x] Harden FIFO replay, response classification, queued dependencies, and
  pending-logout recovery.
- [x] Provide SQLite-safe online backup, verified restore, and integrity tests.
- [x] Provide a zero-plugin, non-root, read-only-container deployment.
- [x] Complete container smoke, layer, and filesystem inspection.

## Acceptance

- [x] Baseline lint, syntax, unit/integration, browser, disclosure, dependency
  audit, and zero-plugin/fictional-plugin paths pass.
- [x] Add focused tests for every item completed above.
- [x] Run the complete acceptance matrix and record passed, failed, and skipped
  checks in `docs/RELEASE_READINESS.md`.
- [x] Push reviewable checkpoints to the candidate branch while it was
  private.
- [x] Record the owner-selected `Apache-2.0` outbound licence.
- [x] Record that the source repository became public at commit
  `5d98b43f349c8329df71b0c1a603782b0c4ff368` on 2026-08-29 at 08:40:53 UTC.
- [ ] Record formal technical, security, disclosure, organizational, and
  publication approvals if they are later completed; public visibility alone
  does not establish them.
