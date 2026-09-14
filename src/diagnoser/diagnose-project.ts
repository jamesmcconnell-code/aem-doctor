import type {
  AnalysisOptions,
  AnalysisResult,
  AnalysisWarning,
  BundleManifest,
  RuntimeBundleInventory,
} from "../models/index.js";
import { DEFAULT_ANALYSIS_OPTIONS } from "../models/index.js";
import { buildDependencyGraph } from "../graph/index.js";
import { discoverMavenProject } from "../maven/index.js";
import { runDiagnosticRules } from "../rules/index.js";
import { discoverRuntimeJars, inspectJar } from "../scanner/index.js";
import { createAnalysisWarning } from "../scanner/warnings.js";
import { mapWithConcurrency } from "../utils/async.js";
import { compareStrings } from "../utils/order.js";

export interface DiagnosisHooks {
  readonly onDebug?: (message: string) => void;
}

export interface DiagnosisOptions extends Partial<AnalysisOptions> {
  readonly runtimeBundlesPath?: string;
}

const JAR_INSPECTION_CONCURRENCY = 16;

/** Run the deterministic project-local analysis pipeline. */
export async function diagnoseProject(
  projectPath: string,
  suppliedOptions: DiagnosisOptions = {},
  hooks: DiagnosisHooks = {},
): Promise<AnalysisResult> {
  const options: AnalysisOptions = Object.freeze({
    ...DEFAULT_ANALYSIS_OPTIONS,
    ...(suppliedOptions.verbose === undefined
      ? {}
      : { verbose: suppliedOptions.verbose }),
    ...(suppliedOptions.debug === undefined
      ? {}
      : { debug: suppliedOptions.debug }),
    ...(suppliedOptions.broadRangeMajorThreshold === undefined
      ? {}
      : {
          broadRangeMajorThreshold:
            suppliedOptions.broadRangeMajorThreshold,
        }),
  });
  const debug = hooks.onDebug ?? (() => undefined);

  debug(`Scanning project: ${projectPath}`);
  const mavenResult = await discoverMavenProject(projectPath);
  const warnings: AnalysisWarning[] = [...mavenResult.warnings];
  debug(`Maven modules parsed: ${mavenResult.project.modules.length}`);

  if (
    mavenResult.project.modules.length === 0 &&
    !warnings.some((warning) => warning.code.startsWith("PROJECT_PATH_"))
  ) {
    warnings.push(
      createAnalysisWarning(
        "NO_MAVEN_MODULES_FOUND",
        "No valid Maven pom.xml files were found under the supplied path",
        mavenResult.project.rootPath,
      ),
    );
  }

  const jarPaths = [
    ...new Set(
      mavenResult.project.modules.flatMap((module) => module.artifactPaths),
    ),
  ].sort(compareStrings);
  debug(`JARs discovered: ${jarPaths.length}`);

  const inspectionResults = await mapWithConcurrency(
    jarPaths,
    JAR_INSPECTION_CONCURRENCY,
    inspectJar,
  );
  const bundles: BundleManifest[] = [];
  for (const result of inspectionResults) {
    warnings.push(...result.warnings);
    if (result.manifest === undefined) {
      debug(`JAR skipped: ${result.jarPath}`);
      continue;
    }

    bundles.push(result.manifest);
    debug(
      `JAR inspected: ${result.jarPath} ` +
        `(${result.manifest.importedPackages.length} imports, ` +
        `${result.manifest.exportedPackages.length} exports)`,
    );
    for (const [name, value] of Object.entries(result.manifest.headers)) {
      debug(`Manifest header ${result.jarPath}: ${name}=${value}`);
    }
  }

  let runtimeInventory: RuntimeBundleInventory | undefined;
  if (suppliedOptions.runtimeBundlesPath !== undefined) {
    const runtimeDiscovery = await discoverRuntimeJars(
      suppliedOptions.runtimeBundlesPath,
    );
    warnings.push(...runtimeDiscovery.warnings);
    debug(`Runtime JARs discovered: ${runtimeDiscovery.jarPaths.length}`);
    const projectJarPaths = new Set(jarPaths);
    const runtimeJarPaths = runtimeDiscovery.jarPaths.filter(
      (jarPath) => !projectJarPaths.has(jarPath),
    );
    if (runtimeJarPaths.length !== runtimeDiscovery.jarPaths.length) {
      debug(
        `Runtime JARs overlapping project artifacts skipped: ` +
          `${runtimeDiscovery.jarPaths.length - runtimeJarPaths.length}`,
      );
    }

    const runtimeInspectionResults = await mapWithConcurrency(
      runtimeJarPaths,
      JAR_INSPECTION_CONCURRENCY,
      inspectJar,
    );
    const runtimeBundles: BundleManifest[] = [];
    let runtimeComplete = runtimeDiscovery.complete;

    for (const result of runtimeInspectionResults) {
      const significantWarnings = result.warnings.filter(
        (warning) => warning.code !== "JAR_MANIFEST_MISSING",
      );
      warnings.push(
        ...significantWarnings.map((warning) =>
          Object.freeze({
            ...warning,
            code: `RUNTIME_${warning.code}`,
          }),
        ),
      );
      if (significantWarnings.length > 0) {
        runtimeComplete = false;
      }

      if (result.manifest?.symbolicName === undefined) {
        debug(`Runtime JAR skipped (not an OSGi bundle): ${result.jarPath}`);
        continue;
      }

      runtimeBundles.push(result.manifest);
      debug(
        `Runtime bundle inspected: ${result.manifest.symbolicName} ` +
          `(${result.manifest.exportedPackages.length} exports)`,
      );
    }

    runtimeInventory = Object.freeze({
      rootPath: runtimeDiscovery.rootPath,
      bundles: Object.freeze(runtimeBundles),
      complete: runtimeComplete,
    });
  }

  const graph = buildDependencyGraph(
    bundles,
    runtimeInventory?.bundles ?? [],
  );
  const edgeCount = [...graph.packages.values()].reduce(
    (count, packageNode) =>
      count + packageNode.consumers.length + packageNode.providers.length,
    0,
  );
  debug(
    `Dependency graph: ${graph.bundles.size} bundles, ` +
      `${graph.packages.size} packages, ${edgeCount} edges`,
  );

  const context = Object.freeze({
    project: mavenResult.project,
    bundles: Object.freeze(bundles),
    ...(runtimeInventory === undefined ? {} : { runtimeInventory }),
    graph,
    warnings: Object.freeze(warnings),
    options,
  });
  const findings = runDiagnosticRules(context);
  debug(`Diagnostic rules completed: ${findings.length} findings`);

  return Object.freeze({ context, findings });
}
