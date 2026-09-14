import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../../src/graph/index.js";
import type { AnalysisResult } from "../../src/models/index.js";
import { DEFAULT_ANALYSIS_OPTIONS } from "../../src/models/index.js";
import { parseBundleManifest } from "../../src/osgi/index.js";
import { renderHumanReport, renderJsonReport } from "../../src/reporter/index.js";
import { runDiagnosticRules } from "../../src/rules/index.js";

describe("human-readable reporter", () => {
  it("renders scan counts, normalized ranges, findings, and analysis warnings", () => {
    const result = createMismatchResult();
    const output = renderHumanReport(result);

    expect(output).toContain("AEM Doctor 0.0.2");
    expect(output).toContain("Maven modules discovered: 1");
    expect(output).toContain("Bundles discovered: 2");
    expect(output).toContain("Imported packages: 1");
    expect(output).toContain("Exported packages: 1");
    expect(output).toContain("Analysis Warnings");
    expect(output).toContain("FIXTURE_WARNING: Fixture warning");
    expect(output).toContain("AD-OSGI-002");
    expect(output).toContain("[5.12,5.13) (>= 5.12.0 and < 5.13.0)");
    expect(output).toContain("Available:\n5.11.2");
    expect(output).toContain("Provider source:\nPROJECT");
    expect(output).toContain("Result:\nINCOMPATIBLE");
  });
});

describe("JSON reporter", () => {
  it("emits a stable structured payload without graph Maps", () => {
    const report = JSON.parse(renderJsonReport(createMismatchResult())) as {
      schemaVersion: string;
      tool: { version: string };
      scan: { bundles: number };
      summary: { errors: number; analysisWarnings: number };
      findings: Array<{ ruleId: string }>;
      analysisWarnings: Array<{ code: string }>;
    };

    expect(report).toMatchObject({
      schemaVersion: "1.1",
      tool: { version: "0.0.2" },
      scan: { bundles: 2 },
      summary: { errors: 1, analysisWarnings: 1 },
    });
    expect(report.findings[0]?.ruleId).toBe("AD-OSGI-002");
    expect(report.findings[0]).toMatchObject({ providerOrigin: "PROJECT" });
    expect(report.analysisWarnings[0]?.code).toBe("FIXTURE_WARNING");
    expect(JSON.stringify(report)).not.toContain('"packages"');
  });

  it("includes runtime inventory counts and completeness", () => {
    const base = createMismatchResult();
    const runtimeBundle = parseBundleManifest(
      "/runtime/runtime.jar",
      "Bundle-SymbolicName: runtime.bundle\n" +
        "Export-Package: runtime.api;version=1.0.0\n\n",
    );
    const result: AnalysisResult = {
      ...base,
      context: {
        ...base.context,
        runtimeInventory: {
          rootPath: "/runtime",
          bundles: [runtimeBundle],
          complete: true,
        },
      },
    };

    expect(renderHumanReport(result)).toContain("Runtime bundles: 1");
    const json = JSON.parse(renderJsonReport(result)) as {
      scan: {
        bundles: number;
        projectBundles: number;
        runtimeBundles: number;
        runtimeInventory: {
          path: string;
          complete: boolean;
          exportedPackages: number;
        };
      };
    };
    expect(json.scan).toMatchObject({
      bundles: 3,
      projectBundles: 2,
      runtimeBundles: 1,
      runtimeInventory: {
        path: "/runtime",
        complete: true,
        exportedPackages: 1,
      },
    });
  });
});

function createMismatchResult(): AnalysisResult {
  const provider = parseBundleManifest(
    "/project/target/provider.jar",
    "Bundle-SymbolicName: example.provider\n" +
      "Export-Package: example.api;version=5.11.2\n\n",
  );
  const consumer = parseBundleManifest(
    "/project/target/consumer.jar",
    "Bundle-SymbolicName: example.consumer\n" +
      'Import-Package: example.api;version="[5.12,5.13)"\n\n',
  );
  const bundles = [provider, consumer];
  const graph = buildDependencyGraph(bundles);
  const context = {
    project: {
      rootPath: "/project",
      modules: [
        {
          pomPath: "/project/pom.xml",
          directory: "/project",
          coordinate: { artifactId: "fixture" },
          packaging: "jar",
          declaredModulePaths: [],
          dependencies: [],
          dependencyManagement: [],
          properties: {},
          artifactPaths: bundles.map((bundle) => bundle.jarPath),
        },
      ],
    },
    bundles,
    graph,
    warnings: [
      {
        code: "FIXTURE_WARNING",
        message: "Fixture warning",
        sourcePath: "/project/pom.xml",
      },
    ],
    options: DEFAULT_ANALYSIS_OPTIONS,
  } satisfies AnalysisResult["context"];

  return { context, findings: runDiagnosticRules(context) };
}
