# Visual parity contract

The generic browser shell uses the same project visual language as the original
TechSiteManager application: compact dark and light themes, a persistent
desktop sidebar, an off-canvas mobile navigation drawer, consistent surfaces,
forms, cards, badges, empty states, loading/error feedback, synchronization
status, focus treatment, and print-safe presentation.

Visual parity applies to shared generic capabilities. The Home hierarchy,
context selectors, contextual navigation sections, content measure, responsive
drawer, record lists, detail sections, work-item tabs, connection tables, rack
elevations, forms, import preview and result states now follow the original
application's layout and interaction patterns. The browser remains native ES
modules, provider interpretation remains server-side, and the core loads no
plugin browser scripts.

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

`npm run test:visual` exercises the shell using only fictional data. Home and
work-package detail screenshots are captured in both themes at 1440×1000,
820×1180, 1180×820, 390×844, and 844×390. Additional desktop captures cover
account setup, sign-in, loading, empty, validation and safe-error states,
search, site lists, site overview, rooms, rack elevations, termination points,
devices, distances, work items, connections, consumables, provider selection,
reconciliation, import result, and settings. Mobile captures cover the drawer,
header/footer shell, touch layout, and offline indicator.

Every run writes reviewable PNGs to a disposable directory outside the public
repository. CI compares a 48×48 RGB perceptual signature of each screenshot
against `server/test/visual-baselines.json`. A capture fails when more than 4%
of sampled cells exceed a 24-channel delta or the mean channel delta exceeds 5.
The compact signatures make material layout drift fail CI without placing
private-reference or generated screenshot artifacts in the public source tree.
Update signatures only with `UPDATE_VISUAL_BASELINES=1 npm run test:visual`
after reviewing the complete fictional screenshot matrix.
