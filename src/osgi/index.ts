export {
  OsgiVersionParseError,
  OsgiVersionRangeParseError,
} from "./errors.js";
export {
  OsgiHeaderParseError,
  parseOsgiHeader,
  splitOsgiHeader,
} from "./header-parser.js";
export type { OsgiHeaderClause } from "./header-parser.js";
export {
  ManifestParseError,
  parseBundleManifest,
  parseManifestHeaders,
} from "./manifest-parser.js";
export {
  describeVersionRange,
  isEmptyVersionRange,
  parseVersionRange,
  satisfiesVersionRange,
} from "./version-range.js";
export {
  compareVersions,
  formatVersion,
  parseVersion,
} from "./version.js";
