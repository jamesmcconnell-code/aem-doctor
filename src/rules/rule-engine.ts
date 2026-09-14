import type {
  AnalysisContext,
  DiagnosticFinding,
} from "../models/index.js";
import type { DiagnosticRule } from "./diagnostic-rule.js";
import {
  BroadVersionRangeRule,
  CompatiblePackageRule,
  MissingExportedPackageRule,
  VersionMismatchRule,
} from "./osgi/index.js";

export const DEFAULT_OSGI_RULES: readonly DiagnosticRule[] = Object.freeze([
  new MissingExportedPackageRule(),
  new VersionMismatchRule(),
  new CompatiblePackageRule(),
  new BroadVersionRangeRule(),
]);

export function runDiagnosticRules(
  context: AnalysisContext,
  rules: readonly DiagnosticRule[] = DEFAULT_OSGI_RULES,
): readonly DiagnosticFinding[] {
  return Object.freeze(rules.flatMap((rule) => rule.analyze(context)));
}
