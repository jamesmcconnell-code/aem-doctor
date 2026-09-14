import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type {
  AnalysisWarning,
  MavenCoordinate,
  MavenDependency,
  MavenModule,
  MavenParent,
  MavenProject,
} from "../models/index.js";
import { discoverModuleJars, discoverPomFiles } from "../scanner/index.js";
import { createAnalysisWarning } from "../scanner/warnings.js";
import {
  interpolateMavenValue,
  resolveMavenProperties,
} from "./interpolation.js";
import {
  parsePomXml,
  type RawMavenDependency,
  type RawMavenParent,
  type RawMavenPom,
} from "./pom-parser.js";

export interface MavenProjectDiscoveryResult {
  readonly project: MavenProject;
  readonly warnings: readonly AnalysisWarning[];
}

export class MavenResolutionError extends Error {
  override readonly name = "MavenResolutionError";
}

/** Discover POMs, resolve useful effective metadata, and associate target JARs. */
export async function discoverMavenProject(
  suppliedPath: string,
): Promise<MavenProjectDiscoveryResult> {
  const discovery = await discoverPomFiles(suppliedPath);
  const warnings: AnalysisWarning[] = [...discovery.warnings];
  const parseResults = await Promise.all(
    discovery.pomPaths.map(async (pomPath) => {
      try {
        return {
          pom: parsePomXml(
            pomPath,
            dirname(pomPath),
            await readFile(pomPath, "utf8"),
          ),
        };
      } catch (error) {
        return {
          warning: createAnalysisWarning(
            "POM_PARSE_FAILED",
            "Maven POM could not be parsed and was skipped",
            pomPath,
            error,
          ),
        };
      }
    }),
  );

  const rawPoms: RawMavenPom[] = [];
  for (const result of parseResults) {
    if (result.pom !== undefined) {
      rawPoms.push(result.pom);
    } else if (result.warning !== undefined) {
      warnings.push(result.warning);
    }
  }
  const resolver = createModuleResolver(rawPoms);
  const modules: MavenModule[] = [];

  for (const rawPom of rawPoms) {
    try {
      modules.push(resolver.resolveModule(rawPom));
    } catch (error) {
      warnings.push(
        createAnalysisWarning(
          "POM_RESOLUTION_FAILED",
          "Maven module metadata could not be resolved and was skipped",
          rawPom.pomPath,
          error,
        ),
      );
    }
  }

  const artifactResults = await Promise.all(
    modules.map((module) => discoverModuleJars(module.directory)),
  );
  const modulesWithArtifacts = modules.map((module, index) => {
    const artifactResult = artifactResults[index]!;
    warnings.push(...artifactResult.warnings);
    return Object.freeze({
      ...module,
      artifactPaths: artifactResult.jarPaths,
    });
  });

  return Object.freeze({
    project: Object.freeze({
      rootPath: discovery.rootPath,
      modules: Object.freeze(modulesWithArtifacts),
    }),
    warnings: Object.freeze(warnings),
  });
}

function createModuleResolver(rawPoms: readonly RawMavenPom[]): {
  resolveModule(rawPom: RawMavenPom): MavenModule;
} {
  const rawByPath = new Map(rawPoms.map((pom) => [resolve(pom.pomPath), pom]));
  const cache = new Map<string, MavenModule>();
  const propertySourcesCache = new Map<
    string,
    Readonly<Record<string, string>>
  >();
  const resolving = new Set<string>();

  const resolveModule = (rawPom: RawMavenPom): MavenModule => {
    const key = resolve(rawPom.pomPath);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    if (resolving.has(key)) {
      throw new MavenResolutionError(`Local Maven parent cycle involving ${key}`);
    }

    resolving.add(key);
    try {
      const localParentRaw = findLocalParent(rawPom, rawByPath);
      const localParent =
        localParentRaw === undefined ? undefined : resolveModule(localParentRaw);
      const inheritedPropertySources =
        localParentRaw === undefined
          ? undefined
          : propertySourcesCache.get(resolve(localParentRaw.pomPath));
      const propertySources = Object.freeze({
        ...(inheritedPropertySources ?? {}),
        ...rawPom.properties,
      });
      const module = resolveEffectiveModule(rawPom, localParent, propertySources);
      cache.set(key, module);
      propertySourcesCache.set(key, propertySources);
      return module;
    } finally {
      resolving.delete(key);
    }
  };

  return { resolveModule };
}

function findLocalParent(
  rawPom: RawMavenPom,
  rawByPath: ReadonlyMap<string, RawMavenPom>,
): RawMavenPom | undefined {
  if (rawPom.parent === undefined || rawPom.parent.relativePath === null) {
    return undefined;
  }

  const relativePath = rawPom.parent.relativePath ?? "../pom.xml";
  const candidate = resolve(rawPom.directory, relativePath);
  return rawByPath.get(candidate) ?? rawByPath.get(join(candidate, "pom.xml"));
}

