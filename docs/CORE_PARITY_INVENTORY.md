# Core parity inventory

This inventory is the evidence record for `INVENTORY-01`. It compares the
public core at `be54fb1` with the frozen product workflow at
`4bc778e9e948bde4389c73b7b47553ea66146227`. The frozen repository was inspected
with read-only Git commands. No source data, source-derived mappings,
operational values, private paths, or deployment topology are reproduced here.

The inventory measures complete workflows, not the presence of a similarly
named table, route, form, or screenshot. All examples and automated evidence
in the public core use fictional data.

## Status method

- **verified** — the current layer implements the frozen workflow slice and
  targeted automated evidence exercises its success and material failure
  states.
- **partial** — a relevant foundation or usable subset exists, but at least one
  required interaction, rule, state, or targeted test is absent.
- **missing** — no usable implementation of that workflow slice exists in the
  layer. A generic field or otherwise unused table does not raise this status.

The five layer columns are independent. For example, a persistence layer can
be partial while its browser workflow is missing. The overall status is never
higher than the weakest layer required by the workflow. A test is partial when
it proves only a lower-level contract or a visual state rather than the frozen
interaction.

## Evidence index

### Frozen workflow references

These paths are references at frozen commit `4bc778e9`; they are not files to
copy into the public repository.

| ID | Frozen workflow evidence |
| --- | --- |
| G1 | `index.html`; `js/app.js`; `js/views/home.js`; `server/test/home-site-search.test.js` — hierarchical navigation, home search, grouping and context. |
| G2 | `js/views/sites.js`; `server/routes/sites.js`; `server/test/atomic-concurrency.test.js` — site create/edit/delete and concurrency. |
| G3 | `js/views/rack.js`; `server/routes/racks.js`; `server/test/rack-suite.test.js` — canonical racks, suite-line confirmation and elevations. |
| G4 | `js/views/rack.js`; `server/routes/racks.js`; `server/test/routes.test.js` — rack and stable-device-key photo history. |
| G5 | `js/views/odf.js`; `server/routes/odfs.js`; `js/views/cable.js` — ODF records and schedule terminations. |
| G6 | `js/views/devices.js`; `server/routes/sites.js`; `server/test/device-names.test.js` — canonical device directory and hostname rules. |
| G7 | `js/views/distances.js`; `server/routes/sites.js`; `server/test/distance-matching.test.js` — distance history, fallback, suggestions and calculator. |
| G8 | `js/views/details.js`; `js/store.js`; `server/lib/pack.js`; `server/test/pack-version.test.js` — transactional pack editing, debounced saves and conflicts. |
| G9 | `js/views/work-orders.js`; `js/views/handover.js`; `server/routes/jobs.js`; `server/test/work-orders-pack.test.js` — tabbed work records, completion and handover evidence. |
| G10 | `js/views/details.js`; `server/routes/jobs.js`; `server/test/work-request-completion-lock.test.js` — administrator completion, locking and reopening. |
| G11 | `js/views/home.js`; `server/routes/jobs.js`; `server/test/home-site-search.test.js` — product search and active/completed grouping. |
| G12 | `js/export.js`; `js/views/details.js`; `js/views/bom.js`; `server/test/spreadsheet-roundtrip.test.js` — pack, print and material exports. |
| G13 | `js/views/cable.js`; `js/cable-locations.js`; `server/test/cable-locations.test.js`; `server/test/schedule-racks.test.js` — editable fibre, copper and DAC schedules. |
| G14 | `js/views/consumables.js`; `js/views/settings.js`; `server/routes/settings.js` — shared catalogue and per-package quantities. |
| G15 | `js/views/bom.js`; `server/lib/bom.js`; `server/routes/skus.js`; `server/test/bom.test.js` — fibre catalogue, matching, totals and export. |
| G16 | `js/auth.js`; `js/views/settings.js`; `js/views/home.js`; `server/routes/auth.js`; `server/routes/engineers.js` — requests, approvals, profiles, assignments and workload. |
| G17 | `js/idb.js`; `js/offline.js`; `js/store.js`; `js/app.js`; `sw.js`; `server/test/e2e/offline-integrity.playwright.js` — resumption and durable offline behavior. |
| G18 | `js/import.js`; `js/confluence.js`; `js/views/import.js`; `server/test/atomic-import.test.js`; `server/test/wr-diff.test.js` — source import, preview, reconciliation and retry. |
| G19 | `Dockerfile`; `docker-compose.yml`; `server/lib/backup.js`; `server/test/deployment-recovery.test.js` — install, container and recovery operations. |
| G20 | `css/styles.css`; `server/test/e2e/smoke.playwright.js`; `server/test/e2e/rack-overview.playwright.js` — viewport, theme, input and print states. |

