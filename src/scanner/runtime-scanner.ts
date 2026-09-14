import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AnalysisWarning } from "../models/index.js";
import { compareStrings } from "../utils/order.js";
import { isPrimaryJarFile } from "./jar-scanner.js";
import { createAnalysisWarning } from "./warnings.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "node_modules",
]);

export interface RuntimeJarDiscoveryResult {
  readonly rootPath: string;
  readonly jarPaths: readonly string[];
  readonly warnings: readonly AnalysisWarning[];
  readonly complete: boolean;
}

/** Recursively discover bundle candidates in a user-supplied runtime directory. */
export async function discoverRuntimeJars(
  suppliedPath: string,
): Promise<RuntimeJarDiscoveryResult> {
  const rootPath = resolve(suppliedPath);

  try {
    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) {
      return createResult(rootPath, [], [
        createAnalysisWarning(
          "RUNTIME_PATH_NOT_DIRECTORY",
          "Supplied runtime bundle path is not a directory",
          rootPath,
        ),
      ], false);
    }
  } catch (error) {
    return createResult(rootPath, [], [
      createAnalysisWarning(
        "RUNTIME_PATH_INVALID",
        "Supplied runtime bundle path does not exist or cannot be accessed",
        rootPath,
        error,
      ),
    ], false);
  }

  const jarPaths: string[] = [];
  const warnings: AnalysisWarning[] = [];
  await walk(rootPath, jarPaths, warnings);
  jarPaths.sort(compareStrings);
  return createResult(rootPath, jarPaths, warnings, warnings.length === 0);
}

async function walk(
  directory: string,
  jarPaths: string[],
  warnings: AnalysisWarning[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    warnings.push(
      createAnalysisWarning(
        "RUNTIME_DIRECTORY_READ_FAILED",
        "Runtime bundle directory could not be inspected",
        directory,
        error,
      ),
    );
    return;
  }

  entries.sort((left, right) => compareStrings(left.name, right.name));
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && isPrimaryJarFile(entry.name)) {
      jarPaths.push(entryPath);
    } else if (
      entry.isDirectory() &&
      !IGNORED_DIRECTORIES.has(entry.name)
    ) {
      await walk(entryPath, jarPaths, warnings);
    }
  }
}

function createResult(
  rootPath: string,
  jarPaths: string[],
  warnings: AnalysisWarning[],
  complete: boolean,
): RuntimeJarDiscoveryResult {
  return Object.freeze({
    rootPath,
    jarPaths: Object.freeze(jarPaths),
    warnings: Object.freeze(warnings),
    complete,
  });
}
