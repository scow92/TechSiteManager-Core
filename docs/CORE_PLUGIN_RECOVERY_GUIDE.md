# Core and plugin recovery working guide

This is the operational implementation checklist for making the public
TechSiteManager core a complete, usable application while keeping private
source interpretation in approved server-side plugins.

Point Codex to this file at the beginning of each task. Update it in the same
pull request as completed work so the first actionable unchecked item remains
clear.

## Authoritative decision

The original private TechSiteManager repository is frozen at commit
`4bc778e9e948bde4389c73b7b47553ea66146227`, the final commit in pull request
23. It is a read-only product reference. No migration, plugin, documentation,
deployment, or application work belongs in that repository after the freeze.

This public core repository owns all new generic application work. The private
plugin repository owns approved private parsers, mappings and source-shaped
exporters. A separate private deployment repository eventually pins and
combines immutable core and plugin releases.

The current public core has useful persistence, API, import and plugin
foundations, but it is not functionally equivalent to the frozen product.
Backend tables, routes, generic forms, similar styling, or a successful import
do not establish product parity.

## Start every Codex task here

1. Read `AGENTS.md`, this guide, `docs/PLUGINS.md`,
   `docs/IMPORT_PROVIDER_API.md`, and the relevant implementation files.
2. Inspect `git status --short --branch` before fetching or switching. Preserve
   user changes and use a short-lived task branch.
3. Select only the first actionable unchecked item whose dependencies are
   complete. Do not substitute a simpler generic feature for the specified
   workflow.
4. State the affected parity surface, test plan, data/migration impact and
   rollback before editing.
5. Implement the complete path: browser interaction, API, validation,
   transaction, persistence, authorization, concurrency, offline behavior,
   import/export and tests as applicable.
6. Record the commit or pull request and exact evidence before checking an item
   off. Report skipped checks explicitly.

Reusable prompt:

> Read `AGENTS.md` and `docs/CORE_PLUGIN_RECOVERY_GUIDE.md`. Work only on the
> first actionable unchecked item. The private original is frozen at
> `4bc778e9`; use it only as the golden reference. Preserve complete workflows,
> keep private interpretation in plugins, update the checklist with evidence,
> and stop rather than claiming partial API or visual work as parity.

## Ownership boundary

| Owner | Required responsibilities | Prohibited responsibilities |
| --- | --- | --- |
| Public core | Complete UI and domain workflows, generic schema, validation, routes, transactions, authorization, audit, concurrency, offline queues, backup/recovery, plugin contracts and generic renderers | Private source mappings, company data, private fixtures, credentials or deployment topology |
| Private plugin | Bounded source acquisition, parsing, mappings, profiles, transforms and source-shaped export through the public contract | Browser scripts, HTML/CSS, routes, migrations, Express, Knex, sessions, direct persistence or replacement application UI |
| Private deployment | Exact core/plugin pins, integrity data, secret references, image composition, runbooks, monitoring and rollback | A source fork or unreviewed application implementation |
| Frozen original | Read-only golden behavior, workflow and differential reference | New commits or use as the migration worktree |

Core must implement a useful feature even when no plugin is installed. A plugin
may change bounded terminology, field declarations and source interpretation;
it cannot supply missing executable behavior.

## Evidence and status rules

- `[ ]` means incomplete, including partially implemented work.
- `[x]` requires a commit or PR plus exact automated and manual evidence.
- A parent phase remains incomplete until every required child passes.
- Tests must use fictional public data. Private differential fixtures and
  reports stay in approved private repositories or environments.
- Intentional golden differences require an explicit reason, owner and
  acceptance test. There is no general visual or behavioral tolerance.
- Screenshot similarity is supporting evidence only. Verify interaction,
  persistence, reload, permissions, error states and offline behavior.

## Current position

- [x] **BASE-01** Create this repository with independent, public-safe history.
  Evidence: repository history and publication review tooling.
- [x] **BASE-02** Implement generic persistence, authentication, core API,
  import staging/reconciliation and Plugin API V1/V2 foundations.
  Evidence: existing server contract, route and plugin tests.
- [x] **BASE-03** Implement a generic responsive shell and data-only
  presentation renderer.
  Evidence: existing browser and visual tests. This does not establish product
  parity.
- [ ] **BASE-04** Replace the existing completion claims with an evidence-based
  capability inventory covering every workflow below.
- [ ] **BASE-05** Record formal technical, security, disclosure,
  organizational and product approval. Public visibility is not approval.

## Current next action

The next item is **INVENTORY-01**. Do not add more import or presentation polish
until the missing core workflows are recorded and ordered.

### Phase 1 — Establish the public-safe parity inventory

- [ ] **INVENTORY-01** Build a public-safe matrix mapping every frozen product
  workflow to its current core UI, API, persistence, offline and test coverage.
  Record `missing`, `partial`, or `verified`; never include private values.
- [ ] **INVENTORY-02** Replace or qualify checked claims in
  `docs/IMPLEMENTATION_PLAN.md`, `docs/VISUAL_PARITY.md` and release-readiness
  documents when they cover only styling, schema or API presence.
