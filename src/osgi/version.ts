import type { Version } from "../models/index.js";

import { OsgiVersionParseError } from "./errors.js";

const VERSION_PATTERN =
  /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:\.([A-Za-z0-9_-]+))?$/;
const MAX_OSGI_VERSION_COMPONENT = 2_147_483_647;

/** Parse an OSGi version, supplying zero for omitted minor and micro parts. */
export function parseVersion(input: string): Version {
  const value = input.trim();
  const match = VERSION_PATTERN.exec(value);

  if (match === null) {
    throw new OsgiVersionParseError(
      input,
      "expected major[.minor[.micro[.qualifier]]]",
    );
  }

  const version = {
    major: parseComponent(match[1]!, input),
    minor: parseComponent(match[2] ?? "0", input),
    micro: parseComponent(match[3] ?? "0", input),
    qualifier: match[4] ?? "",
    raw: value,
  } satisfies Version;

  return Object.freeze(version);
}

/** Compare versions using OSGi's numeric components and qualifier ordering. */
export function compareVersions(left: Version, right: Version): -1 | 0 | 1 {
  const numericComparison =
    compareNumbers(left.major, right.major) ||
    compareNumbers(left.minor, right.minor) ||
    compareNumbers(left.micro, right.micro);

  if (numericComparison !== 0) {
    return numericComparison;
  }

  if (left.qualifier === right.qualifier) {
    return 0;
  }

  return left.qualifier < right.qualifier ? -1 : 1;
}

/** Return a normalized representation with all three numeric components. */
export function formatVersion(version: Version): string {
  const numeric = `${version.major}.${version.minor}.${version.micro}`;
  return version.qualifier === "" ? numeric : `${numeric}.${version.qualifier}`;
}

function parseComponent(value: string, input: string): number {
  const component = Number(value);

  if (!Number.isSafeInteger(component) || component > MAX_OSGI_VERSION_COMPONENT) {
    throw new OsgiVersionParseError(
      input,
      `numeric components must not exceed ${MAX_OSGI_VERSION_COMPONENT}`,
    );
  }

  return component;
}

function compareNumbers(left: number, right: number): -1 | 0 | 1 {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}
