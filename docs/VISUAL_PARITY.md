# Visual foundation and regression contract

This document defines the implemented shell styling and screenshot-regression
contract. It does not claim verified product parity. The authoritative workflow
assessment is [`CORE_PARITY_INVENTORY.md`](CORE_PARITY_INVENTORY.md), especially
`W01`, `W03`, `W04`, `W09`–`W17`, `W23`, and `W34`.

- **Implemented technical foundation:** native-module shell, project-owned
  tokens, responsive navigation, dark/light themes, core renderers, and
  deterministic fictional screenshot signatures.
- **Partial browser workflows:** many captured pages are read-only lists,
  previews, generic forms, or incomplete tables.
- **Verified end-to-end product parity:** none; a perceptually stable screenshot
  does not verify interaction, persistence, reload, permissions, conflict, or
  offline behavior.
- **Formal approval and production readiness:** not established by this visual
  suite.

The generic browser shell uses the same project visual language as the original
TechSiteManager application: compact dark and light themes, a persistent
desktop sidebar, an off-canvas mobile navigation drawer, consistent surfaces,
forms, cards, badges, empty states, loading/error feedback, synchronization
status, focus treatment, and print-safe presentation.

The styling vocabulary applies to shared generic capabilities. The Home
hierarchy, context selectors, contextual navigation sections, content measure,
responsive drawer, record lists, detail sections, work-item tabs, generic
connection tables, read-only rack previews, forms, and import states use a
consistent project visual language. This does not mean they reproduce the
complete reference interactions. The browser remains native ES modules,
provider interpretation remains server-side, and core loads no plugin browser
scripts.

Intentional differences are:

- generic terms such as **Work Package**, **Work Item**, **External Reference**,
  **Segment Reference**, and **Import Provider** replace deployment-specific
  nouns;
- provider names and provider-specific controls appear only when a configured
  plugin contributes them;
- zero-plugin installations show a useful import empty state rather than a
  non-functional source-specific action;
- unsupported private integrations, source folder instructions, browser-side
  parsers, mappings, and source-shaped exports are absent from core; and
- accessibility, CSP, safe DOM construction, authentication disclosure, and
  offline durability behavior remain authoritative where exact geometry would
  conflict with them.

`npm run test:visual` exercises selected rendered states using only fictional
data. Home and work-package detail screenshots are captured in both themes at 1440×1000,
820×1180, 1180×820, 390×844, and 844×390. Additional desktop captures cover
account setup, sign-in, loading, empty, validation and safe-error states,
search, site lists, site overview, rooms, rack elevations, termination points,
devices, distances, work items, connections, consumables, handover galleries,
administrator-completed package state, print export, provider selection,
reconciliation, import result, and settings. Mobile captures cover the drawer,
header/footer shell, touch layout, and offline indicator.

Every run writes reviewable PNGs to a disposable directory outside the public
repository. CI compares a 48×48 RGB perceptual signature of each screenshot
against `server/test/visual-baselines.json`. A capture fails when more than 4%
of sampled cells exceed a 24-channel delta or the mean channel delta exceeds 5.
The compact signatures make material layout drift fail CI without placing
private-reference or generated screenshot artifacts in the public source tree.
They are supporting evidence only and are not pixel-exact golden comparisons
or behavioral tests. Update signatures only with
`UPDATE_VISUAL_BASELINES=1 npm run test:visual` after reviewing every generated
fictional capture in the suite.
