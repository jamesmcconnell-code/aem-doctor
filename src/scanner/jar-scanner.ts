import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import type { AnalysisWarning, BundleManifest } from "../models/index.js";
import { ManifestParseError, parseBundleManifest } from "../osgi/manifest-parser.js";
import { compareStrings } from "../utils/order.js";
import { readJarManifest } from "./jar-reader.js";
import { createAnalysisWarning, isFileSystemError } from "./warnings.js";

export interface JarDiscoveryResult {
  readonly jarPaths: readonly string[];
  readonly warnings: readonly AnalysisWarning[];
}

export interface JarInspectionResult {
  readonly jarPath: string;
  readonly manifest?: BundleManifest;
  readonly warnings: readonly AnalysisWarning[];
}

/** Discover primary artifacts directly under a Maven module's target directory. */
export async function discoverModuleJars(
  moduleDirectory: string,
): Promise<JarDiscoveryResult> {
  const targetDirectory = join(moduleDirectory, "target");

  try {
    const entries = await readdir(targetDirectory, { withFileTypes: true });
    const jarPaths = entries
      .filter((entry) => entry.isFile() && isPrimaryJarFile(entry.name))
      .map((entry) => join(targetDirectory, entry.name))
      .sort(compareStrings);

    return Object.freeze({
      jarPaths: Object.freeze(jarPaths),
      warnings: Object.freeze([]),
    });
  } catch (error) {
    if (isFileSystemError(error) && error.code === "ENOENT") {
      return Object.freeze({
        jarPaths: Object.freeze([]),
        warnings: Object.freeze([]),
      });
    }

    return Object.freeze({
      jarPaths: Object.freeze([]),
      warnings: Object.freeze([
        createAnalysisWarning(
          "JAR_DISCOVERY_FAILED",
          `Could not inspect Maven target directory ${targetDirectory}`,
          targetDirectory,
          error,
        ),
      ]),
    });
  }
}

/** Read and parse one JAR without allowing bad input to abort repository analysis. */
export async function inspectJar(jarPath: string): Promise<JarInspectionResult> {
  try {
    const content = await readJarManifest(jarPath);
    if (content === undefined) {
      return Object.freeze({
        jarPath,
        warnings: Object.freeze([
          createAnalysisWarning(
            "JAR_MANIFEST_MISSING",
            "JAR does not contain META-INF/MANIFEST.MF",
            jarPath,
          ),
        ]),
      });
    }

    return Object.freeze({
      jarPath,
      manifest: parseBundleManifest(jarPath, content),
      warnings: Object.freeze([]),
    });
  } catch (error) {
    const malformedManifest = error instanceof ManifestParseError;
    return Object.freeze({
      jarPath,
      warnings: Object.freeze([
        createAnalysisWarning(
          malformedManifest ? "MANIFEST_MALFORMED" : "JAR_READ_FAILED",
          malformedManifest
            ? "JAR contains malformed manifest or OSGi metadata"
            : "JAR could not be opened or read",
          jarPath,
          error,
        ),
      ]),
    });
  }
}

export function isPrimaryJarFile(fileName: string): boolean {
  const normalized = fileName.toLowerCase();
  return (
    normalized.endsWith(".jar") &&
    !normalized.endsWith("-sources.jar") &&
    !normalized.endsWith("-javadoc.jar") &&
    !basename(normalized).startsWith("original-")
  );
}
