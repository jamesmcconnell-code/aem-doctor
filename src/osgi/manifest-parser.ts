import type {
  BundleManifest,
  ExportedPackage,
  ImportedPackage,
} from "../models/index.js";

import { parseOsgiHeader, splitOsgiHeader } from "./header-parser.js";
import { parseVersion } from "./version.js";
import { parseVersionRange } from "./version-range.js";

export class ManifestParseError extends Error {
  override readonly name = "ManifestParseError";

  constructor(
    readonly source: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`Invalid manifest ${source}: ${reason}`, options);
  }
}

/** Parse and unfold the main section of a JAR manifest. */
export function parseManifestHeaders(
  content: string | Buffer,
  source = "<memory>",
): Readonly<Record<string, string>> {
  const decoded = Buffer.isBuffer(content) ? content.toString("utf8") : content;
  const lines = decoded.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  const headers: Record<string, string> = {};
  const normalizedNames = new Set<string>();
  let currentLine: string | undefined;

  const commit = (): void => {
    if (currentLine === undefined) {
      return;
    }

    const colonIndex = currentLine.indexOf(":");
    if (colonIndex <= 0) {
      throw new ManifestParseError(source, `malformed header "${currentLine}"`);
    }

    const name = currentLine.slice(0, colonIndex).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
      throw new ManifestParseError(source, `invalid header name "${name}"`);
    }

    const normalizedName = name.toLowerCase();
    if (normalizedNames.has(normalizedName)) {
      throw new ManifestParseError(source, `duplicate header "${name}"`);
    }

    let value = currentLine.slice(colonIndex + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }

    normalizedNames.add(normalizedName);
    headers[name] = value.trimEnd();
    currentLine = undefined;
  };

  for (const line of lines) {
    if (line === "") {
      commit();
      break;
    }

    if (line.startsWith(" ")) {
      if (currentLine === undefined) {
        throw new ManifestParseError(source, "orphan continuation line");
      }
      currentLine += line.slice(1);
      continue;
    }

    commit();
    currentLine = line;
  }

  commit();
  return Object.freeze(headers);
}

/** Convert manifest headers into the bundle model used by graph construction. */
export function parseBundleManifest(
  jarPath: string,
  content: string | Buffer,
): BundleManifest {
  try {
    const headers = parseManifestHeaders(content, jarPath);
    const symbolicNameHeader = findHeader(headers, "Bundle-SymbolicName");
    const bundleVersionHeader = findHeader(headers, "Bundle-Version");
    const importHeader = findHeader(headers, "Import-Package");
    const exportHeader = findHeader(headers, "Export-Package");
    const requireHeader = findHeader(headers, "Require-Capability");
    const provideHeader = findHeader(headers, "Provide-Capability");
    const result: {
      jarPath: string;
      symbolicName?: string;
      bundleVersion?: ReturnType<typeof parseVersion>;
      importedPackages: readonly ImportedPackage[];
      exportedPackages: readonly ExportedPackage[];
      requireCapability: readonly string[];
      provideCapability: readonly string[];
      headers: Readonly<Record<string, string>>;
    } = {
      jarPath,
      importedPackages: parseImports(importHeader),
      exportedPackages: parseExports(exportHeader),
      requireCapability:
        requireHeader === undefined ? Object.freeze([]) : splitOsgiHeader(requireHeader),
      provideCapability:
        provideHeader === undefined ? Object.freeze([]) : splitOsgiHeader(provideHeader),
      headers,
    };

    if (symbolicNameHeader !== undefined) {
      const clauses = parseOsgiHeader(symbolicNameHeader);
      if (clauses.length !== 1 || clauses[0]!.names.length !== 1) {
        throw new ManifestParseError(
          jarPath,
          "Bundle-SymbolicName must contain exactly one name",
        );
      }
      result.symbolicName = clauses[0]!.names[0]!;
    }

    if (bundleVersionHeader !== undefined) {
      result.bundleVersion = parseVersion(bundleVersionHeader);
    }

    return Object.freeze(result);
  } catch (error) {
    if (error instanceof ManifestParseError) {
      throw error;
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new ManifestParseError(jarPath, reason, { cause: error });
  }
}

function parseImports(header: string | undefined): readonly ImportedPackage[] {
  if (header === undefined) {
    return Object.freeze([]);
  }

  const imports = parseOsgiHeader(header).flatMap((clause) => {
    const versionText = findPackageVersion(clause.attributes);
    return clause.names.map((packageName) => {
      const importedPackage: {
        packageName: string;
        versionRange?: ReturnType<typeof parseVersionRange>;
        attributes: Readonly<Record<string, string>>;
        directives: Readonly<Record<string, string>>;
      } = {
        packageName,
        attributes: clause.attributes,
        directives: clause.directives,
      };

      if (versionText !== undefined) {
        importedPackage.versionRange = parseVersionRange(versionText);
      }

      return Object.freeze(importedPackage);
    });
  });

  return Object.freeze(imports);
}

function parseExports(header: string | undefined): readonly ExportedPackage[] {
  if (header === undefined) {
    return Object.freeze([]);
  }

  const exports = parseOsgiHeader(header).flatMap((clause) => {
    const versionText = findPackageVersion(clause.attributes);
    return clause.names.map((packageName) => {
      const exportedPackage: {
        packageName: string;
        version?: ReturnType<typeof parseVersion>;
        attributes: Readonly<Record<string, string>>;
        directives: Readonly<Record<string, string>>;
      } = {
        packageName,
        attributes: clause.attributes,
        directives: clause.directives,
      };

      if (versionText !== undefined) {
        exportedPackage.version = parseVersion(versionText);
      }

      return Object.freeze(exportedPackage);
    });
  });

  return Object.freeze(exports);
}

function findHeader(
  headers: Readonly<Record<string, string>>,
  expectedName: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName.toLowerCase(),
  );
  return match?.[1];
}

function findPackageVersion(
  attributes: Readonly<Record<string, string>>,
): string | undefined {
  const direct = attributes.version ?? attributes["specification-version"];
  if (direct !== undefined) {
    return direct;
  }

  const typed = Object.entries(attributes).find(([name]) => {
    const typeSeparator = name.indexOf(":");
    const baseName = typeSeparator < 0 ? name : name.slice(0, typeSeparator);
    return baseName === "version" || baseName === "specification-version";
  });
  return typed?.[1];
}
