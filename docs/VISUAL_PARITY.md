# Visual parity contract

The generic browser shell uses the same project visual language as the original
TechSiteManager application: compact dark and light themes, a persistent
desktop sidebar, an off-canvas mobile navigation drawer, consistent surfaces,
forms, cards, badges, empty states, loading/error feedback, synchronization
status, focus treatment, and print-safe presentation.

Visual parity applies to shared generic capabilities. It does not restore the
original browser architecture or source-specific workflows. The browser remains
native ES modules, provider interpretation remains server-side, and the core
loads no plugin browser scripts.

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

`npm run test:visual` exercises the shell with fictional data at desktop,
tablet, and mobile widths. It covers dark/light themes, zero-plugin and
fictional-plugin operation, initial loading, setup, empty and error states,
dashboard/search, room and rack previews, nested work-package records, mobile
navigation, offline indication, and import reconciliation preview.
Screenshots are written to a disposable directory outside the repository;
structural assertions enforce the shared visual tokens and responsive geometry.