### Current implementation references

| ID | Current core evidence |
| --- | --- |
| U1 | `public/index.html`; `public/js/main.js` — native-module shell, hash routing, context selectors and theme. |
| U2 | `public/js/views/home.js` — site/package search, creation and active/completed lists. |
| U3 | `public/js/views/sites.js` — site creation plus read-only infrastructure lists and rack previews. |
| U4 | `public/js/views/work-package.js` — explicit package save and generic child/circuit/requirement creation. |
| U5 | `public/js/presentation.js` — core-owned record, child-tab, connection-table, requirement and material renderers. |
| U6 | `public/js/views/import.js`; `public/js/import/descriptors.js`; `public/js/import/reconciliation.js` — provider inputs, preview, decisions and apply. |
| U7 | `public/js/auth.js`; `public/js/views/settings.js` — first-admin/login UI, account summary and appearance. |
| A1 | `server/routes/core.js` — generic infrastructure, package, child, search, export, catalogue and photo routes. |
| A2 | `server/routes/auth.js`; `server/lib/auth.js` — setup, login/logout, roles and administrator-managed users. |
| A3 | `server/routes/imports.js`; `server/imports/service.js`; `server/imports/reconcile.js` — validated drafts, reconciliation, apply and provenance. |
| A4 | `server/routes/presentations.js`; `server/plugins/export-service.js`; `server/plugins/presentations.js` — typed extension writes and bounded presentation/export contributions. |
| A5 | `server/app.js`; `server/server.js` — security middleware, readiness and graceful signal handling. |
| D1 | `server/db/migrations/0001_generic_baseline.js` — generic users, infrastructure, packages, children, materials, distances, photos, imports and audit. |
| D2 | `server/db/migrations/0002_plugin_api_v2_extensions.js` — plugin-scoped typed extension values. |
| O1 | `public/js/api.js`; `public/js/idb.js`; `public/js/offline.js`; `public/js/offline-ui.js` — cached reads, durable operation/dead-letter stores, FIFO replay, ID remaps and pending logout. |
| O2 | `public/sw.js`; `public/manifest.json` — versioned shell caching and install metadata. |
| R1 | `server/lib/backup.js`; `server/scripts/backup.js`; `server/scripts/restore.js`; `docs/BACKUP_AND_RESTORE.md` — SQLite-safe backup and isolated restore. |
| R2 | `Dockerfile`; `docker-compose.yml`; `docs/DEPLOYMENT.md` — non-root image, read-only root filesystem example and health check. |

### Current automated-test references

Test labels below include the exact test title when the file uses Node's test
runner. Playwright scripts are identified by their emitted journey or capture
group.

| ID | Current automated evidence |
| --- | --- |
| T1 | `server/test/core-routes.test.js` — `generic site, room, rack, termination point, device, distance, and catalogue APIs work`; `generic infrastructure and catalogue updates use optimistic concurrency`. |
| T2 | `server/test/core-routes.test.js` — `generic work package persists nested records and is searchable without plugins`; `optimistic concurrency requires a base version and rejects stale writes`; `generic work-item, circuit, segment, and requirement mutations preserve stable IDs and concurrency`. |
| T3 | `server/test/core-routes.test.js` — `zero-plugin all-record search finds generic infrastructure`; `generic JSON and CSV exports are available without plugins and neutralize formula cells`; `photo metadata listing does not return image bytes`. |
| T4 | `server/test/core-routes.test.js` — `setup, authentication, role authorization, and session revocation work`; `writer roles can mutate core records but administrator boundaries remain enforced`; `user administration is concurrent, audited, and preserves an active administrator`. |
| T5 | `server/test/core-routes.test.js` — `origin checks, security headers, and public errors do not leak internals`; `generic mutations create sanitized audit events`. |
| T6 | `server/test/offline-replay.test.js` — `FIFO replay durably remaps a temporary identity for dependent operations`; transient/unclassified retention; recoverable dead letters. |
| T7 | `server/test/browser-contracts.test.js` — exact shell coverage, network-first same-origin behavior, separated durable stores and logout-before-restore. |
| T8 | `server/test/e2e.playwright.js` — `PASS zero-plugin browser flow`; `PASS fictional-plugin import, navigation, reload and zero-plugin restart flow`. |
| T9 | `server/test/import-service.test.js` — atomic fictional import, no raw-source retention, idempotence, stable reordering, ownership conflicts, recoverable absence, stale/cancelled rejection and rollback. |
| T10 | `server/test/plugin-loader.test.js`; `server/test/plugin-modules.test.js`; `server/test/presentation-values.test.js` — zero-plugin startup, bounded contributions, presentation validation and typed extension concurrency. |
| T11 | `server/test/recovery.test.js` — `fresh generic baseline installs with integrity and no legacy migration history`; `SQLite-safe backup and restore preserve generic records and provenance`; overwrite/live-directory refusal. |
| T12 | `server/test/visual-parity.playwright.js` — desktop route captures and the home/package-details dark/light matrix at desktop, tablet portrait/landscape and phone portrait/landscape sizes. |

