import { XMLParser, XMLValidator } from "fast-xml-parser";

export interface RawMavenParent {
  readonly groupId?: string;
  readonly artifactId: string;
  readonly version?: string;
  /** null means an explicitly empty relativePath, which disables local lookup. */
  readonly relativePath?: string | null;
}

export interface RawMavenDependency {
  readonly groupId?: string;
  readonly artifactId: string;
  readonly version?: string;
  readonly type?: string;
  readonly classifier?: string;
  readonly scope?: string;
  readonly optional?: string;
}

export interface RawMavenPom {
  readonly pomPath: string;
  readonly directory: string;
  readonly groupId?: string;
  readonly artifactId: string;
  readonly version?: string;
  readonly packaging?: string;
  readonly parent?: RawMavenParent;
  readonly declaredModulePaths: readonly string[];
  readonly dependencies: readonly RawMavenDependency[];
  readonly dependencyManagement: readonly RawMavenDependency[];
  readonly properties: Readonly<Record<string, string>>;
}

export class PomParseError extends Error {
  override readonly name = "PomParseError";

  constructor(
    readonly pomPath: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`Invalid Maven POM ${pomPath}: ${reason}`, options);
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
  processEntities: {
    enabled: true,
    maxEntityCount: 0,
    maxExpandedLength: 10_000,
    maxTotalExpansions: 100,
  },
});

export function parsePomXml(
  pomPath: string,
  directory: string,
  xml: string,
): RawMavenPom {
  try {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
      throw new Error("DOCTYPE and custom entity declarations are not supported");
    }

    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new Error(validation.err.msg);
    }

    const parsed: unknown = parser.parse(xml);
    const document = asRecord(parsed, "document");
    const project = asRecord(document.project, "project");
    const artifactId = requireString(project, "artifactId");
    const result: {
      pomPath: string;
      directory: string;
      groupId?: string;
      artifactId: string;
      version?: string;
      packaging?: string;
      parent?: RawMavenParent;
      declaredModulePaths: readonly string[];
      dependencies: readonly RawMavenDependency[];
      dependencyManagement: readonly RawMavenDependency[];
      properties: Readonly<Record<string, string>>;
    } = {
      pomPath,
      directory,
      artifactId,
      declaredModulePaths: Object.freeze(readModules(project.modules)),
      dependencies: Object.freeze(readDependencies(project.dependencies)),
      dependencyManagement: Object.freeze(
        readDependencies(asRecordOrUndefined(project.dependencyManagement)?.dependencies),
      ),
      properties: Object.freeze(readProperties(project.properties)),
    };

    assignOptional(result, "groupId", readString(project.groupId));
    assignOptional(result, "version", readString(project.version));
    assignOptional(result, "packaging", readString(project.packaging));

    const parentNode = asRecordOrUndefined(project.parent);
    if (parentNode !== undefined) {
      result.parent = readParent(parentNode);
    }

    return Object.freeze(result);
  } catch (error) {
    if (error instanceof PomParseError) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new PomParseError(pomPath, reason, { cause: error });
  }
}

function readParent(node: Record<string, unknown>): RawMavenParent {
  const result: {
    groupId?: string;
    artifactId: string;
    version?: string;
    relativePath?: string | null;
  } = { artifactId: requireString(node, "artifactId") };

  assignOptional(result, "groupId", readString(node.groupId));
  assignOptional(result, "version", readString(node.version));

  if (Object.hasOwn(node, "relativePath")) {
    const relativePath = readString(node.relativePath);
    result.relativePath =
      relativePath === undefined || relativePath === "" ? null : relativePath;
  }

  return Object.freeze(result);
}

function readDependencies(value: unknown): RawMavenDependency[] {
  const container = asRecordOrUndefined(value);
  if (container === undefined) {
    return [];
  }

  return asArray(container.dependency).map((entry) => {
    const node = asRecord(entry, "dependency");
    const dependency: {
      groupId?: string;
      artifactId: string;
      version?: string;
      type?: string;
      classifier?: string;
      scope?: string;
      optional?: string;
    } = { artifactId: requireString(node, "artifactId") };

    assignOptional(dependency, "groupId", readString(node.groupId));
    assignOptional(dependency, "version", readString(node.version));
    assignOptional(dependency, "type", readString(node.type));
    assignOptional(dependency, "classifier", readString(node.classifier));
    assignOptional(dependency, "scope", readString(node.scope));
    assignOptional(dependency, "optional", readString(node.optional));
    return Object.freeze(dependency);
  });
}

function readModules(value: unknown): string[] {
  const container = asRecordOrUndefined(value);
  if (container === undefined) {
    return [];
  }

  return asArray(container.module).map((entry) => {
    const modulePath = readString(entry);
    if (modulePath === undefined) {
      throw new Error("module path must be text");
    }
    return modulePath;
  });
}

function readProperties(value: unknown): Record<string, string> {
  const node = asRecordOrUndefined(value);
  if (node === undefined) {
    return {};
  }

  const properties: Record<string, string> = {};
  for (const [name, propertyValue] of Object.entries(node)) {
    const text = readString(propertyValue);
    if (text !== undefined) {
      properties[name] = text;
    }
  }
  return properties;
}

function requireString(node: Record<string, unknown>, name: string): string {
  const value = readString(node[name]);
  if (value === undefined || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  const record = asRecordOrUndefined(value);
  if (record === undefined) {
    throw new Error(`${label} element is missing or malformed`);
  }
  return record;
}

function asRecordOrUndefined(
  value: unknown,
): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function assignOptional<
  T extends object,
  K extends keyof T,
>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}
