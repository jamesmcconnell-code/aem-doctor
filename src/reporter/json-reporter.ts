import type { AnalysisResult } from "../models/index.js";
import { AEM_DOCTOR_VERSION } from "../version.js";
import { createReportSummary } from "./report-summary.js";

export function renderJsonReport(result: AnalysisResult): string {
  const summary = createReportSummary(result);
  const report = {
    schemaVersion: "1.1",
    tool: {
      name: "AEM Doctor",
      version: AEM_DOCTOR_VERSION,
    },
    scan: {
      path: summary.projectPath,
      mavenModules: summary.mavenModules,
      bundles: summary.bundles,
      projectBundles: summary.projectBundles,
      runtimeBundles: summary.runtimeBundles,
      ...(summary.runtimePath === undefined
        ? {}
        : {
            runtimeInventory: {
              path: summary.runtimePath,
              complete: summary.runtimeInventoryComplete,
              exportedPackages: summary.runtimeExportedPackages,
            },
          }),
      importedPackages: summary.importedPackages,
      exportedPackages: summary.exportedPackages,
    },
    summary: {
      critical: summary.findings.CRITICAL,
      errors: summary.findings.ERROR,
      warnings: summary.findings.WARNING,
      info: summary.findings.INFO,
      analysisWarnings: summary.analysisWarnings,
    },
    findings: result.findings,
    analysisWarnings: result.context.warnings,
  };

  return `${JSON.stringify(report, null, 2)}\n`;
}