## Workflow matrix

### Home and site infrastructure

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | Home, hierarchical navigation, context and reload resumption | G1, G17 | **partial** — U1, U2 provide navigation and selectors but do not restore same-user view/scroll state | **partial** — A1 supplies lists/search; there is no resumption contract | **partial** — D1 stores records/sessions, not browser context | **partial** — O2 reloads the shell and cached GETs can reopen data | **partial** — T8 reloads selected pages; T12 covers only home/details responsively | **partial** — navigation works, but durable same-user context and viewport resumption are absent. |
| W02 | Site create, read, update and search with role/conflict behavior | G2 | **partial** — U2/U3 create, list, search and open; no edit/conflict UI | **verified** — A1 provides list/create/update/search, write authorization and optimistic version checks | **verified** — D1 has canonical sites, unique codes and versions | **partial** — U3 queues creation only; update/conflict replay is absent | **partial** — T1/T4 cover APIs and roles; T8 covers create/reload but not browser edit/conflict/viewer states | **partial** — complete API foundation, incomplete browser and offline workflow. |
| W03 | Room-owned canonical racks, default height, suite-line confirmation, duplicates and edit | G3 | **partial** — U3 displays rooms/racks and front previews; it cannot add or edit them | **partial** — A1 creates/updates rooms/racks with room ownership and default `47U`; no delete, inference/confirmation, duplicate/merge workflow | **partial** — D1 stores rooms, suite line, height and layouts | **missing** — no room/rack browser mutation is queueable | **partial** — T1 verifies generic create/update/concurrency; T12 is visual-only | **partial** — the data/API skeleton is not a usable canonical-rack workflow. |
| W04 | Front/rear rack elevation device add, move, resize and remove with stable identity | G3 | **missing** — U3 renders a read-only front preview and filters rear devices out | **partial** — A1 can create/update positioned devices but has no remove or layout interaction contract | **partial** — D1 stores side, U position, size and stable `device_key`; layout JSON is not exposed by the route | **missing** — no elevation operation is queued | **partial** — T1 seeds one device; T12 captures a static front elevation | **partial** — stable fields exist, but the elevation editor is missing. |
| W05 | Rack and per-device photo upload, current/history view, replacement and deletion | G4 | **missing** — there is no photo UI | **partial** — A1 uploads/lists/reads rack/device photos with type/size bounds; no delete, replacement/current semantics or device-key lifecycle | **partial** — D1 stores generic photo bytes/metadata but not immutable current/history relationships | **missing** — uploads and deletes have no queue policy | **partial** — T3 exercises only package upload/list/content and an orphan rejection | **partial** — a generic photo service exists without the frozen lifecycle. |
| W06 | ODF/termination create, edit, delete and tray/fibre relationship validation | G5 | **missing** — U3 is a read-only list | **partial** — A1 creates/updates a generic termination point; no delete, trays, fibre positions or schedule relationship validation | **partial** — D1 stores label/kind/notes/room only | **missing** — no termination mutation is queueable | **partial** — T1 covers generic create/update only | **partial** — generic records exist; schedule-usable ODF behavior does not. |
| W07 | Site device directory and canonical lowercase hostname/location reuse | G6 | **partial** — U3 lists devices but cannot maintain or reconcile them | **partial** — A1 lowercases create/update and binds a rack; schedules still use untyped endpoint text | **partial** — D1 enforces lowercase hostnames and stable keys but does not unify schedule endpoint identity | **missing** — device mutations are not queueable | **partial** — T1 covers generic device creation; T11 checks the lowercase database constraint | **partial** — canonical casing exists, cross-workflow identity does not. |
| W08 | Distance history, exact/rack fallback, suggestions and interactive calculator | G7 | **partial** — U3 lists samples only | **partial** — A1 appends/lists samples; no lookup, fallback, suggestion or calculator endpoint | **partial** — D1 stores endpoint pair, media, length and time without structured room/rack context | **missing** — no distance operation or cached suggestion policy | **partial** — T1 verifies append only | **partial** — history storage exists; the distance engine is missing. |

