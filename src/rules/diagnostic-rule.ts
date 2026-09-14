import type {
  AnalysisContext,
  DiagnosticCategory,
  DiagnosticFinding,
} from "../models/index.js";

/** Common contract for deterministic diagnostic rules in every category. */
export interface DiagnosticRule {
  readonly id: string;
  readonly category: DiagnosticCategory;
  analyze(context: AnalysisContext): readonly DiagnosticFinding[];
}
