# AEM Doctor

AEM Doctor is a deterministic command-line diagnostics tool for Adobe Experience Manager projects. Version 0.0.2 analyzes compiled project bundles and can optionally compare them with a user-supplied inventory of runtime OSGi bundles, without connecting to an AEM server.

It discovers Maven modules and their built JARs, parses OSGi package metadata, constructs a provenance-aware package dependency graph, and explains package resolution problems using only the supplied evidence.

No AI or LLM APIs are used.

AEM Doctor is an independent project and is not affiliated with, endorsed by, or sponsored by Adobe.

## Internal developer preview

Version 0.0.2 is an experimental proof of concept intended for authorized internal evaluation. Do not use its findings as the sole basis for production changes, and do not redistribute the project or its release artifacts.

During diagnosis, AEM Doctor:

- reads Maven POMs and compiled JAR manifests from the paths you supply;
- does not modify the analyzed project or its JARs;
- does not connect to an AEM server;
- does not upload project data or make network requests;
- reports only what can be established from the local evidence supplied.

Installing npm dependencies and cloning or downloading the project may still require network access.

### Pilot quick start

You must have access to the private repository, Node.js 22 or newer, npm, and Maven available locally.

```bash
git clone https://github.com/jamesmcconnell-code/aem-doctor.git
cd aem-doctor
npm ci
npm run build
```

