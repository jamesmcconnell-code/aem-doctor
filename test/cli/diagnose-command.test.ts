import { describe, expect, it, vi } from "vitest";

import { createProgram, determineExitCode } from "../../src/cli/create-program.js";
import { buildDependencyGraph } from "../../src/graph/index.js";
import type { AnalysisResult } from "../../src/models/index.js";
import { DEFAULT_ANALYSIS_OPTIONS } from "../../src/models/index.js";

describe("diagnose CLI command", () => {
  it("keeps JSON on stdout and debug progress on stderr", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const exitCodes: number[] = [];
    const diagnose = vi.fn(async (_path, options, hooks) => {
      hooks.onDebug?.("fixture debug event");
      expect(options).toMatchObject({ verbose: false, debug: true });
      expect(options.runtimeBundlesPath).toBe("/runtime");
      return createResult();
    });
    const program = createProgram({
      diagnose,
      writeOut: (text) => output.push(text),
      writeErr: (text) => errors.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    await program.parseAsync([
      "node",
      "aem-doctor",
      "diagnose",
      "/project",
      "--json",
      "--debug",
      "--runtime-bundles",
      "/runtime",
    ]);

    expect(diagnose).toHaveBeenCalledOnce();
    expect(() => JSON.parse(output.join(""))).not.toThrow();
    expect(output.join("")).not.toContain("fixture debug event");
    expect(errors.join("")).toBe("[debug] fixture debug event\n");
    expect(exitCodes).toEqual([0]);
  });

  it("passes verbose mode and renders a human report", async () => {
    const output: string[] = [];
    const diagnose = vi.fn(async (_path, options) => {
      expect(options.verbose).toBe(true);
      return createResult();
    });
    const program = createProgram({
      diagnose,
      writeOut: (text) => output.push(text),
      writeErr: () => undefined,
      setExitCode: () => undefined,
    });

    await program.parseAsync([
      "node",
      "aem-doctor",
      "diagnose",
      ".",
      "--verbose",
    ]);

    expect(output.join("")).toContain("AEM Doctor 0.0.2");
    expect(output.join("")).toContain("Dependency Analysis");
  });

  it("turns unexpected analysis failures into exit code 2", async () => {
    const errors: string[] = [];
    const exitCodes: number[] = [];
    const program = createProgram({
      diagnose: async () => {
        throw new Error("fixture failure");
      },
      writeOut: () => undefined,
      writeErr: (text) => errors.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    await program.parseAsync(["node", "aem-doctor", "diagnose", "."]);

    expect(errors.join("")).toContain("fixture failure");
    expect(exitCodes).toEqual([2]);
  });
});

describe("diagnose exit codes", () => {
  it("returns 0 for a completed scan without error findings", () => {
    expect(determineExitCode(createResult())).toBe(0);
  });

  it("returns 1 for ERROR or CRITICAL findings", () => {
    const result = createResult();
    expect(
      determineExitCode({
        ...result,
        findings: [
          {
            ruleId: "TEST-001",
            category: "OSGI",
            severity: "ERROR",
            title: "Fixture error",
            description: "Fixture description",
          },
        ],
      }),
    ).toBe(1);
  });

  it("returns 2 when no Maven project can be analyzed", () => {
    const result = createResult();
    expect(
      determineExitCode({
        context: {
          ...result.context,
          project: { rootPath: "/missing", modules: [] },
          warnings: [
            {
              code: "PROJECT_PATH_INVALID",
              message: "Missing project",
            },
          ],
        },
        findings: [],
      }),
    ).toBe(2);
  });

  it("returns 2 when a requested runtime inventory is incomplete", () => {
    const result = createResult();
    expect(
      determineExitCode({
        ...result,
        context: {
          ...result.context,
          runtimeInventory: {
            rootPath: "/missing-runtime",
            bundles: [],
            complete: false,
          },
          warnings: [
            {
              code: "RUNTIME_PATH_INVALID",
              message: "Missing runtime inventory",
            },
          ],
        },
      }),
    ).toBe(2);
  });
});

function createResult(): AnalysisResult {
  const graph = buildDependencyGraph([]);
  return {
    context: {
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
            artifactPaths: [],
          },
        ],
      },
      bundles: [],
      graph,
      warnings: [],
      options: DEFAULT_ANALYSIS_OPTIONS,
    },
    findings: [],
  };
}
