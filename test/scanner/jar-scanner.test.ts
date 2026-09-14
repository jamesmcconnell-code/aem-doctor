import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import { afterEach, describe, expect, it } from "vitest";
import { ZipFile } from "yazl";

import {
  discoverModuleJars,
  inspectJar,
  readJarManifest,
} from "../../src/scanner/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("JAR discovery", () => {
  it("finds primary target JARs in deterministic order", async () => {
    const moduleDirectory = await createTemporaryDirectory();
    const targetDirectory = join(moduleDirectory, "target");
    await mkdir(targetDirectory);
    await Promise.all(
      [
        "z-bundle.jar",
        "a-bundle.jar",
        "a-bundle-sources.jar",
        "a-bundle-javadoc.jar",
        "original-a-bundle.jar",
        "not-a-jar.txt",
      ].map((name) => writeFile(join(targetDirectory, name), "fixture")),
    );

    const result = await discoverModuleJars(moduleDirectory);

    expect(result.jarPaths).toEqual([
      join(targetDirectory, "a-bundle.jar"),
      join(targetDirectory, "z-bundle.jar"),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("treats a missing target directory as an unbuilt module", async () => {
    const result = await discoverModuleJars(await createTemporaryDirectory());
    expect(result).toMatchObject({ jarPaths: [], warnings: [] });
  });
});

describe("JAR manifest inspection", () => {
  it("reads and parses META-INF/MANIFEST.MF without extracting the JAR", async () => {
    const directory = await createTemporaryDirectory();
    const jarPath = join(directory, "bundle.jar");
    await createJar(
      jarPath,
      "Manifest-Version: 1.0\r\nBundle-SymbolicName: example.bundle\r\n" +
        "Export-Package: example.api;version=5.12.3\r\n\r\n",
    );

    const rawManifest = await readJarManifest(jarPath);
    const result = await inspectJar(jarPath);

    expect(rawManifest?.toString("utf8")).toContain("example.bundle");
    expect(result.manifest?.symbolicName).toBe("example.bundle");
    expect(result.manifest?.exportedPackages[0]?.version).toMatchObject({
      major: 5,
      minor: 12,
      micro: 3,
    });
    expect(result.warnings).toEqual([]);
  });

  it("reports a missing manifest without throwing", async () => {
    const directory = await createTemporaryDirectory();
    const jarPath = join(directory, "no-manifest.jar");
    await createJar(jarPath);

    const result = await inspectJar(jarPath);
    expect(result.manifest).toBeUndefined();
    expect(result.warnings[0]?.code).toBe("JAR_MANIFEST_MISSING");
  });

  it("reports corrupt JARs without throwing", async () => {
    const directory = await createTemporaryDirectory();
    const jarPath = join(directory, "corrupt.jar");
    await writeFile(jarPath, "not a ZIP archive");

    const result = await inspectJar(jarPath);
    expect(result.manifest).toBeUndefined();
    expect(result.warnings[0]?.code).toBe("JAR_READ_FAILED");
  });

  it("reports malformed OSGi metadata without throwing", async () => {
    const directory = await createTemporaryDirectory();
    const jarPath = join(directory, "malformed.jar");
    await createJar(
      jarPath,
      'Manifest-Version: 1.0\r\nImport-Package: example;version="[1,2"\r\n\r\n',
    );

    const result = await inspectJar(jarPath);
    expect(result.manifest).toBeUndefined();
    expect(result.warnings[0]?.code).toBe("MANIFEST_MALFORMED");
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aem-doctor-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createJar(jarPath: string, manifest?: string): Promise<void> {
  const archive = new ZipFile();
  if (manifest !== undefined) {
    archive.addBuffer(Buffer.from(manifest), "META-INF/MANIFEST.MF");
  } else {
    archive.addBuffer(Buffer.from("fixture"), "example.txt");
  }

  const output = createWriteStream(jarPath);
  archive.outputStream.pipe(output);
  archive.end();
  await finished(output);
}
