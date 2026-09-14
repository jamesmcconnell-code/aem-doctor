import type { AnalysisWarning, DiagnosticFinding } from "./diagnostics.js";
import type { DependencyGraph } from "./graph.js";
import type { MavenProject } from "./maven.js";
import type { BundleManifest } from "./osgi.js";

export const DEFAULT_ANALYSIS_OPTIONS: AnalysisOptions = Object.freeze({
  verbose: false,
  debug: false,
  broadRangeMajorThreshold: 5,
});

export interface AnalysisOptions {
  readonly verbose: boolean;
  readonly debug: boolean;
  readonly broadRangeMajorThreshold: number;
}

export interface AnalysisContext {
  readonly project: MavenProject;
  /** Bundles built by modules in the supplied Maven project. */
  readonly bundles: readonly BundleManifest[];
  readonly runtimeInventory?: RuntimeBundleInventory;
  readonly graph: DependencyGraph;
  readonly warnings: readonly AnalysisWarning[];
  readonly options: AnalysisOptions;
}

export interface RuntimeBundleInventory {
  readonly rootPath: string;
  readonly bundles: readonly BundleManifest[];
  readonly complete: boolean;
}

export interface AnalysisResult {
  readonly context: AnalysisContext;
  readonly findings: readonly DiagnosticFinding[];
}