### Work packages and records

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W09 | In-memory transactional package editor for metadata and nested records | G8 | **partial** — U4 explicitly saves metadata and separately adds children; there is no live transactional pack editor or debounce | **partial** — A1 atomically creates a nested package and separately updates existing records; package update is metadata-only | **partial** — D1 stores packages, children, circuits, segments and requirements with versions | **missing** — `dirty-work-packages` exists in O1 but no package UI writes it | **partial** — T2 proves atomic create and individual stable-ID updates, not a browser pack transaction | **partial** — broad persistence/API coverage does not reproduce editor semantics. |
| W10 | Preserve live nested references after save and flush all pending writes before navigation | G8 | **missing** — U1/U4 rerender fetched objects after explicit saves and have no `flushAll` barrier | **partial** — A1 preserves public IDs on individual updates but exposes no save barrier | **partial** — D1 preserves IDs and versions | **missing** — no dirty-pack flush/recovery path is connected | **partial** — T2 checks stable IDs at API level only | **partial** — stable rows exist; the live-reference/navigation guarantee is missing. |
| W11 | Full tabbed work-item edit, assignment and complete/clear-complete behavior | G9 | **partial** — U4 has tabs, read-only panels and add; U5 can edit configured generic fields | **partial** — A1 creates/updates generic status/text but has no work-item assignment or completion contract | **partial** — D1 lacks work-item assignees and completion evidence fields | **missing** — no work-item write is queueable | **partial** — T2 covers generic API mutation; T12 captures a tabbed page without editing | **partial** — tabs exist, the frozen work workflow does not. |
| W12 | Package/work-item handover upload, naming, comments, gallery and deletion | G9 | **missing** — no handover/gallery UI | **partial** — A1 accepts generic package photos with name/description and reads them; work-item photos, metadata edit and delete are absent | **partial** — D1 has generic photo rows only | **missing** — no offline or explicit online-only handover policy | **partial** — T3 covers a package photo round trip only | **partial** — storage/upload foundation without handover behavior. |
| W13 | Administrator-controlled completion, mutation locks and reopening | G10 | **partial** — U4 exposes `complete` in the ordinary writer status selector | **partial** — A1 lets any writer set completion and does not lock subsequent writes | **partial** — D1 validates the status value but has no completed-state mutation guard | **missing** — no completion/lock replay rules | **missing** — no current test asserts admin-only completion, locking or reopening | **partial** — a status value exists, but required authorization and locks do not. |
| W14 | Search sites, package references, linked work items and projects with active/completed grouping | G11 | **partial** — U2 provides site/package search and separate recent groups; it filters API results to packages and lacks exact frozen match rules | **partial** — A1 searches many package/child/infrastructure fields, but misses some child fields and has no explicit ranking/group contract | **verified** — D1 stores the searched package/site/child fields and completion status | **partial** — cached searches can be read, but queued edits cannot update results | **partial** — T2/T3 and T8 cover representative search; no full matching/ranking/group matrix | **partial** — useful generic search exists without exact frozen behavior. |
| W15 | Complete generic pack export plus print/PDF; bounded source-shaped exporters | G12 | **partial** — U4 links JSON, CSV and plugin exporters; browser print is only generic CSS | **partial** — A1 supplies JSON/CSV and A4 bounded plugin export; no complete print/PDF or workbook contract | **partial** — exports project D1 records but have no durable export state | **missing** — export requires the server | **partial** — T3 tests JSON/CSV; T9 tests one fictional bounded exporter | **partial** — generic export exists, complete pack/print output does not. |

