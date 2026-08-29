# Plugins

Plugin API major 2 extends the deliberately small V1 boundary. Deployments list exact installed
package names in a JSON configuration file; an omitted configuration means no
plugins. Core never scans directories or downloads packages at runtime.

Every configured entry includes `package`, `required`, and an exact
`expectedVersion`. Ranges and mutable version labels are rejected. The loaded
package name/version, manifest version, and core compatibility range must all
agree before any contribution is published.

Supported contributions are import providers, source connectors, named
transforms, validated YAML import profiles, validated data-only presentation
profiles, and bounded exporters. Plugin IDs and contribution IDs are durable
lowercase namespaced identifiers. Compatible V1 packages remain loadable but
cannot contribute presentations or extension fields.

Presentation profiles select only core-defined renderers such as record forms,
tabbed child records, filtered connection schedules, requirement tables, and
material summaries. They provide private nouns, labels, section order, filters,
and field bindings. A binding is either an allowlisted core field or an
`extension.<plugin-id>.<field-id>` value owned by that same plugin. Profiles
cannot supply JavaScript, HTML, CSS, SQL, URLs, routes, or database schemas.

Extension values are stored by core in a generic namespaced table. Core owns
their runtime type validation, authorization, optimistic versions, audit,
backup, import reconciliation, and cleanup. Removing a plugin hides its
presentation but does not reinterpret or silently delete retained values.

Required plugin failure prevents startup. Optional plugin failure omits that
plugin atomically and reports degraded readiness with a sanitized reason code.
Duplicate IDs, incompatible versions, invalid profiles, and package-root or
symlink escape are rejected before the frozen registry is published.

Exporters receive one deeply frozen, core-owned work-package projection and an
abort signal. They return one bounded `Buffer`; core chooses the response
headers and safe filename. Exporters do not receive a response object, route,
database handle, raw request, cookie, or session.

Plugins are trusted in-process Node code, not sandboxes. The narrow function
contract prevents accidental coupling but cannot stop a package from importing
filesystem, network, process, or database modules. Review and pin plugins like
core code and enforce real egress boundaries outside the process.

The fictional package under `examples/fictional-plugin/` demonstrates the
contract without representing a real source system. It is original project
example code licensed under `Apache-2.0`; dependencies loaded by a real plugin
retain their own licences and attribution requirements.

## Type contract kit

Plugin API V2 declarations are published in `types/plugin-api.d.ts` and the
normalized import/reconciliation declarations are in
`types/import-contracts.d.ts`. The root package remains `private: true`; these
paths document and check the source contract without publishing an npm package
or changing CommonJS loading.

A private plugin repository can pin a public TechSiteManager-Core tag or exact
commit as a development-only dependency and import types from
`techsitemanager/plugin-api` and `techsitemanager/import-contracts`. It may
instead copy the tagged `types/` directory together with `LICENSE`, recording
the source tag or commit and content hash. Do not copy from an untagged branch,
and do not copy deployment-specific or private material into the contract kit.

Type declarations help trusted plugin authors before execution. AJV, strict
YAML validation, manual guards, bounds, durable-ID checks, version checks, and
registry conflict checks remain authoritative for loaded or external data.
