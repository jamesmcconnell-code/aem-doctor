import type { Version, VersionBound, VersionRange } from "../models/index.js";

import { OsgiVersionRangeParseError } from "./errors.js";
import { compareVersions, formatVersion, parseVersion } from "./version.js";

type VersionInput = Version | string;
type VersionRangeInput = VersionRange | string;

/**
 * Parse an OSGi interval or an at-least version. A lone version such as 1.2
 * means [1.2.0, infinity), as defined by OSGi range semantics.
 */
export function parseVersionRange(input: string): VersionRange {
  const value = input.trim();

  if (value === "") {
    throw new OsgiVersionRangeParseError(input, "the range must not be empty");
  }

  const beginsInterval = value.startsWith("[") || value.startsWith("(");
  const endsInterval = value.endsWith("]") || value.endsWith(")");

  if (!beginsInterval && !endsInterval) {
    return freezeRange({
      raw: value,
      floor: createBound(parseVersionForRange(value, input), true),
    });
  }

  if (!beginsInterval || !endsInterval) {
    throw new OsgiVersionRangeParseError(
      input,
      "an interval requires both opening and closing delimiters",
    );
  }

  const body = value.slice(1, -1);
  const commaIndex = body.indexOf(",");

  if (commaIndex < 0 || commaIndex !== body.lastIndexOf(",")) {
    throw new OsgiVersionRangeParseError(
      input,
      "an interval must contain exactly one comma",
    );
  }

  const floorText = body.slice(0, commaIndex).trim();
  const ceilingText = body.slice(commaIndex + 1).trim();

  if (floorText === "" && ceilingText === "") {
    throw new OsgiVersionRangeParseError(
      input,
      "at least one endpoint is required",
    );
  }

  if (floorText === "" && value[0] !== "(") {
    throw new OsgiVersionRangeParseError(
      input,
      "an unbounded floor must use an exclusive parenthesis",
    );
  }

  if (ceilingText === "" && value.at(-1) !== ")") {
    throw new OsgiVersionRangeParseError(
      input,
      "an unbounded ceiling must use an exclusive parenthesis",
    );
  }

  const range: {
    raw: string;
    floor?: VersionBound;
    ceiling?: VersionBound;
  } = { raw: value };

  if (floorText !== "") {
    range.floor = createBound(
      parseVersionForRange(floorText, input),
      value[0] === "[",
    );
  }

  if (ceilingText !== "") {
    range.ceiling = createBound(
      parseVersionForRange(ceilingText, input),
      value.at(-1) === "]",
    );
  }

  return freezeRange(range);
}

export function satisfiesVersionRange(
  versionInput: VersionInput,
  rangeInput: VersionRangeInput,
): boolean {
  const version = asVersion(versionInput);
  const range = asVersionRange(rangeInput);

  if (range.floor !== undefined) {
    const comparison = compareVersions(version, range.floor.version);
    if (comparison < 0 || (comparison === 0 && !range.floor.inclusive)) {
      return false;
    }
  }

  if (range.ceiling !== undefined) {
    const comparison = compareVersions(version, range.ceiling.version);
    if (comparison > 0 || (comparison === 0 && !range.ceiling.inclusive)) {
      return false;
    }
  }

  return true;
}

/** Determine whether no version can satisfy this range. */
export function isEmptyVersionRange(rangeInput: VersionRangeInput): boolean {
  const range = asVersionRange(rangeInput);

  if (range.floor === undefined || range.ceiling === undefined) {
    return false;
  }

  const comparison = compareVersions(
    range.floor.version,
    range.ceiling.version,
  );

  return (
    comparison > 0 ||
    (comparison === 0 &&
      (!range.floor.inclusive || !range.ceiling.inclusive))
  );
}

/** Render a range in the form used by human-readable diagnostic reports. */
export function describeVersionRange(rangeInput: VersionRangeInput): string {
  const range = asVersionRange(rangeInput);
  const constraints: string[] = [];

  if (range.floor !== undefined) {
    constraints.push(
      `${range.floor.inclusive ? ">=" : ">"} ${formatVersion(range.floor.version)}`,
    );
  }

  if (range.ceiling !== undefined) {
    constraints.push(
      `${range.ceiling.inclusive ? "<=" : "<"} ${formatVersion(range.ceiling.version)}`,
    );
  }

  return constraints.length === 0 ? "any version" : constraints.join(" and ");
}

function asVersion(input: VersionInput): Version {
  return typeof input === "string" ? parseVersion(input) : input;
}

function asVersionRange(input: VersionRangeInput): VersionRange {
  return typeof input === "string" ? parseVersionRange(input) : input;
}

function createBound(version: Version, inclusive: boolean): VersionBound {
  return Object.freeze({ version, inclusive });
}

function freezeRange(range: VersionRange): VersionRange {
  return Object.freeze(range);
}

function parseVersionForRange(value: string, rangeInput: string): Version {
  try {
    return parseVersion(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OsgiVersionRangeParseError(rangeInput, reason);
  }
}