### Cable schedules

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W16 | Shared full editable grid for fibre, copper and DAC | G13 | **partial** — U4 shows generic circuit cards/tables; U5 can render a configured table of existing segments | **partial** — A1 has generic circuit/segment create/update | **partial** — D1 has logical circuits and physical segments but only generic endpoint strings | **missing** — schedule writes are not queueable | **partial** — T2 covers route mutations; T12 captures only the generic connections page | **partial** — a generic table is not the frozen schedule editor. |
| W17 | Row add/delete, helpers, fill, direct edit, debounce, error/conflict and reload-safe live inputs | G13 | **partial** — U4 adds rows and U5 explicitly saves existing cells; delete, helpers, fill, debounce and live-input conflict recovery are absent | **partial** — A1 creates/updates with versions but has no delete/batch row contract | **partial** — D1 versions rows but does not model pending browser edits | **missing** — no row operation is queued | **partial** — T2 proves API concurrency only; no browser interaction contract test | **partial** — basic add/update foundations only. |
| W18 | Device/ODF endpoint modes, correct port controls, chained ODF hops and relationship validation | G5, G13 | **missing** — endpoints are plain text inputs | **missing** — A1 accepts untyped endpoint strings and cannot validate ODF/device/port relationships | **partial** — D1 stores endpoint text and generic termination records without links | **missing** — no endpoint operation replay | **missing** — no current endpoint-mode/hop test | **missing** — the canonical termination workflow is absent. |
| W19 | Endpoint room/rack autofill, transactional rack creation/correction and distance reuse | G7, G13 | **missing** — no autofill, rack commit/correction or suggestion UI | **missing** — segment writes do not create/correct racks or query distance suggestions | **partial** — D1 has separate racks and distance samples with no canonical segment links | **missing** — no dependent operation chain is wired from schedules | **missing** — T6 proves generic ID remapping only, not schedule/rack behavior | **missing** — all cross-domain side effects remain to be designed. |
| W20 | Fibre connector/type/mode/simplex/stock-length/item-type behavior | G13, G15 | **missing** — the generic media field is the only fibre distinction | **missing** — no fibre-specific validation, helpers or stock lookup | **missing** — D1 has no fibre-specific segment fields or SKU catalogue | **missing** — no fibre edit policy | **missing** — no current fibre behavior tests | **missing** — the fibre workflow is absent. |
| W21 | Copper-specific fields and row behavior | G13 | **missing** — no copper-specific controls | **missing** — no copper-specific validation or behavior | **partial** — D1 can label a circuit `copper` but stores no copper-specific fields | **missing** — no copper edit policy | **missing** — no current copper behavior tests | **missing** — only a generic media label exists. |
| W22 | DAC-specific fields, direction and media behavior | G13 | **missing** — no DAC-specific controls | **missing** — no DAC direction/deduplication behavior | **partial** — D1 can label a circuit `dac` but stores no DAC-specific fields | **missing** — no DAC edit policy | **missing** — no current DAC behavior tests | **missing** — only a generic media label exists. |
| W23 | Schedule desktop/tablet/phone, keyboard/pointer, theme, print, viewer, completed and offline states | G20 | **partial** — generic responsive/theme/print rules exist, but not the full schedule states | **partial** — A1 supplies generic viewer/write enforcement but no completion lock | **partial** — D1 stores roles/status but not browser state | **partial** — O2 caches the shell; schedule data/mutations are not durable | **partial** — T12 covers home/details viewports and desktop connections only; no schedule interaction/state matrix | **partial** — broad shell visuals exist, schedule acceptance coverage does not. |

