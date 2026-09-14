# Changelog

All notable changes to AEM Doctor will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.2] - 2026-09-14

### Added

- Optional recursive runtime bundle inventory scanning.
- Provider provenance distinguishing project and runtime bundles.
- Runtime-aware missing-package and version-range diagnostics.
- Runtime inventory metadata in human-readable and JSON reports.
- JSON report schema version 1.1.
- Internal developer-preview guidance and structured feedback forms.

### Changed

- Restricted diagnostics to imports from project bundles while retaining runtime bundles as provider evidence.
- Improved missing-provider wording to describe the available evidence accurately.
- Protected the proof-of-concept package from accidental npm publication.

## [0.0.1] - 2026-09-14

### Added

- Recursive Maven project and module discovery.
- Safe compiled JAR and OSGi manifest scanning.
- OSGi version and version-range parsing.
- Package dependency graph construction.
- Deterministic missing-provider, version-mismatch, compatible-provider, and broad-range rules.
- Human-readable and JSON CLI reports.
- Automated unit and integration tests.

[Unreleased]: https://github.com/jamesmcconnell-code/aem-doctor/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/jamesmcconnell-code/aem-doctor/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/jamesmcconnell-code/aem-doctor/releases/tag/v0.0.1
