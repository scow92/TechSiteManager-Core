# Plugins

Plugin API major 1 is deliberately small. Deployments list exact installed
package names in a JSON configuration file; an omitted configuration means no
plugins. Core never scans directories or downloads packages at runtime.

Every configured entry includes `package`, `required`, and an exact
`expectedVersion`. Ranges and mutable version labels are rejected. The loaded
package name/version, manifest version, and core compatibility range must all
agree before any contribution is published.

Supported contributions are import providers, source connectors, named
transforms, validated YAML profiles, and bounded exporters. Plugin IDs and
contribution IDs are durable lowercase namespaced identifiers.

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
