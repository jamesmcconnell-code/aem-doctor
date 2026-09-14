import { describe, expect, it } from "vitest";

import {
  interpolateMavenValue,
  resolveMavenProperties,
} from "../../src/maven/index.js";

describe("Maven property interpolation", () => {
  it("resolves custom properties recursively", () => {
    expect(
      interpolateMavenValue("version=${alias}", {
        alias: "${release.version}",
        "release.version": "5.12.3",
      }),
    ).toBe("version=5.12.3");
  });

  it("resolves Maven project aliases", () => {
    expect(
      interpolateMavenValue(
        "${project.groupId}:${project.artifactId}:${pom.version}",
        {},
        {
          "project.groupId": "com.example",
          "project.artifactId": "core",
          "pom.version": "1.2.3",
        },
      ),
    ).toBe("com.example:core:1.2.3");
  });

  it("preserves unknown and cyclic placeholders", () => {
    expect(interpolateMavenValue("${unknown}", {})).toBe("${unknown}");
    expect(
      resolveMavenProperties({ first: "${second}", second: "${first}" }),
    ).toEqual({ first: "${first}", second: "${second}" });
  });
});
