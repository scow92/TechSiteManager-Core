# Gradual TypeScript checking

TypeScript is a development and CI tool for the existing JavaScript runtime.
`npm run typecheck` uses strict, no-emit checking; application startup remains
`node server/server.js`, and Plugin API V1 remains CommonJS-compatible.

The checked scope expands in reviewable stages instead of hiding diagnostics
with broad exclusions or relaxed compiler settings:

1. Configuration, public error shaping, validation helpers, and optimistic
   concurrency are the initial strict server boundary.
2. Public Plugin API and import declarations add strict fictional-plugin and
   compile-time contract fixtures.
3. Plugin loading, profiles, imports, reconciliation, provenance, exporters,
   and database transaction callbacks join the server
   configuration as their runtime guards and JSDoc types are strengthened.
4. Native browser modules are checked by `tsconfig.browser.json` with strict
   DOM types and no emitted output. Classic IndexedDB/offline primitives remain
   covered by executable contract and Playwright tests while their staged
   declaration work is pending.

Server tests continue to run as executable unit and integration tests during
the migration. Strict compile-time fixtures are added with the public contract
kit; the remaining JavaScript test harnesses will move into a dedicated strict
configuration as their fixture builders gain explicit types. This staged test
scope does not relax the strict runtime configuration.

Do not use blanket `any`, `@ts-ignore`, `skipLibCheck`, generated JavaScript, or
broad path exclusions to make checking pass. External data remains `unknown`
until runtime validation narrows it, and runtime schemas remain authoritative.
