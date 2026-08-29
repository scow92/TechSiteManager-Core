# Plugin and import security

Configured plugins are trusted application code. Manifest permissions are
inventory only, not enforcement. Use container/network policy or a separate
service when an enforced isolation or egress boundary is required.

YAML profiles are data only. Core rejects duplicate keys, unknown keys or
versions, anchors, aliases, merge keys, custom tags, excessive size/depth,
unknown transforms, secret-shaped fields, executable expressions, SQL/HTTP
logic, and filesystem escape.

Presentation profiles additionally restrict entity types, components, core
bindings, plugin namespaces, field types, limits, options, section references,
and view counts. Only authenticated users receive the active sanitized
descriptor. The browser never loads files or executable code from a plugin.

Raw uploaded or pasted artifacts are transient and are not stored by default.
Core persists hashes, stable source identity, provider/profile versions,
normalized expiring drafts, decisions, links, ownership, warning codes, and
bounded summaries. Logs and safe errors must never contain raw source values,
credentials, authorization headers, cookies, package paths, or stacks.

Provider work has a wall-clock budget and receives an `AbortSignal`.
Synchronous in-process code cannot be forcibly interrupted; hard CPU or memory
isolation requires a future worker/process boundary.
