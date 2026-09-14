import type {
  AnalysisContext,
  DiagnosticFinding,
} from "../../models/index.js";
import type { DiagnosticRule } from "../diagnostic-rule.js";
import {
  formatProviderVersion,
  getBundleOrigin,
  getBundleDisplayName,
  isOptionalImport,
  isProjectBundle,
  providerSatisfiesImport,
} from "./rule-utils.js";

export class VersionMismatchRule implements DiagnosticRule {
  readonly id = "AD-OSGI-002";
  readonly category = "OSGI";

  analyze(context: AnalysisContext): readonly DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    for (const packageNode of context.graph.packages.values()) {
      if (packageNode.providers.length === 0) {
        continue;
      }

      for (const consumer of packageNode.consumers) {
        const importedPackage = consumer.importedPackage;
        if (
          !isProjectBundle(context, consumer.bundleId) ||
          importedPackage.versionRange === undefined ||
          isOptionalImport(importedPackage)
        ) {
          continue;
        }

        const compatibleProviderExists = packageNode.providers.some((provider) =>
          providerSatisfiesImport(importedPackage, provider),
        );
        if (compatibleProviderExists) {
          continue;
        }

        for (const provider of packageNode.providers) {
          findings.push(
            Object.freeze({
              ruleId: this.id,
              category: this.category,
              severity: "ERROR",
              title: "OSGi package version mismatch",
              resolution: "INCOMPATIBLE",
              description:
                "The analyzed provider's exported package version does not " +
                "satisfy the consumer's import range. No compatible provider " +
                "was found among the analyzed project bundles.",
              packageName: packageNode.packageName,
              consumerBundle: getBundleDisplayName(context, consumer.bundleId),
              providerBundle: getBundleDisplayName(context, provider.bundleId),
              providerOrigin: getBundleOrigin(context, provider.bundleId),
              requiredVersionRange: importedPackage.versionRange.raw,
              availableVersion: formatProviderVersion(provider),
              recommendation:
                "Align the provider version or dependency configuration so a " +
                "compatible package is available at runtime.",
            }),
          );
        }
      }
    }

    return Object.freeze(findings);
  }
}
