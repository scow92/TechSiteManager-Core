# Third-party licensing

TechSiteManager's original code is licensed under `Apache-2.0`. Dependencies
and base images are separate works and remain under their respective licences.
The authoritative dependency versions and package provenance are recorded in
`package-lock.json`; the generated CycloneDX SBOM supplies the complete
machine-readable inventory for each reviewed candidate commit.

## Dependency review

The release-candidate dependency review covers runtime, development, and
transitive npm packages. Every installed package declares a licence from this
reviewed set: `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`,
`BlueOak-1.0.0`, `ISC`, or `MIT`. These licences permit redistribution with
their required licence and attribution text retained.

Direct runtime dependencies are Ajv, better-sqlite3, Express, Knex,
safe-regex2, semver, and YAML. Direct development dependencies are ESLint,
globals, Playwright, and the project-owned fictional example plugin. The
example plugin has no third-party dependencies and is licensed under
`Apache-2.0` with its own copy of `LICENSE`.

Installed dependency distributions retain their upstream licence files and
package metadata. Playwright and playwright-core also include upstream
`NOTICE` files for code derived from Puppeteer; those files remain in each
development dependency's package directory. Development dependencies are not
copied into the production container. No reviewed production dependency
contains an upstream `NOTICE` file requiring aggregation into a project
`NOTICE`.

## Bundled assets

The tracked candidate contains no vendored JavaScript, fonts, icon files,
images, source maps, copied templates, test archives, or other third-party
binary/static assets. In particular, SheetJS is not present. The browser UI
uses project-authored text and CSS rather than a redistributed icon or font
library.

## Containers

The container build uses the official Node.js slim image as a build stage and
a digest-pinned Google distroless Node.js image as the runtime base. The final
image retains the runtime base's own licence material and the licence files
inside production npm package directories. TechSiteManager does not relabel
base-image or dependency code as `Apache-2.0`.

## NOTICE decision

No project-level `NOTICE` file is included. The review found no attribution
that must be moved into such a file, and an empty `NOTICE` could misleadingly
suggest otherwise. Upstream notices remain with the components to which they
apply.
