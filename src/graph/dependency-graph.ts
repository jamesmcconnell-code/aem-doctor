import type {
  BundleManifest,
  BundleNode,
  BundleOrigin,
  DependencyGraph,
  PackageConsumer,
  PackageNode,
  PackageProvider,
} from "../models/index.js";
import { compareStrings } from "../utils/order.js";

interface MutablePackageNode {
  readonly packageName: string;
  readonly consumers: PackageConsumer[];
  readonly providers: PackageProvider[];
}

/** Build deterministic bidirectional package relationships from analyzed bundles. */
export function buildDependencyGraph(
  projectManifests: readonly BundleManifest[],
  runtimeManifests: readonly BundleManifest[] = [],
): DependencyGraph {
  const bundles = new Map<string, BundleNode>();
  const packages = new Map<string, MutablePackageNode>();
  const inventories: ReadonlyArray<{
    origin: BundleOrigin;
    manifests: readonly BundleManifest[];
  }> = [
    { origin: "PROJECT", manifests: projectManifests },
    { origin: "RUNTIME", manifests: runtimeManifests },
  ];

  for (const inventory of inventories) {
    const sortedManifests = [...inventory.manifests].sort((left, right) =>
      compareStrings(left.jarPath, right.jarPath),
    );

    for (const manifest of sortedManifests) {
      const bundleId = manifest.jarPath;
      if (bundles.has(bundleId)) {
        continue;
      }

      bundles.set(
        bundleId,
        Object.freeze({ id: bundleId, origin: inventory.origin, manifest }),
      );

      for (const importedPackage of manifest.importedPackages) {
        getOrCreatePackage(packages, importedPackage.packageName).consumers.push(
          Object.freeze({ bundleId, importedPackage }),
        );
      }

      for (const exportedPackage of manifest.exportedPackages) {
        getOrCreatePackage(packages, exportedPackage.packageName).providers.push(
          Object.freeze({ bundleId, exportedPackage }),
        );
      }
    }
  }

  const immutablePackages = new Map<string, PackageNode>();
  const packageNames = [...packages.keys()].sort(compareStrings);
  for (const packageName of packageNames) {
    const node = packages.get(packageName)!;
    immutablePackages.set(
      packageName,
      Object.freeze({
        packageName,
        consumers: Object.freeze(node.consumers),
        providers: Object.freeze(node.providers),
      }),
    );
  }

  return Object.freeze({ bundles, packages: immutablePackages });
}

function getOrCreatePackage(
  packages: Map<string, MutablePackageNode>,
  packageName: string,
): MutablePackageNode {
  const existing = packages.get(packageName);
  if (existing !== undefined) {
    return existing;
  }

  const created: MutablePackageNode = {
    packageName,
    consumers: [],
    providers: [],
  };
  packages.set(packageName, created);
  return created;
}
