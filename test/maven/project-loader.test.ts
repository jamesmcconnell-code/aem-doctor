import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { discoverMavenProject } from "../../src/maven/index.js";

const fixtureDirectory = fileURLToPath(
  new URL("../fixtures/maven-project", import.meta.url),
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Maven project loading", () => {
  it("resolves local parent inheritance and project properties", async () => {
    const result = await discoverMavenProject(fixtureDirectory);
    const core = result.project.modules.find(
      (module) => module.coordinate.artifactId === "fixture-core",
    );

    expect(result.project.modules).toHaveLength(3);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "POM_PARSE_FAILED",
    ]);
    expect(core?.coordinate).toEqual({
      groupId: "com.example.aem",
      artifactId: "fixture-core",
      version: "1.2.3",
    });
    expect(core?.parent).toMatchObject({
      groupId: "com.example.aem",
      artifactId: "fixture-parent",
      version: "1.2.3",
      relativePath: "../pom.xml",
    });
    expect(core?.packaging).toBe("jar");
    expect(core?.properties).toMatchObject({
      "api.version": "5.13.0",
      "shared.version": "1.2.3",
      "nested.version": "5.13.0",
      "module.coordinate": "com.example.aem:fixture-core:1.2.3",
      "fixture.description": "AEM & OSGi",
    });
  });

  it("parses and inherits dependencies and dependency management", async () => {
    const result = await discoverMavenProject(fixtureDirectory);
    const core = result.project.modules.find(
      (module) => module.coordinate.artifactId === "fixture-core",
    );

    expect(core?.dependencies).toEqual([
      {
        groupId: "org.example",
        artifactId: "inherited-api",
        version: "2.0.0",
      },
      {
        groupId: "com.example.platform",
        artifactId: "managed-api",
      },
      {
        groupId: "com.example",
        artifactId: "core-api",
        version: "5.13.0",
        scope: "provided",
        optional: true,
      },
    ]);
    expect(core?.dependencyManagement).toEqual([
      {
        groupId: "com.example.platform",
        artifactId: "managed-api",
        version: "5.12.3",
      },
    ]);
  });

  it("associates primary target JARs with their Maven module", async () => {
    const directory = await createTemporaryDirectory();
    const targetDirectory = join(directory, "target");
    await mkdir(targetDirectory);
    await writeFile(
      join(directory, "pom.xml"),
      "<project><artifactId>single-module</artifactId></project>",
    );
    await Promise.all([
      writeFile(join(targetDirectory, "single-module.jar"), "fixture"),
      writeFile(join(targetDirectory, "single-module-sources.jar"), "fixture"),
    ]);

    const result = await discoverMavenProject(directory);
    expect(result.project.modules[0]?.artifactPaths).toEqual([
      join(targetDirectory, "single-module.jar"),
    ]);
  });

  it("returns a usable empty project for an invalid path", async () => {
    const suppliedPath = `${fixtureDirectory}/missing`;
    const result = await discoverMavenProject(suppliedPath);

    expect(result.project.modules).toEqual([]);
    expect(result.warnings[0]?.code).toBe("PROJECT_PATH_INVALID");
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aem-doctor-maven-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
