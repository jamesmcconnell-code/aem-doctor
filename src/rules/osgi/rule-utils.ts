import { basename } from "node:path";

import type {
  AnalysisContext,
  BundleOrigin,
  ImportedPackage,
  PackageProvider,
  Version,
} from "../../models/index.js";
import {
  formatVersion,
  parseVersion,
  satisfiesVersionRange,
} from "../../osgi/index.js";

const IMPLICIT_EXPORT_VERSION = parseVersion("0.0.0");

export function isOptionalImport(importedPackage: ImportedPackage): boolean {
  return importedPackage.directives.resolution?.toLowerCase() === "optional";
}

export function isProjectBundle(
  context: AnalysisContext,
  bundleId: string,
): boolean {
  return context.graph.bundles.get(bundleId)?.origin === "PROJECT";
}

export function getBundleOrigin(
  context: AnalysisContext,
  bundleId: string,
): BundleOrigin {
  const origin = context.graph.bundles.get(bundleId)?.origin;
  if (origin === undefined) {
    throw new Error(`Dependency graph references unknown bundle ${bundleId}`);
  }
  return origin;
}

export function getBundleDisplayName(
  context: AnalysisContext,
  bundleId: string,
): string {
  const manifest = context.graph.bundles.get(bundleId)?.manifest;
  if (manifest?.symbolicName !== undefined) {
    return manifest.symbolicName;
  }

  const fileName = basename(manifest?.jarPath ?? bundleId);
  return fileName.toLowerCase().endsWith(".jar")
    ? fileName.slice(0, -4)
    : fileName;
}

export function getProviderVersion(provider: PackageProvider): Version {
  return provider.exportedPackage.version ?? IMPLICIT_EXPORT_VERSION;
}

export function formatProviderVersion(provider: PackageProvider): string {
  return formatVersion(getProviderVersion(provider));
}

export function providerSatisfiesImport(
  importedPackage: ImportedPackage,
  provider: PackageProvider,
): boolean {
  return (
    importedPackage.versionRange === undefined ||
    satisfiesVersionRange(
      getProviderVersion(provider),
      importedPackage.versionRange,
    )
  );
}