- [ ] **INVENTORY-03** Add failing fictional browser contract tests for the
  first missing workflow slice before implementing it.
- [ ] **INVENTORY-04** Agree the implementation order and migration strategy
  for existing candidate databases. Do not silently discard candidate data.

### Phase 2 — Restore complete site infrastructure workflows

- [ ] **CORE-SITE-01** Provide complete site create, read, update, search and
  optimistic-conflict workflows with admin/engineer/viewer behavior.
- [ ] **CORE-RACK-01** Add and edit canonical racks from the browser, including
  room ownership, default height, suite-line inference/confirmation, duplicate
  handling, concurrency and offline replay.
- [ ] **CORE-RACK-02** Implement usable front and rear rack elevations with
  add, move, resize and remove device interactions while preserving stable
  device keys.
- [ ] **CORE-RACK-03** Implement rack and per-device photo upload, metadata,
  current/history viewing, content retrieval, replacement and deletion with
  type, size, role and backup coverage.
- [ ] **CORE-ODF-01** Implement canonical termination-point/ODF create, edit,
  delete and relationship validation, including tray and fibre positions needed
  by schedules.
- [ ] **CORE-DEVICE-01** Implement the site device directory and canonical
  lowercase hostname/location behavior across schedules and racks.
- [ ] **CORE-DIST-01** Implement equipment-pair distance history, rack fallback,
  suggestions and the interactive distance calculator.

### Phase 3 — Restore complete work-package workflows

- [ ] **CORE-PACK-01** Implement an in-memory transactional pack editor for
  metadata, work items, circuits, nested segments and per-package requirements,
  with stable child identity and debounced saving.
- [ ] **CORE-PACK-02** Preserve live nested object references after successful
  saves and retain the navigation `flushAll` barrier.
- [ ] **CORE-WORK-01** Implement full tabbed child work-item editing,
  completion/clear-completion and assignment behavior.
- [ ] **CORE-HANDOVER-01** Implement package/work-item handover photo upload,
  naming, comments, gallery viewing and deletion with completion and role rules.
- [ ] **CORE-COMPLETE-01** Implement administrator-controlled package
  completion, mutation locks and reopening across UI, API and offline paths.
- [ ] **CORE-SEARCH-01** Match frozen search behavior for sites, package
  references, linked work items, projects and active/completed grouping.
- [ ] **CORE-EXPORT-01** Provide complete generic pack and print/PDF exports;
  keep source-shaped exporters in private plugins.

### Phase 4 — Restore usable cable schedules

- [ ] **CORE-CABLE-01** Implement the full editable grid renderer shared by
  fibre, copper and DAC pages rather than generic circuit/segment cards.
- [ ] **CORE-CABLE-02** Restore row creation, deletion, field helpers, fill
  behavior, direct editing, debounced save, errors, conflict handling and
  reload without detaching live inputs.
- [ ] **CORE-CABLE-03** Implement device and ODF endpoint modes, correct port
  controls, chained ODF hops and relationship validation.
- [ ] **CORE-CABLE-04** Implement endpoint room/rack autofill, transactional
  rack creation, committed rack corrections and canonical-reference updates.
- [ ] **CORE-FIBRE-01** Restore fibre-specific connector, type, mode, simplex,
  stock-length and item-type behavior.
- [ ] **CORE-COPPER-01** Restore copper-specific fields and row behavior.
- [ ] **CORE-DAC-01** Restore DAC-specific fields, direction and media behavior.
- [ ] **CORE-CABLE-05** Verify desktop, iPad, phone, keyboard, pointer, light,
  dark, print, viewer, completed and offline states for all three schedules.

### Phase 5 — Restore materials, catalogue and operational workflows

- [ ] **CORE-CONS-01** Implement shared consumables catalogue administration
  and per-package required quantities without conflating them.
- [ ] **CORE-BOM-01** Implement fibre SKU catalogue administration, exact
  matching, next-up lengths, simplex counts, totals, unmatched reasons and
  spreadsheet export.
- [ ] **CORE-USERS-01** Restore account request, approval, roles, engineer
  profiles, exact assignment matching and workload views.
- [ ] **CORE-PWA-01** Restore same-user navigation/viewport resumption, shell
  caching, notification setup and sign-out subscription behavior.
- [ ] **CORE-OFFLINE-01** Complete durable dirty-pack and infrastructure
  operation queues, FIFO replay, temporary-ID remapping, scoped conflicts,
  dead letters, pending logout and no-silent-loss testing.
- [ ] **CORE-OPS-01** Verify non-root/read-only containers, graceful shutdown,
  health checks, encrypted backups, isolated restore and backup-age monitoring.

### Phase 6 — Accept private providers without changing the product

- [ ] **PLUGIN-01** Pin an exact private package version and supported core
  range; verify zero-plugin and required-plugin startup independently.
