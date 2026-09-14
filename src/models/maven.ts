/** A Maven artifact coordinate after the interpolation available to the scanner. */
export interface MavenCoordinate {
  readonly groupId?: string;
  readonly artifactId: string;
  readonly version?: string;
}

export interface MavenParent extends MavenCoordinate {
  readonly relativePath?: string;
}

export interface MavenDependency extends MavenCoordinate {
  readonly type?: string;
  readonly classifier?: string;
  readonly scope?: string;
  readonly optional?: boolean;
}

export interface MavenModule {
  readonly pomPath: string;
  readonly directory: string;
  readonly coordinate: MavenCoordinate;
  readonly packaging: string;
  readonly parent?: MavenParent;
  readonly declaredModulePaths: readonly string[];
  readonly dependencies: readonly MavenDependency[];
  readonly dependencyManagement: readonly MavenDependency[];
  readonly properties: Readonly<Record<string, string>>;
  readonly artifactPaths: readonly string[];
}

export interface MavenProject {
  readonly rootPath: string;
  readonly modules: readonly MavenModule[];
}
