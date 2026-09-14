import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { discoverPomFiles } from "../../src/scanner/index.js";

const fixtureDirectory = fileURLToPath(
  new URL("../fixtures/maven-project", import.meta.url),
);

describe("Maven project filesystem discovery", () => {
  it("recursively finds POMs in deterministic order and ignores build directories", async () => {
    const result = await discoverPomFiles(fixtureDirectory);

    expect(result.pomPaths.map((path) => path.slice(fixtureDirectory.length + 1))).toEqual([
      "broken/pom.xml",
      "core/pom.xml",
      "pom.xml",
      "ui.apps/pom.xml",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("reports a missing project path without throwing", async () => {
    const result = await discoverPomFiles(
      `${fixtureDirectory}/definitely-does-not-exist`,
    );

    expect(result.pomPaths).toEqual([]);
    expect(result.warnings[0]?.code).toBe("PROJECT_PATH_INVALID");
  });

  it("reports a supplied file instead of treating it as a project", async () => {
    const result = await discoverPomFiles(`${fixtureDirectory}/pom.xml`);

    expect(result.pomPaths).toEqual([]);
    expect(result.warnings[0]?.code).toBe("PROJECT_PATH_NOT_DIRECTORY");
  });
});
