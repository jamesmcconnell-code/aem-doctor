export interface Version {
  readonly major: number;
  readonly minor: number;
  readonly micro: number;
  readonly qualifier: string;
  readonly raw: string;
}

export interface VersionBound {
  readonly version: Version;
  readonly inclusive: boolean;
}

export interface VersionRange {
  readonly raw: string;
  readonly floor?: VersionBound;
  readonly ceiling?: VersionBound;
}

export interface ImportedPackage {
  readonly packageName: string;
  readonly versionRange?: VersionRange;
  readonly attributes: Readonly<Record<string, string>>;
  readonly directives: Readonly<Record<string, string>>;
}

export interface ExportedPackage {
  readonly packageName: string;
  readonly version?: Version;
  readonly attributes: Readonly<Record<string, string>>;
  readonly directives: Readonly<Record<string, string>>;
}

export interface BundleManifest {
  readonly jarPath: string;
  readonly symbolicName?: string;
  readonly bundleVersion?: Version;
  readonly importedPackages: readonly ImportedPackage[];
  readonly exportedPackages: readonly ExportedPackage[];
  readonly requireCapability: readonly string[];
  readonly provideCapability: readonly string[];
  readonly headers: Readonly<Record<string, string>>;
}
