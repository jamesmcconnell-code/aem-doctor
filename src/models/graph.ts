import type {
  BundleManifest,
  ExportedPackage,
  ImportedPackage,
} from "./osgi.js";

export type BundleOrigin = "PROJECT" | "RUNTIME";

export interface BundleNode {
  readonly id: string;
  readonly origin: BundleOrigin;
  readonly manifest: BundleManifest;
}

export interface PackageConsumer {
  readonly bundleId: string;
  readonly importedPackage: ImportedPackage;
}

export interface PackageProvider {
  readonly bundleId: string;
  readonly exportedPackage: ExportedPackage;
}

export interface PackageNode {
  readonly packageName: string;
  readonly consumers: readonly PackageConsumer[];
  readonly providers: readonly PackageProvider[];
}

export interface DependencyGraph {
  readonly bundles: ReadonlyMap<string, BundleNode>;
  readonly packages: ReadonlyMap<string, PackageNode>;
}
