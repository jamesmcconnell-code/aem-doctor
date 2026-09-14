import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { AnalysisWarning } from "../models/index.js";
import { compareStrings } from "../utils/order.js";
import { createAnalysisWarning } from "./warnings.js";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".vscode",
  "node_modules",
  "target",
]);

export interface PomDiscoveryResult {
  readonly rootPath: string;
  readonly pomPaths: readonly string[];
  readonly warnings: readonly AnalysisWarning[];
}

/** Recursively find POMs without following directory symlinks. */
export async function discoverPomFiles(
  suppliedPath: string,
): Promise<PomDiscoveryResult> {
  const rootPath = resolve(suppliedPath);

  try {
    const rootStats = await stat(rootPath);
    if (!rootStats.isDirectory()) {
      return createResult(rootPath, [], [
        createAnalysisWarning(
          "PROJECT_PATH_NOT_DIRECTORY",
          "Supplied project path is not a directory",
          rootPath,
        ),
      ]);
    }
  } catch (error) {
    return createResult(rootPath, [], [
      createAnalysisWarning(
        "PROJECT_PATH_INVALID",
        "Supplied project path does not exist or cannot be accessed",
        rootPath,
        error,
      ),
    ]);
  }

  const pomPaths: string[] = [];
  const warnings: AnalysisWarning[] = [];

  await walkDirectory(rootPath, pomPaths, warnings);
  pomPaths.sort(compareStrings);
  return createResult(rootPath, pomPaths, warnings);
}

async function walkDirectory(
  directory: string,
  pomPaths: string[],
  warnings: AnalysisWarning[],
): Promise<void> {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    warnings.push(
      createAnalysisWarning(
        "DIRECTORY_READ_FAILED",
        "Directory could not be inspected while searching for POMs",
        directory,
        error,
      ),
    );
    return;
  }

  entries.sort((left, right) => compareStrings(left.name, right.name));

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isFile() && entry.name === "pom.xml") {
      pomPaths.push(entryPath);
      continue;
    }

    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
      await walkDirectory(entryPath, pomPaths, warnings);
    }
  }
}

function createResult(
  rootPath: string,
  pomPaths: string[],
  warnings: AnalysisWarning[],
): PomDiscoveryResult {
  return Object.freeze({
    rootPath,
    pomPaths: Object.freeze(pomPaths),
    warnings: Object.freeze(warnings),
  });
}
