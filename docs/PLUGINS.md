# Plugins

Plugin API major 1 is deliberately small. Deployments list exact installed
package names in a JSON configuration file; an omitted configuration means no
plugins. Core never scans directories or downloads packages at runtime.

Supported contributions are import providers, source connectors, named
transforms, validated YAML profiles, and bounded exporters. Plugin IDs and
contribution IDs are durable lowercase namespaced identifiers.

Required plugin failure prevents startup. Optional plugin failure omits that
plugin atomically and reports degraded readiness with a sanitized reason code.
Duplicate IDs, incompatible versions, invalid profiles, and package-root or
symlink escape are rejected before the frozen registry is published.

Plugins are trusted in-process Node code, not sandboxes. The narrow function
contract prevents accidental coupling but cannot stop a package from importing
filesystem, network, process, or database modules. Review and pin plugins like
core code and enforce real egress boundaries outside the process.

The fictional package under `examples/fictional-plugin/` demonstrates the
contract without representing a real source system.