### Materials, users, PWA and offline behavior

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W24 | Shared consumables catalogue administration kept separate from package quantities | G14 | **partial** — U4 adds/lists package requirements; there is no catalogue administration UI or catalogue selector | **partial** — A1 separates admin catalogue routes from package requirement routes with concurrency, but neither family has delete/clear behavior | **verified** — D1 uses separate catalogue and requirement tables with optional linkage | **missing** — neither workflow is queueable | **partial** — T1/T2 test both API families; no browser catalogue or quantity-edit journey | **partial** — the model/API boundary is sound, the complete browser workflow is absent. |
| W25 | Fibre SKU catalogue, exact/next-up matching, simplex counts, totals, unmatched reasons and spreadsheet export | G15 | **missing** — no SKU or BOM UI | **missing** — no SKU catalogue, BOM calculation or spreadsheet export route | **missing** — no fibre SKU tables | **missing** — no BOM cache/fallback behavior | **missing** — no current matching or BOM export tests | **missing** — the entire BOM workflow is absent. |
| W26 | Account request/approval, roles, engineer profiles, exact assignment matching and workload | G16 | **partial** — U7 supports setup/login and displays the current role; no request, approval, user administration, profiles or workload UI | **partial** — A2 supports admin-created/updated users and four roles; no self-request/approval, profiles or workload | **partial** — D1 stores basic users/roles only | **partial** — O1 durably completes logout but does not cover account/workload actions | **partial** — T4 verifies API roles/admin concurrency; no browser or workload tests | **partial** — baseline access control exists; operational user workflows do not. |
| W27 | Same-user navigation/viewport resumption, shell caching, notifications and sign-out subscription behavior | G17 | **partial** — U1 has hash navigation/theme; no same-user saved route/scroll or notification setup | **partial** — A2 logs out; no push subscription endpoints | **partial** — D1 stores sessions but no push subscriptions or resumption ownership | **partial** — O1/O2 provide shell cache and durable pending logout | **partial** — T7/T8 cover shell reload and logout order; no notification/resumption test | **partial** — shell/offline logout foundations exist, resumption and notifications are absent. |
| W28 | Durable dirty-package and infrastructure queues, FIFO replay, ID remap, scoped conflicts, dead letters and no loss | G17 | **partial** — U3 queues only site creation; U4 never marks dirty packages; U2 exposes dead-letter retry status | **partial** — A1 has optimistic conflicts but no offline-specific reconciliation contract | **partial** — D1 provides versions/audit; durable client state lives only in O1 | **partial** — O1 implements generic FIFO, remaps, conservative retention, dead letters and pending logout, but most UI mutations never enqueue | **partial** — T6 tests replay mechanics and T8 one offline site create; no full workflow/no-loss matrix | **partial** — the queue engine is useful but largely disconnected from product mutations. |

### Imports, security and operations

| ID | Frozen workflow | Frozen evidence | UI | API | Persistence | Offline | Automated tests | Overall and missing behavior |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W29 | Work Request source import, reconciliation, retry/reimport, provenance, search and source-shaped export | G18 | **partial** — U6 supplies a complete generic provider preview/apply interaction; no approved frozen-source provider is present | **partial** — A3/A4 implement bounded provider, reconciliation and exporter contracts; frozen interpretation stays outside core | **verified** — D1/D2 store drafts, runs, links, ownership, versions, audit and typed extensions transactionally | **missing** — import is online-only | **partial** — T9/T10 and T8 use fictional providers; no approved differential golden evidence | **partial** — the core contract is strong, provider/integration parity is intentionally unverified. |
| W30 | Pasted inert content parsing, preview, apply and safe failure | G18 | **partial** — U6 renders a bounded text descriptor and normalized preview when a provider declares it | **partial** — A3 accepts bounded text artifacts but contains no frozen parser | **verified** — D1 uses the same transactional draft/provenance model without raw-source retention | **missing** — import is online-only | **partial** — T9 covers fictional artifact/security failures, not frozen pasted-content differentials | **partial** — generic capability exists; source-specific behavior remains plugin evidence. |
| W31 | Admin/manager/engineer/viewer permissions, concurrency, locks, audit and safe errors | G2, G8, G10, G16 | **partial** — viewer controls are hidden in several views, but role-specific admin/manager workflows and conflict resolution are absent | **partial** — A1/A2/A5 enforce broad write/admin boundaries, optimistic versions, origin checks and safe errors; completion locks are absent | **partial** — D1 has roles, versions and audit; it cannot enforce every workflow lock | **partial** — O1 preserves failures but treats conflicts as generic permanent dead letters | **partial** — T2/T4/T5 cover lower-level rules, not every workflow/role state | **partial** — core safeguards exist but acceptance must be repeated per workflow. |
| W32 | Fresh install, existing-database bridge, SQLite-safe backup and isolated restore | G19 | **missing** — operational workflow has no browser surface, as expected, and no operator UI is required | **partial** — startup migrates a fresh baseline; no candidate/legacy bridge contract exists | **partial** — D1/D2 install cleanly and R1 backs up/restores; migration preservation for candidate data is unproved | **missing** — operational recovery is not a browser-offline workflow | **partial** — T11 covers fresh install and generic restore only | **partial** — fresh/recovery foundations exist; the required forward bridge and representative migration proof do not. |
| W33 | Non-root/read-only container, graceful shutdown, health, encrypted backups and backup-age monitoring | G19 | **missing** — no user-facing operational surface is required or present | **partial** — A5 has readiness and signal shutdown; no backup-age endpoint | **partial** — R1 backs up SQLite with integrity/hash but does not encrypt or monitor it itself | **missing** — no disconnected operational workflow | **partial** — T11 covers backup/restore; no current container, shutdown, read-only or monitoring test | **partial** — checked-in hardening exists in R2, but container/recovery acceptance is incomplete. |
| W34 | Desktop, tablet, phone, light, dark and print rendering for every applicable workflow | G20 | **partial** — U1 and `public/css/styles.css` implement responsive, theme and print rules | **partial** — APIs are viewport-neutral, but missing workflow states cannot be rendered | **partial** — theme is local; same-user viewport state is not stored | **partial** — O2 caches shell assets but not every workflow state | **partial** — T12 covers home/details across viewports/themes and major routes at desktop dark; print, roles and most interactions are untested | **partial** — shell responsiveness is evidenced, product-wide rendering parity is not. |

