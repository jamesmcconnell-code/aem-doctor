import { describe, expect, it } from "vitest";

import {
  compareVersions,
  formatVersion,
  OsgiVersionParseError,
  parseVersion,
} from "../../src/osgi/index.js";

describe("OSGi version parsing", () => {
  it.each([
    ["1", 1, 0, 0, ""],
    ["1.2", 1, 2, 0, ""],
    ["1.2.3", 1, 2, 3, ""],
    ["1.2.3.qualifier", 1, 2, 3, "qualifier"],
    ["5.12.3", 5, 12, 3, ""],
    ["1.2.3.release_1-2", 1, 2, 3, "release_1-2"],
  ])(
    "parses %s",
    (input, expectedMajor, expectedMinor, expectedMicro, expectedQualifier) => {
      expect(parseVersion(input)).toMatchObject({
        major: expectedMajor,
        minor: expectedMinor,
        micro: expectedMicro,
        qualifier: expectedQualifier,
        raw: input,
      });
    },
  );

  it("normalizes omitted numeric components for display", () => {
    expect(formatVersion(parseVersion("5.12"))).toBe("5.12.0");
    expect(formatVersion(parseVersion("1.2.3.beta"))).toBe("1.2.3.beta");
  });

  it.each([
    "",
    "-1.2.3",
    "1.x.3",
    "1.2.3.bad.qualifier",
    "1.2.3.bad qualifier",
    "1.2.3.",
    "2147483648.0.0",
  ])("rejects malformed version %j", (input) => {
    expect(() => parseVersion(input)).toThrow(OsgiVersionParseError);
  });
});

describe("OSGi version comparison", () => {
  it.each([
    ["5.12.3", "5.11.2", 1],
    ["5.12.3", "5.13.0", -1],
    ["5.12.3", "5.12.3", 0],
    ["5.12", "5.12.0", 0],
    ["1.2.3", "1.2.3.alpha", -1],
    ["1.2.3.alpha", "1.2.3.beta", -1],
  ] as const)("compares %s with %s", (left, right, expected) => {
    expect(compareVersions(parseVersion(left), parseVersion(right))).toBe(
      expected,
    );
  });
});
