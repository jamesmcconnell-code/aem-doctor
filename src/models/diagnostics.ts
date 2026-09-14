import type { BundleOrigin } from "./graph.js";

export const DIAGNOSTIC_SEVERITIES = [
  "INFO",
  "WARNING",
  "ERROR",
  "CRITICAL",
] as const;

export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_CATEGORIES = [
  "OSGI",
  "MAVEN",
  "JAVA",
  "AEM",
  "FORMS",
  "CLOUD",
  "DISPATCHER",
  "COMPONENT",
  "SECURITY",
  "MIGRATION",
] as const;

export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number];

export type DiagnosticResolution =
  | "COMPATIBLE"
  | "INCOMPATIBLE"
  | "UNRESOLVED";

export interface DiagnosticFinding {
  readonly ruleId: string;
  readonly category: DiagnosticCategory;
  readonly severity: DiagnosticSeverity;
  readonly title: string;
  readonly description: string;
  readonly resolution?: DiagnosticResolution;
  readonly packageName?: string;
  readonly consumerBundle?: string;
  readonly providerBundle?: string;
  readonly providerOrigin?: BundleOrigin;
  readonly requiredVersionRange?: string;
  readonly availableVersion?: string;
  readonly recommendation?: string;
}

/** A recoverable input problem, kept separate from evidence-based findings. */
export interface AnalysisWarning {
  readonly code: string;
  readonly message: string;
  readonly sourcePath?: string;
  readonly cause?: string;
}