Alternatively, download `aem-doctor-0.0.2.tgz` from the private [v0.0.2 prerelease](https://github.com/jamesmcconnell-code/aem-doctor/releases/tag/v0.0.2) and install it globally:

```bash
npm install --global ./aem-doctor-0.0.2.tgz
aem-doctor --version
```

Build the AEM project before diagnosing it:

```bash
cd /path/to/aem-project
mvn clean package
node /path/to/aem-doctor/dist/cli/index.js diagnose .
```

If you installed the prerelease tarball globally, run `aem-doctor diagnose .` instead of the `node` command above.

For a more complete analysis, supply a directory containing the relevant runtime OSGi bundle JARs:

```bash
node /path/to/aem-doctor/dist/cli/index.js diagnose . \
  --runtime-bundles /path/to/runtime/bundles
```

Do not attach proprietary POMs, JARs, source code, runtime bundles, or unredacted diagnostic output to GitHub issues. Report the smallest sanitized example that reproduces a problem.

### Providing feedback

Use the repository's [POC feedback form](https://github.com/jamesmcconnell-code/aem-doctor/issues/new?template=poc-feedback.yml) to describe usefulness and missing capabilities. Use the [bug report form](https://github.com/jamesmcconnell-code/aem-doctor/issues/new?template=bug-report.yml) for incorrect behavior or crashes.

## Version 0.0.2 scope

The current release:

- recursively discovers `pom.xml` files;
- parses common Maven coordinates, parents, modules, properties, dependencies, and dependency management;
- resolves common Maven property expressions and local parent inheritance;
- discovers primary JARs directly under module `target` directories;
- reads `META-INF/MANIFEST.MF` without extracting or modifying a JAR;
- parses `Import-Package`, `Export-Package`, `Require-Capability`, and `Provide-Capability` headers;
- compares OSGi versions and version ranges numerically;
- builds a graph supporting multiple consumers and providers per package;
- recursively inventories OSGi bundles in an optional runtime directory;
- distinguishes `PROJECT` providers from `RUNTIME` providers;
- resolves project imports against both project and supplied runtime exports;
- reports missing visible providers, incompatible versions, compatible versions in verbose mode, and suspiciously broad ranges;
- produces terminal and JSON output suitable for local use or CI integration.

## Requirements and installation

- Node.js 22 or newer
- npm
- A Maven project that has already been compiled or packaged

Install dependencies exactly as locked and build the CLI:

```bash
npm ci
npm run build
```

Run the compiled CLI from this checkout:

```bash
node dist/cli/index.js diagnose /path/to/aem/project
```

After the package is published to npm, the intended invocation is:

```bash
npx aem-doctor diagnose /path/to/aem/project
```

## Development

Install exactly the locked dependency versions and verify the project:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Run TypeScript directly during development:

```bash
npm run dev -- diagnose .
```

Run tests continuously:

```bash
npm run test:watch
```

## CLI usage

```text
aem-doctor diagnose <path> [options]

Options:
  --verbose  Include successful package resolutions (AD-OSGI-003)
  --json     Emit a structured JSON report
  --debug    Write detailed scanner and graph progress to stderr
  --runtime-bundles <path>
             Recursively scan a runtime bundle directory for providers
```

Examples:

```bash
npm run dev -- diagnose /path/to/aem/project
npm run dev -- diagnose . --verbose
npm run dev -- diagnose . --json
npm run dev -- diagnose . --json --debug
npm run dev -- diagnose . --runtime-bundles /path/to/runtime/bundles
npm run dev -- diagnose . --runtime-bundles /path/to/runtime/bundles --verbose
```

Debug output is written to stderr, so stdout remains valid JSON when `--json` and `--debug` are combined.

Exit codes are:

- `0`: analysis completed without `ERROR` or `CRITICAL` findings;
- `1`: at least one `ERROR` or `CRITICAL` finding was produced;
- `2`: the project or an explicitly requested runtime inventory could not be analyzed completely, or an unexpected fatal error occurred.

Analysis warnings such as a corrupt individual JAR do not by themselves change the exit code when the rest of the project can still be analyzed.

## Example output

```text
AEM Doctor 0.0.2

Scanning:
/work/my-aem-project

Maven modules discovered: 7
Bundles discovered: 3
Project bundles: 2
Imported packages: 163
Exported packages: 84
Runtime inventory: /opt/aem-runtime-bundles
Runtime inventory complete: yes
Runtime bundles: 1
Runtime exported packages: 126

Dependency Analysis
────────────────────────────────────────────────
Critical: 0
Errors: 1
Warnings: 0
Info: 0

AD-OSGI-002
OSGi package version mismatch [ERROR]

Package:
com.example.foo

Consumer:
my-project.core

Required:
[5.12,5.13) (>= 5.12.0 and < 5.13.0)

Provider:
example-provider

Provider source:
RUNTIME

Available:
5.11.2

Result:
INCOMPATIBLE

Diagnosis:
The analyzed provider's exported package version does not satisfy the consumer's import range. No compatible provider was found among the analyzed project bundles.
```

JSON schema 1.1 contains the tool version, project and runtime scan counts, runtime inventory completeness, provider provenance, severity summary, findings, and recoverable analysis warnings. It deliberately omits internal graph maps.

## Architecture

```text
CLI
 └─ diagnoser/orchestration
     ├─ filesystem scanner ── Maven POM parser
     ├─ project JAR reader ── OSGi manifest parser
     ├─ runtime inventory ─── recursive bundle discovery
     ├─ package dependency graph
     ├─ deterministic diagnostic rules
     └─ human or JSON reporter
```

The main source areas are:

- `src/cli`: argument parsing, output selection, and exit codes;
- `src/diagnoser`: end-to-end analysis orchestration;
- `src/scanner`: POM and JAR discovery plus safe JAR inspection;
- `src/maven`: POM parsing, local-parent inheritance, and property interpolation;
- `src/osgi`: manifest clauses, versions, and version ranges;
- `src/graph`: bundle/package consumer and provider relationships;
- `src/rules`: category-neutral rule contract and OSGi rules;
- `src/reporter`: terminal and JSON serialization;
- `src/models`: shared strongly typed domain contracts.

The CLI contains no parsing or diagnostic business logic. Diagnostic categories share a common rule interface so later `MAVEN`, `JAVA`, `AEM`, `FORMS`, `CLOUD`, and other rules can use the same engine.

## Diagnostic rules

| Rule | Default severity | Behavior |
| --- | --- | --- |
| `AD-OSGI-001` | `ERROR` | No provider was found among analyzed project bundles or the complete supplied runtime inventory. Optional imports are excluded. |
| `AD-OSGI-002` | `ERROR` | Providers exist, but none exports a version satisfying the mandatory import range. |
| `AD-OSGI-003` | `INFO` | Reports each compatible provider relationship when `--verbose` is enabled. |
| `AD-OSGI-004` | `WARNING` | A compatible import range spans at least five major versions or has no upper bound. |

The AD-OSGI-004 threshold is configurable through the programmatic analysis options. The CLI uses five major versions in 0.0.2.

An import is considered compatible when any analyzed project or runtime provider exports a satisfying version. Runtime bundle imports are indexed but do not produce diagnostics; the runtime inventory is used as provider evidence for project bundles. An export with no version attribute uses the OSGi default `0.0.0`. A versionless import accepts any version.

For the motivating AEM Forms example, `5.12.3` correctly satisfies both `[5.12,5.13)` and `[1.0.0,10.0.0)`. The latter relationship is compatible and also receives the broad-range warning; it is not reported as a version mismatch.

## Limitations

AEM Doctor 0.0.2 knows about providers in compiled project JARs and, when `--runtime-bundles` is supplied, readable OSGi bundles found recursively under that directory. It does not automatically know which runtime directory corresponds to a target AEM environment, and it does not include Maven dependencies outside the project or separately deployed bundles unless their JARs are placed in the supplied runtime inventory.

Therefore, AD-OSGI-001 means:

> No provider was found among the analyzed project bundles and any complete runtime inventory that was supplied.

Without a complete runtime inventory, this does **not** prove that the package is absent from AEM. Every missing-provider finding describes the evidence boundary it used.

Additional limitations:

- modules must be built first; AEM Doctor scans source metadata but does not compile the project;
- Maven resolution is intentionally partial and never contacts a Maven repository;
- external parent POMs and full Maven effective-model semantics are not resolved;
- only primary `target/*.jar` artifacts are inspected; source, Javadoc, and `original-*` JARs are ignored;
- runtime inventory input must be a directory of readable JAR files; AEM Doctor does not extract an AEM Quickstart or download an SDK;
- runtime inventories are scanned on each invocation and do not yet have a reusable catalog format;
- OSGi capabilities are extracted but not yet resolved;
- `uses` constraints, fragments, execution environments, dynamic imports, and full framework wiring are not modeled;
- optional imports do not produce missing-provider or mismatch errors;
- there is no AEM version catalog or product-specific compatibility matrix;
- malformed POMs, JARs, manifests, and OSGi metadata are skipped with analysis warnings, so incomplete evidence may produce an incomplete graph.

AEM Doctor reports only what the available evidence proves and does not infer an AEM root cause from a package relationship alone.

## Roadmap

The recommended next technical step for 0.0.3 is a versioned runtime catalog command and file format. Exporting a normalized package inventory once and reusing it in CI would make runtime evidence faster, portable, reviewable, and reproducible without redistributing proprietary bundle binaries.

Later releases may add:

- Maven dependency and external-parent resolution;
- reusable runtime catalog generation and ingestion;
- AEM and Java compatibility catalogs;
- AEM Forms and Core Components compatibility rules;
- Cloud Manager preflight checks;
- content package and Dispatcher diagnostics;
- CI-friendly baseline and suppression support;
- migration and architectural diagnostics.

Web UI, SaaS infrastructure, authentication, billing, AI integration, Adobe APIs, automatic source modification, and server connectivity are intentionally outside the 0.0.2 scope.
