import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../../src/graph/index.js";
import type {
  AnalysisContext,
  BundleManifest,
} from "../../src/models/index.js";
import {
  DEFAULT_ANALYSIS_OPTIONS,
} from "../../src/models/index.js";
import { parseBundleManifest } from "../../src/osgi/index.js";
import {
  BroadVersionRangeRule,
  CompatiblePackageRule,
  MissingExportedPackageRule,
  VersionMismatchRule,
  isBroadVersionRange,
  runDiagnosticRules,
} from "../../src/rules/index.js";
import { parseVersionRange } from "../../src/osgi/index.js";

describe("AD-OSGI-001 missing exported package", () => {
  it("reports mandatory missing imports with an external-provider caveat", async () => {
    const consumer = await loadBundle("missing-consumer.MF");
    const findings = new MissingExportedPackageRule().analyze(
      createContext([consumer]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: "AD-OSGI-001",
      severity: "ERROR",
      resolution: "UNRESOLVED",
      packageName: "com.example.missing",
      consumerBundle: "com.example.missing-consumer",
      requiredVersionRange: "[1.0,2.0)",
    });
    expect(findings[0]?.description).toContain(
      "may be supplied by the AEM runtime or another external dependency",
    );
  });

  it("does not treat optional imports as mandatory failures", async () => {
    const consumer = await loadBundle("missing-consumer.MF");
    const findings = new MissingExportedPackageRule().analyze(
      createContext([consumer]),
    );

    expect(findings.some((finding) => finding.packageName === "com.example.optional-missing")).toBe(false);
  });
});

describe("AD-OSGI-002 version mismatch", () => {
  it("reports an incompatible analyzed provider", async () => {
    const provider = await loadBundle("provider.MF");
    const consumer = await loadBundle("incompatible-consumer.MF");
    const findings = new VersionMismatchRule().analyze(
      createContext([provider, consumer]),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "AD-OSGI-002",
        severity: "ERROR",
        resolution: "INCOMPATIBLE",
        packageName: "com.example.incompatible",
        consumerBundle: "com.example.incompatible-consumer",
        providerBundle: "com.example.provider",
        requiredVersionRange: "[5.12,5.13)",
        availableVersion: "5.11.2",
      }),
    ]);
  });

  it("considers an import resolved when any provider is compatible", async () => {
    const provider = await loadBundle("provider.MF");
    const consumer = await loadBundle("incompatible-consumer.MF");
    const compatibleProvider = parseBundleManifest(
      "/bundles/compatible-provider.jar",
      "Bundle-SymbolicName: compatible.provider\n" +
        "Export-Package: com.example.incompatible;version=5.12.3\n\n",
    );

    expect(
      new VersionMismatchRule().analyze(
        createContext([provider, compatibleProvider, consumer]),
      ),
    ).toEqual([]);
  });
});

describe("AD-OSGI-003 compatible package", () => {
  it("is silent unless verbose mode is enabled", async () => {
    const provider = await loadBundle("provider.MF");
    const consumer = await loadBundle("compatible-consumer.MF");
    const rule = new CompatiblePackageRule();

    expect(rule.analyze(createContext([provider, consumer]))).toEqual([]);
    expect(
      rule.analyze(createContext([provider, consumer], { verbose: true })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "AD-OSGI-003",
          resolution: "COMPATIBLE",
          packageName: "com.example.compatible",
          requiredVersionRange: "[5.12,5.13)",
          availableVersion: "5.12.3",
        }),
      ]),
    );
  });

  it("uses 0.0.0 for an export with no declared version", async () => {
    const provider = await loadBundle("provider.MF");
    const consumer = await loadBundle("compatible-consumer.MF");
    const findings = new CompatiblePackageRule().analyze(
      createContext([provider, consumer], { verbose: true }),
    );
    const unversioned = findings.find(
      (finding) => finding.packageName === "com.example.unversioned",
    );

    expect(unversioned?.availableVersion).toBe("0.0.0");
  });

  it("recognizes both real Forms ranges as compatible", async () => {
    const provider = await loadBundle("provider.MF");
    const broadConsumer = await loadBundle("formsgenai-consumer.MF");
    const narrowConsumer = await loadBundle("print-consumer.MF");
    const findings = new CompatiblePackageRule().analyze(
      createContext([provider, broadConsumer, narrowConsumer], { verbose: true }),
    );

    expect(findings.map((finding) => finding.requiredVersionRange)).toEqual([
      "[1.0.0,10.0.0)",
      "[5.12,5.13)",
    ]);
    expect(findings.every((finding) => finding.availableVersion === "5.12.3")).toBe(true);
  });
});

describe("AD-OSGI-004 suspicious broad version range", () => {
  it("warns only when a broad range resolves", async () => {
    const provider = await loadBundle("provider.MF");
    const broadConsumer = await loadBundle("broad-consumer.MF");
    const missingConsumer = await loadBundle("missing-consumer.MF");
    const findings = new BroadVersionRangeRule().analyze(
      createContext([provider, broadConsumer, missingConsumer]),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "AD-OSGI-004",
        severity: "WARNING",
        resolution: "COMPATIBLE",
        packageName: "com.example.broad",
        requiredVersionRange: "[1.0.0,10.0.0)",
        availableVersion: "5.12.3",
      }),
    ]);
  });

  it("uses the configured major-version threshold", () => {
    const range = parseVersionRange("[1.0.0,10.0.0)");
    expect(isBroadVersionRange(range, 5)).toBe(true);
    expect(isBroadVersionRange(range, 10)).toBe(false);
    expect(isBroadVersionRange(parseVersionRange("[1.0,)"), 100)).toBe(true);
  });
});

describe("diagnostic rule engine", () => {
  it("runs the default rule set deterministically", async () => {
    const manifests = await Promise.all([
      loadBundle("provider.MF"),
      loadBundle("missing-consumer.MF"),
      loadBundle("incompatible-consumer.MF"),
      loadBundle("broad-consumer.MF"),
    ]);
    const ruleIds = runDiagnosticRules(createContext(manifests)).map(
      (finding) => finding.ruleId,
    );

    expect(ruleIds).toEqual(["AD-OSGI-001", "AD-OSGI-002", "AD-OSGI-004"]);
  });
});

function createContext(
  bundles: readonly BundleManifest[],
  options: Partial<AnalysisContext["options"]> = {},
): AnalysisContext {
  return {
    project: { rootPath: "/project", modules: [] },
    bundles,
    graph: buildDependencyGraph(bundles),
    warnings: [],
    options: { ...DEFAULT_ANALYSIS_OPTIONS, ...options },
  };
}

async function loadBundle(name: string): Promise<BundleManifest> {
  const fixture = new URL(`../fixtures/bundles/${name}`, import.meta.url);
  return parseBundleManifest(`/bundles/${name}.jar`, await readFile(fixture));
}
