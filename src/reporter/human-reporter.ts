import type {
  AnalysisResult,
  DiagnosticFinding,
} from "../models/index.js";
import { describeVersionRange } from "../osgi/index.js";
import { AEM_DOCTOR_VERSION } from "../version.js";
import { createReportSummary } from "./report-summary.js";

const DIVIDER = "─".repeat(48);

export function renderHumanReport(result: AnalysisResult): string {
  const summary = createReportSummary(result);
  const lines = [
    `AEM Doctor ${AEM_DOCTOR_VERSION}`,
    "",
    "Scanning:",
    summary.projectPath,
    "",
    `Maven modules discovered: ${summary.mavenModules}`,
    `Bundles discovered: ${summary.bundles}`,
    `Project bundles: ${summary.projectBundles}`,
    `Imported packages: ${summary.importedPackages}`,
    `Exported packages: ${summary.exportedPackages}`,
  ];

  if (summary.runtimePath !== undefined) {
    lines.push(
      `Runtime inventory: ${summary.runtimePath}`,
      `Runtime inventory complete: ${summary.runtimeInventoryComplete ? "yes" : "no"}`,
      `Runtime bundles: ${summary.runtimeBundles}`,
      `Runtime exported packages: ${summary.runtimeExportedPackages}`,
    );
  }

  if (result.context.warnings.length > 0) {
    lines.push("", "Analysis Warnings", DIVIDER);
    result.context.warnings.forEach((warning, index) => {
      lines.push(
        `${warning.code}: ${warning.message}`,
        ...(warning.sourcePath === undefined ? [] : [`Source: ${warning.sourcePath}`]),
        ...(warning.cause === undefined ? [] : [`Detail: ${warning.cause}`]),
      );
      if (index < result.context.warnings.length - 1) {
        lines.push("");
      }
    });
  }

  lines.push(
    "",
    "Dependency Analysis",
    DIVIDER,
    `Critical: ${summary.findings.CRITICAL}`,
    `Errors: ${summary.findings.ERROR}`,
    `Warnings: ${summary.findings.WARNING}`,
    `Info: ${summary.findings.INFO}`,
  );

  if (result.findings.length === 0) {
    lines.push("", "No diagnostic findings were produced.");
  } else {
    for (const finding of result.findings) {
      lines.push("", ...renderFinding(finding), "", DIVIDER);
    }
  }

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function renderFinding(finding: DiagnosticFinding): string[] {
  const lines = [
    finding.ruleId,
    `${finding.title} [${finding.severity}]`,
  ];

  addField(lines, "Package", finding.packageName);
  addField(lines, "Consumer", finding.consumerBundle);

  if (finding.requiredVersionRange !== undefined) {
    let readableRange: string | undefined;
    try {
      readableRange = describeVersionRange(finding.requiredVersionRange);
    } catch {
      // A finding may come from a future rule with a non-OSGi range format.
    }
    addField(
      lines,
      "Required",
      readableRange === undefined
        ? finding.requiredVersionRange
        : `${finding.requiredVersionRange} (${readableRange})`,
    );
  }

  addField(lines, "Provider", finding.providerBundle);
  addField(lines, "Provider source", finding.providerOrigin);
  addField(lines, "Available", finding.availableVersion);
  addField(lines, "Result", finding.resolution);
  addField(lines, "Diagnosis", finding.description);
  addField(lines, "Recommendation", finding.recommendation);
  return lines;
}

function addField(
  lines: string[],
  label: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    lines.push("", `${label}:`, value);
  }
}

function trimTrailingBlankLines(lines: string[]): string[] {
  while (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}
