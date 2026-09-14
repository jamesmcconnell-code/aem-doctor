export {
  interpolateMavenValue,
  resolveMavenProperties,
} from "./interpolation.js";
export {
  MavenResolutionError,
  discoverMavenProject,
} from "./project-loader.js";
export type { MavenProjectDiscoveryResult } from "./project-loader.js";
export { PomParseError, parsePomXml } from "./pom-parser.js";
