import type { AnalysisResult, DiagnosticSeverity } from "../models/index.js";

export interface ReportSummary {
  readonly projectPath: string;
  readonly mavenModules: number;
  readonly bundles: number;
  readonly projectBundles: number;
  readonly runtimeBundles: number;
  readonly runtimePath?: string;
  readonly runtimeInventoryComplete?: boolean;
  readonly importedPackages: number;
  readonly exportedPackages: number;
  readonly runtimeExportedPackages: number;
  readonly findings: Readonly<Record<DiagnosticSeverity, number>>;
  readonly analysisWarnings: number;
}

export function createReportSummary(result: AnalysisResult): ReportSummary {
  const counts: Record<DiagnosticSeverity, number> = {
    INFO: 0,
    WARNING: 0,
    ERROR: 0,
    CRITICAL: 0,
  };

  for (const finding of result.findings) {
    counts[finding.severity] += 1;
  }

  const runtimeInventory = result.context.runtimeInventory;
  const projectBundles = result.context.bundles.length;
  const runtimeBundles = runtimeInventory?.bundles.length ?? 0;
  return Object.freeze({
    projectPath: result.context.project.rootPath,
    mavenModules: result.context.project.modules.length,
    bundles: projectBundles + runtimeBundles,
    projectBundles,
    runtimeBundles,
    ...(runtimeInventory === undefined
      ? {}
      : {
          runtimePath: runtimeInventory.rootPath,
          runtimeInventoryComplete: runtimeInventory.complete,
        }),
    importedPackages: result.context.bundles.reduce(
      (count, bundle) => count + bundle.importedPackages.length,
      0,
    ),
    exportedPackages: result.context.bundles.reduce(
      (count, bundle) => count + bundle.exportedPackages.length,
      0,
    ),
    runtimeExportedPackages:
      runtimeInventory?.bundles.reduce(
        (count, bundle) => count + bundle.exportedPackages.length,
        0,
      ) ?? 0,
    findings: Object.freeze(counts),
    analysisWarnings: result.context.warnings.length,
  });
}
