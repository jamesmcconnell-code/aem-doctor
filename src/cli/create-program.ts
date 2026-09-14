import { Command } from "commander";

import { diagnoseProject } from "../diagnoser/index.js";
import type { DiagnosisOptions } from "../diagnoser/index.js";
import type { AnalysisResult } from "../models/index.js";
import { renderHumanReport, renderJsonReport } from "../reporter/index.js";
import { AEM_DOCTOR_VERSION } from "../version.js";

interface DiagnoseCommandOptions {
  readonly verbose?: boolean;
  readonly json?: boolean;
  readonly debug?: boolean;
  readonly runtimeBundles?: string;
}

export interface CliDependencies {
  readonly diagnose: (
    projectPath: string,
    options: DiagnosisOptions,
    hooks: { readonly onDebug?: (message: string) => void },
  ) => Promise<AnalysisResult>;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (text: string) => void;
  readonly setExitCode: (code: number) => void;
}

const defaultDependencies: CliDependencies = {
  diagnose: diagnoseProject,
  writeOut: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
  setExitCode: (code) => {
    process.exitCode = code;
  },
};

export function createProgram(
  dependencies: CliDependencies = defaultDependencies,
): Command {
  const program = new Command()
    .name("aem-doctor")
    .description("Deterministic diagnostics for Adobe Experience Manager projects")
    .version(AEM_DOCTOR_VERSION)
    .configureOutput({
      writeOut: dependencies.writeOut,
      writeErr: dependencies.writeErr,
    });

  program
    .command("diagnose")
    .description("Analyze an AEM Maven project for OSGi dependency problems")
    .argument("<path>", "AEM Maven project directory")
    .option("--verbose", "include compatible package findings")
    .option("--json", "emit structured JSON")
    .option("--debug", "write detailed analysis progress to stderr")
    .option(
      "--runtime-bundles <path>",
      "recursively scan a runtime bundle directory for providers",
    )
    .action(async (projectPath: string, commandOptions: DiagnoseCommandOptions) => {
      try {
        const analysisOptions: DiagnosisOptions = {
          verbose: commandOptions.verbose ?? false,
          debug: commandOptions.debug ?? false,
          ...(commandOptions.runtimeBundles === undefined
            ? {}
            : { runtimeBundlesPath: commandOptions.runtimeBundles }),
        };
        const result = await dependencies.diagnose(
          projectPath,
          analysisOptions,
          commandOptions.debug
            ? {
                onDebug: (message) =>
                  dependencies.writeErr(`[debug] ${message}\n`),
              }
            : {},
        );

        dependencies.writeOut(
          commandOptions.json
            ? renderJsonReport(result)
            : renderHumanReport(result),
        );
        dependencies.setExitCode(determineExitCode(result));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        dependencies.writeErr(`AEM Doctor could not complete analysis: ${detail}\n`);
        dependencies.setExitCode(2);
      }
    });

  return program;
}

export function determineExitCode(result: AnalysisResult): number {
  if (
    result.context.runtimeInventory?.complete === false ||
    result.context.warnings.some((warning) =>
      warning.code.startsWith("RUNTIME_"),
    )
  ) {
    return 2;
  }

  if (
    result.context.project.modules.length === 0 &&
    result.context.warnings.some(
      (warning) =>
        warning.code.startsWith("PROJECT_PATH_") ||
        warning.code === "NO_MAVEN_MODULES_FOUND",
    )
  ) {
    return 2;
  }

  return result.findings.some(
    (finding) =>
      finding.severity === "ERROR" || finding.severity === "CRITICAL",
  )
    ? 1
    : 0;
}
