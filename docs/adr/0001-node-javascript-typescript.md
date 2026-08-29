# ADR 0001: Retain Node.js and adopt incremental TypeScript checking

- Status: Accepted
- Date: 2026-08-29

## Context

TechSiteManager Core is a Node.js application with an Express/Knex/SQLite
server, a plain browser client, and Plugin API V1 packages loaded through
CommonJS. Runtime validators protect the application from JSON, YAML, plugin,
HTTP, and database boundary data. A language rewrite would create migration
and compatibility risk without evidence that it addresses a measured limit.

## Decision

Node.js remains the application runtime. Existing JavaScript remains supported,
and TypeScript is introduced incrementally as a strict, no-emit development and
CI checker for existing JavaScript and new internal code. No runtime TypeScript
loader is introduced.

Plugin API V1 remains CommonJS-compatible. Public declarations improve author
feedback but do not replace AJV, YAML schema validation, manual guards, bounds,
durable-ID checks, version checks, or registry-conflict checks. Runtime schemas
remain authoritative for untrusted and external values.

No Python or Go rewrite is planned. CPU-heavy JavaScript parsing may move to a
`worker_threads` worker or a child process only after measurement demonstrates
that isolation is needed. Python may be used only as an isolated parser/helper
when its ecosystem provides a demonstrated benefit. Go may be used for a
standalone utility or isolated service when a single binary or materially lower
resource use solves a measured operational need. Native Go plugins are not the
TechSiteManager plugin model.

Any language or process addition requires a measured need, a bounded and
versioned input/output contract, supported deployment and updates, timeouts and
resource limits, sanitized observability, failure recovery, and recovery tests.

## Consequences

JavaScript can be migrated gradually without changing startup or deployment.
Plugin authors retain the V1 CommonJS contract and gain declarations at stable
paths. Runtime and compile-time contracts must be kept aligned. Helper-process
complexity is deferred until evidence justifies its operational cost.

No performance benchmark is asserted by this decision.