- [ ] **PLUGIN-02** Differentially compare Work Request parsing, normalization,
  identity, reconciliation, apply, search and export against the frozen
  behavior using approved private fixtures.
- [ ] **PLUGIN-03** Differentially compare pasted-content parsing, security,
  normalization, preview and apply against the frozen behavior.
- [ ] **PLUGIN-04** Verify failed, cancelled, malformed, stale, ambiguous and
  rejected imports create no blank or partial records and retain no raw source.
- [ ] **PLUGIN-05** Verify installed plugins do not change any core workflow,
  route, permission, offline behavior or rendered interaction except an
  explicitly accepted private contribution.
- [ ] **PLUGIN-06** Run the private supported-core matrix and record immutable
  package, profile, exporter and combined-image hashes.

### Phase 7 — Migration and release acceptance

- [ ] **MIGRATE-01** Design a forward-only, reviewed bridge for candidate and
  approved legacy data. Rehearse only against restored copies.
- [ ] **MIGRATE-02** Preserve record relationships, stable device/child keys,
  photos, imported identity/provenance, ownership, versions, audit and durable
  offline work.
- [ ] **ACCEPT-01** Pass every critical workflow below with zero plugins using
  fictional data.
- [ ] **ACCEPT-02** Pass every critical workflow below with first-party plugins
  in the private integration environment.
- [ ] **ACCEPT-03** Complete exact golden workflow and screenshot comparisons at
  matching data, state, role, theme and viewport. Explain every difference.
- [ ] **ACCEPT-04** Complete security, disclosure, dependency, licence,
  package-content, container-layer, migration, backup and restore review.
- [ ] **ACCEPT-05** Obtain formal product, technical, security, disclosure and
  operational approval before calling the core production-ready.
- [ ] **CUTOVER-01** Rehearse and approve a versioned deployment/rollback
  runbook, then cut over immutable core and plugin versions through the private
  deployment repository.

## Critical workflow acceptance matrix

- [ ] **FLOW-01** Home, search, navigation context and reload/PWA resumption.
- [ ] **FLOW-02** Site, room, rack, ODF and device creation/editing.
- [ ] **FLOW-03** Front/rear rack elevation device editing and stable identity.
- [ ] **FLOW-04** Rack, device and handover photo lifecycle and recovery.
- [ ] **FLOW-05** Work-package details, assignments, work items and completion.
- [ ] **FLOW-06** Fibre cable schedule including ODF hops and fibre side effects.
- [ ] **FLOW-07** Copper and DAC schedule-specific editing behavior.
- [ ] **FLOW-08** Schedule-driven rack creation/correction and distance reuse.
- [ ] **FLOW-09** Consumables, fibre catalogue, BOM and exports.
- [ ] **FLOW-10** Work Request and pasted-content imports, reconciliation,
  retry, reimport, provenance, search and source-shaped export.
- [ ] **FLOW-11** Admin, manager, engineer and viewer permissions; account
  approval, workload, concurrency, completion locks and safe errors.
- [ ] **FLOW-12** Offline edit durability, replay, conflicts, dead letters,
  logout, notifications and reconnection.
- [ ] **FLOW-13** Fresh install, database bridge, backup, restore, container,
  shutdown, health and monitoring.
- [ ] **FLOW-14** Desktop, tablet, phone, light, dark and print rendering for
  every applicable state above.

The flow boxes represent final end-to-end acceptance. Do not check them merely
because a lower-level implementation item is complete.

## Required checks

Run focused tests during development. Before a core contract or acceptance
commit, run:

```bash
npm ci
npm run lint
npm run syntax
npm run typecheck
npm test
npm run test:e2e
npm run test:visual
npm run scan:public
npm run scan:history
npm run review:licenses
npm run review:package
```

Migration and deployment changes also require recovery tests, image build,
container smoke, non-root/read-only filesystem checks and restored-database
startup. Never test against the only operational database.

## Stop conditions

Stop and report rather than improvising when:

- a task would write to the frozen original repository;
- a plugin would need browser code, routes, migrations, Express, Knex or direct
  persistence;
- a core feature exists only as a table/API with no usable browser workflow;
- a screenshot test measures style but not the corresponding interaction;
- private data, mappings, paths, topology or source-derived fixtures would
  enter this repository;
- a migration or deployment lacks a verified backup, isolated restore and
  rollback;
- an unexplained golden differential remains;
- user work overlaps the files or branch needed for a change.

## Per-change handoff

Record the following in the pull request and add a concise row below:

```text
Checklist item:
Branch:
Commit/PR:
Core behavior changed:
Focused checks:
Full checks:
Skipped checks and reason:
Migration/backup impact:
Deployment/rollback impact:
Manual evidence:
Next unchecked item:
```

## Progress log

| Date | Item | Commit or PR | Evidence | Next action |
| --- | --- | --- | --- | --- |
| 2026-08-31 | Recovery decision | `6de4834` | Frozen original fixed at PR 23 commit `4bc778e9`; incomplete core parity acknowledged | INVENTORY-01 |
