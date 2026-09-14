import type {
  AnalysisContext,
  DiagnosticFinding,
} from "../../models/index.js";
import type { DiagnosticRule } from "../diagnostic-rule.js";
import {
  getBundleDisplayName,
  isOptionalImport,
  isProjectBundle,
} from "./rule-utils.js";

export class MissingExportedPackageRule implements DiagnosticRule {
  readonly id = "AD-OSGI-001";
  readonly category = "OSGI";

  analyze(context: AnalysisContext): readonly DiagnosticFinding[] {
    const findings: DiagnosticFinding[] = [];

    for (const packageNode of context.graph.packages.values()) {
      if (packageNode.providers.length > 0) {
        continue;
      }

      for (const consumer of packageNode.consumers) {
        if (
          !isProjectBundle(context, consumer.bundleId) ||
          isOptionalImport(consumer.importedPackage)
        ) {
          continue;
        }

        const description =
          context.runtimeInventory?.complete !== true
            ? `No provider for ${packageNode.packageName} was found among the ` +
              "analyzed project bundles. This package may be supplied by the " +
              "AEM runtime or another external dependency."
            : `No provider for ${packageNode.packageName} was found among the ` +
              "analyzed project bundles or the supplied runtime bundle inventory. " +
              "Another external dependency may still supply this package.";

        findings.push(
          Object.freeze({
            ruleId: this.id,
            category: this.category,
            severity: "ERROR",
            title: "No project-local package provider",
            resolution: "UNRESOLVED",
            description,
            packageName: packageNode.packageName,
            consumerBundle: getBundleDisplayName(context, consumer.bundleId),
            ...(consumer.importedPackage.versionRange === undefined
              ? {}
              : {
                  requiredVersionRange:
                    consumer.importedPackage.versionRange.raw,
                }),
            recommendation:
              "Verify that the target AEM runtime or an external bundle supplies " +
              "this package; otherwise add a compatible provider to the deployment.",
          }),
        );
      }
    }

    return Object.freeze(findings);
  }
}
