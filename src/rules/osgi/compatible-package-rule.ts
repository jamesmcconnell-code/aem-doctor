import type {
  AnalysisContext,
  DiagnosticFinding,
} from "../../models/index.js";
import type { DiagnosticRule } from "../diagnostic-rule.js";
import {
  formatProviderVersion,
  getBundleOrigin,
  getBundleDisplayName,
  isProjectBundle,
  providerSatisfiesImport,
} from "./rule-utils.js";

export class CompatiblePackageRule implements DiagnosticRule {
  readonly id = "AD-OSGI-003";
  readonly category = "OSGI";

  analyze(context: AnalysisContext): readonly DiagnosticFinding[] {
    if (!context.options.verbose) {
      return Object.freeze([]);
    }

    const findings: DiagnosticFinding[] = [];
    for (const packageNode of context.graph.packages.values()) {
      for (const consumer of packageNode.consumers) {
        if (!isProjectBundle(context, consumer.bundleId)) {
          continue;
        }

        for (const provider of packageNode.providers) {
          if (!providerSatisfiesImport(consumer.importedPackage, provider)) {
            continue;
          }

          findings.push(
            Object.freeze({
              ruleId: this.id,
              category: this.category,
              severity: "INFO",
              title: "Compatible OSGi package",
              resolution: "COMPATIBLE",
              description:
                "The analyzed provider exports a package version compatible " +
                "with the consumer's import requirement.",
              packageName: packageNode.packageName,
              consumerBundle: getBundleDisplayName(context, consumer.bundleId),
              providerBundle: getBundleDisplayName(context, provider.bundleId),
              providerOrigin: getBundleOrigin(context, provider.bundleId),
              ...(consumer.importedPackage.versionRange === undefined
                ? {}
                : {
                    requiredVersionRange:
                      consumer.importedPackage.versionRange.raw,
                  }),
              availableVersion: formatProviderVersion(provider),
            }),
          );
        }
      }
    }

    return Object.freeze(findings);
  }
}
