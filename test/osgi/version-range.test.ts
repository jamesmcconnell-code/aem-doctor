import { describe, expect, it } from "vitest";

import {
  describeVersionRange,
  isEmptyVersionRange,
  OsgiVersionRangeParseError,
  parseVersionRange,
  satisfiesVersionRange,
} from "../../src/osgi/index.js";

describe("OSGi version range parsing", () => {
  it("parses bounded ranges and preserves bound inclusivity", () => {
    const range = parseVersionRange("[5.12,5.13)");

    expect(range.floor).toMatchObject({
      inclusive: true,
      version: { major: 5, minor: 12, micro: 0 },
    });
    expect(range.ceiling).toMatchObject({
      inclusive: false,
      version: { major: 5, minor: 13, micro: 0 },
    });
  });

  it.each([
    ["[1.0,)", true, false],
    ["(,2.0)", false, true],
    ["1.2.3", true, false],
  ] as const)(
    "parses open-ended range %s",
    (input, hasFloor, hasCeiling) => {
      const range = parseVersionRange(input);
      expect(range.floor !== undefined).toBe(hasFloor);
      expect(range.ceiling !== undefined).toBe(hasCeiling);
    },
  );

  it("renders normalized human-readable constraints", () => {
    expect(describeVersionRange("[5.12,5.13)")).toBe(
      ">= 5.12.0 and < 5.13.0",
    );
    expect(describeVersionRange("(,2.0]")).toBe("<= 2.0.0");
  });

  it.each(["", "[1.0,2.0", "1.0,2.0", "[,2.0)", "[1.0,]"])(
    "rejects malformed range %j",
    (input) => {
      expect(() => parseVersionRange(input)).toThrow(
        OsgiVersionRangeParseError,
      );
    },
  );
});

describe("OSGi version range satisfaction", () => {
  it.each([
    ["5.12.3", "[5.12,5.13)", true],
    ["5.13.0", "[5.12,5.13)", false],
    ["5.11.9", "[5.12,5.13)", false],
    ["5.12.3", "[1.0.0,10.0.0)", true],
    ["1.0.0", "[1.0,2.0)", true],
    ["2.0.0", "[1.0,2.0]", true],
    ["1.0.0", "(1.0,2.0]", false],
    ["99.0.0", "[1.0,)", true],
    ["1.9.9", "(,2.0)", true],
    ["2.0.0", "(,2.0)", false],
    ["1.2.3", "1.2", true],
    ["1.1.9", "1.2", false],
  ] as const)("evaluates whether %s satisfies %s", (version, range, result) => {
    expect(satisfiesVersionRange(version, range)).toBe(result);
  });

  it("recognizes ranges that cannot contain a version", () => {
    expect(isEmptyVersionRange("(1.0,1.0]")).toBe(true);
    expect(isEmptyVersionRange("[2.0,1.0]")).toBe(true);
    expect(isEmptyVersionRange("[1.0,1.0]")).toBe(false);
    expect(isEmptyVersionRange("[1.0,)")).toBe(false);
  });
});