## Acceptance-flow roll-up

No critical acceptance flow is verified end to end. This roll-up maps every
flow in the recovery guide to the detailed rows above; it does not replace the
layer evidence.

| Acceptance flow | Inventory rows | Status | Principal blockers |
| --- | --- | --- | --- |
| `FLOW-01` Home, search, navigation and resumption | W01, W14, W27 | **partial** | Exact search behavior and same-user route/scroll resumption. |
| `FLOW-02` Site, room, rack, ODF and device editing | W02, W03, W06, W07 | **partial** | Infrastructure browser create/edit/delete and full relationships. |
| `FLOW-03` Rack elevation editing and identity | W04 | **partial** | Usable front/rear editor and remove/move/resize behavior. |
| `FLOW-04` Rack, device and handover photos | W05, W12 | **partial** | Browser galleries, current/history rules, edit/delete and recovery evidence. |
| `FLOW-05` Package details, assignments, work items and completion | W09–W13 | **partial** | Transactional editor, work-item workflow, handover and admin completion locks. |
| `FLOW-06` Fibre schedule and ODF hops | W16–W20, W23 | **missing** | Typed endpoints, ODF chains and fibre-specific grid behavior. |
| `FLOW-07` Copper and DAC schedules | W16, W17, W21–W23 | **missing** | Media-specific fields, row semantics and acceptance states. |
| `FLOW-08` Schedule-driven racks and distances | W08, W19 | **missing** | Transactional rack correction/autofill and distance matching. |
| `FLOW-09` Consumables, fibre catalogue, BOM and exports | W15, W24, W25 | **missing** | Catalogue UI, complete export and the entire fibre SKU/BOM workflow. |
| `FLOW-10` Imports, reconciliation, retry, provenance, search and export | W14, W15, W29, W30 | **partial** | Approved provider differential evidence and online-only behavior. |
| `FLOW-11` Roles, approval, workload, concurrency, locks and safe errors | W13, W26, W31 | **partial** | Account lifecycle/workload UI and completion/conflict behavior. |
| `FLOW-12` Offline durability, replay, conflicts, logout and notifications | W27, W28 | **partial** | Queue integration for package/infrastructure edits, scoped conflict recovery and notifications. |
| `FLOW-13` Install, bridge, backup, container, shutdown, health and monitoring | W32, W33 | **partial** | Candidate bridge, encryption/monitoring and container acceptance tests. |
| `FLOW-14` Desktop, tablet, phone, theme and print | W23, W34 | **partial** | Product-wide interaction/state and print coverage. |

## Size and recovery order

The 34 detailed workflows contain **6 missing**, **28 partial**, and **0
verified** end-to-end outcomes. Verified lower layers are useful prerequisites,
not parity claims.

The evidence supports the existing recovery order:

1. Complete `INVENTORY-02` before feature work so styling/schema/API claims are
   qualified against this matrix.
2. Add the first failing fictional browser contract in `INVENTORY-03`, then
   agree migration and preservation strategy in `INVENTORY-04`.
3. Restore canonical site/infrastructure browser workflows before cable
   schedules depend on them.
4. Restore transactional package/work-item/completion semantics before adding
   package-wide offline replay and exports.
5. Build the shared cable grid and endpoint model before media-specific fibre,
   copper and DAC behavior; the BOM depends on the fibre model and catalogue.
6. Complete account, PWA, offline and operational acceptance before private
   provider and migration acceptance.

This inventory makes no feature, schema, migration, deployment or release
change. It does not check any `FLOW-*` acceptance box.