function resolveEffectiveModule(
  rawPom: RawMavenPom,
  localParent: MavenModule | undefined,
  propertySources: Readonly<Record<string, string>>,
): MavenModule {
  const parentSources = rawPom.parent;
  const groupSource =
    rawPom.groupId ?? localParent?.coordinate.groupId ?? parentSources?.groupId;
  const versionSource =
    rawPom.version ?? localParent?.coordinate.version ?? parentSources?.version;
  let coordinate: MavenCoordinate = {
    artifactId: rawPom.artifactId,
    ...(groupSource === undefined ? {} : { groupId: groupSource }),
    ...(versionSource === undefined ? {} : { version: versionSource }),
  };
  let parent = resolveParent(parentSources, localParent, propertySources, {});
  let properties: Readonly<Record<string, string>> = propertySources;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const builtins = createBuiltins(coordinate, parent, rawPom.directory);
    properties = resolveMavenProperties(propertySources, builtins);
    parent = resolveParent(parentSources, localParent, properties, builtins);
    coordinate = resolveCoordinate(
      rawPom.artifactId,
      groupSource,
      versionSource,
      properties,
      createBuiltins(coordinate, parent, rawPom.directory),
    );
  }

  const builtins = createBuiltins(coordinate, parent, rawPom.directory);
  properties = resolveMavenProperties(propertySources, builtins);
  const declaredDependencies = rawPom.dependencies.map((dependency) =>
    resolveDependency(dependency, properties, builtins),
  );
  const declaredManagement = rawPom.dependencyManagement.map((dependency) =>
    resolveDependency(dependency, properties, builtins),
  );

  return Object.freeze({
    pomPath: rawPom.pomPath,
    directory: rawPom.directory,
    coordinate: Object.freeze(coordinate),
    packaging: interpolateMavenValue(
      rawPom.packaging ?? "jar",
      properties,
      builtins,
    ),
    ...(parent === undefined ? {} : { parent: Object.freeze(parent) }),
    declaredModulePaths: Object.freeze(
      rawPom.declaredModulePaths.map((modulePath) =>
        interpolateMavenValue(modulePath, properties, builtins),
      ),
    ),
    dependencies: Object.freeze(
      mergeDependencies(localParent?.dependencies ?? [], declaredDependencies),
    ),
    dependencyManagement: Object.freeze(
      mergeDependencies(
        localParent?.dependencyManagement ?? [],
        declaredManagement,
      ),
    ),
    properties,
    artifactPaths: Object.freeze([]),
  });
}

function resolveCoordinate(
  artifactId: string,
  groupId: string | undefined,
  version: string | undefined,
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>>,
): MavenCoordinate {
  return {
    artifactId: interpolateMavenValue(artifactId, properties, builtins),
    ...(groupId === undefined
      ? {}
      : { groupId: interpolateMavenValue(groupId, properties, builtins) }),
    ...(version === undefined
      ? {}
      : { version: interpolateMavenValue(version, properties, builtins) }),
  };
}

function resolveParent(
  rawParent: RawMavenParent | undefined,
  localParent: MavenModule | undefined,
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>>,
): MavenParent | undefined {
  if (rawParent === undefined) {
    return undefined;
  }

  const coordinate = resolveCoordinate(
    rawParent.artifactId,
    rawParent.groupId ?? localParent?.coordinate.groupId,
    rawParent.version ?? localParent?.coordinate.version,
    properties,
    builtins,
  );

  return {
    ...coordinate,
    ...(rawParent.relativePath === undefined
      ? {}
      : { relativePath: rawParent.relativePath ?? "" }),
  };
}

function resolveDependency(
  raw: RawMavenDependency,
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>>,
): MavenDependency {
  const interpolate = (value: string): string =>
    interpolateMavenValue(value, properties, builtins);

  return Object.freeze({
    artifactId: interpolate(raw.artifactId),
    ...(raw.groupId === undefined ? {} : { groupId: interpolate(raw.groupId) }),
    ...(raw.version === undefined ? {} : { version: interpolate(raw.version) }),
    ...(raw.type === undefined ? {} : { type: interpolate(raw.type) }),
    ...(raw.classifier === undefined
      ? {}
      : { classifier: interpolate(raw.classifier) }),
    ...(raw.scope === undefined ? {} : { scope: interpolate(raw.scope) }),
    ...(raw.optional === undefined
      ? {}
      : { optional: interpolate(raw.optional).toLowerCase() === "true" }),
  });
}

function mergeDependencies(
  inherited: readonly MavenDependency[],
  declared: readonly MavenDependency[],
): MavenDependency[] {
  const merged = [...inherited];
  const positions = new Map(
    merged.map((dependency, index) => [dependencyKey(dependency), index]),
  );

  for (const dependency of declared) {
    const key = dependencyKey(dependency);
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, merged.length);
      merged.push(dependency);
    } else {
      merged[position] = dependency;
    }
  }

  return merged;
}

function dependencyKey(dependency: MavenDependency): string {
  return [
    dependency.groupId ?? "",
    dependency.artifactId,
    dependency.type ?? "jar",
    dependency.classifier ?? "",
  ].join(":");
}

function createBuiltins(
  coordinate: MavenCoordinate,
  parent: MavenParent | undefined,
  directory: string,
): Readonly<Record<string, string>> {
  const builtins: Record<string, string> = {
    basedir: directory,
    "project.basedir": directory,
    "project.build.directory": join(directory, "target"),
    "project.artifactId": coordinate.artifactId,
    "pom.artifactId": coordinate.artifactId,
  };

  addAliases(builtins, ["project.groupId", "pom.groupId"], coordinate.groupId);
  addAliases(builtins, ["project.version", "pom.version"], coordinate.version);
  addAliases(builtins, ["project.parent.groupId"], parent?.groupId);
  addAliases(builtins, ["project.parent.artifactId"], parent?.artifactId);
  addAliases(builtins, ["project.parent.version"], parent?.version);
  return builtins;
}

function addAliases(
  target: Record<string, string>,
  aliases: readonly string[],
  value: string | undefined,
): void {
  if (value === undefined) {
    return;
  }
  for (const alias of aliases) {
    target[alias] = value;
  }
}
