import type { AnalysisWarning } from "../models/index.js";

export function createAnalysisWarning(
  code: string,
  message: string,
  sourcePath?: string,
  error?: unknown,
): AnalysisWarning {
  const warning: {
    code: string;
    message: string;
    sourcePath?: string;
    cause?: string;
  } = { code, message };

  if (sourcePath !== undefined) {
    warning.sourcePath = sourcePath;
  }

  if (error !== undefined) {
    warning.cause = error instanceof Error ? error.message : String(error);
  }

  return Object.freeze(warning);
}

export function isFileSystemError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
