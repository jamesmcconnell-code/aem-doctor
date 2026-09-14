import type {
  AnalysisContext,
  DiagnosticFinding,
  VersionRange,
} from "../../models/index.js";
import type { DiagnosticRule } from "../diagnostic-rule.js";
import {
  formatProviderVersion,
  getBundleOrigin,
  getBundleDisplayName,
  isProjectBundle,
  providerSatisfiesImport,
} from "./rule-utils.js";

export class BroadVersionRangeRule implements DiagnosticRule {
  readonly id = "AD-OSGI-004";
  readonly category = "OSGI";

  analyze(context: AnalysisContext): readonly DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    for (const packageNode of context.graph.packages.values()) {
      for (const consumer of packageNode.consumers) {
        if (!isProjectBundle(context, consumer.bundleId)) {
          continue;
        }

        const range = consumer.importedPackage.versionRange;
        if (
          range === undefined ||
          !isBroadVersionRange(
            range,
            context.options.broadRangeMajorThreshold,
          )
        ) {
          continue;
        }

        const provider = packageNode.providers.find((candidate) =>
          providerSatisfiesImport(consumer.importedPackage, candidate),
        );
        if (provider === undefined) {
          continue;
        }

        findings.push(
          Object.freeze({
            ruleId: this.id,
            category: this.category,
            severity: "WARNING",
            title: "Suspiciously broad OSGi version range",
            resolution: "COMPATIBLE",
            description:
              `The import range ${range.raw} resolves against the analyzed ` +
              "provider, but it spans many major versions and could permit " +
              "runtime resolution against APIs that were not tested with this bundle.",
            packageName: packageNode.packageName,
            consumerBundle: getBundleDisplayName(context, consumer.bundleId),
            providerBundle: getBundleDisplayName(context, provider.bundleId),
            providerOrigin: getBundleOrigin(context, provider.bundleId),
            requiredVersionRange: range.raw,
            availableVersion: formatProviderVersion(provider),
            recommendation:
              "Use the narrowest range supported by the bundle's tested API " +
              "compatibility policy.",
          }),
        );
      }
    }

    return Object.freeze(findings);
  }
}

export function isBroadVersionRange(
  range: VersionRange,
  majorThreshold: number,
): boolean {
  const threshold =
    Number.isFinite(majorThreshold) && majorThreshold >= 0
      ? majorThreshold
      : 5;

  if (range.ceiling === undefined) {
    return true;
  }

  const floorMajor = range.floor?.version.major ?? 0;
  return range.ceiling.version.major - floorMajor >= threshold;
}
