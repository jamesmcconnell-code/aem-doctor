import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished } from "node:stream/promises";

import { afterEach, describe, expect, it } from "vitest";
import { ZipFile } from "yazl";

import { diagnoseProject } from "../../src/diagnoser/index.js";
import { renderJsonReport } from "../../src/reporter/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("project diagnosis pipeline", () => {
  it("runs Maven discovery through deterministic OSGi rules", async () => {
    const projectDirectory = await createProjectDirectory();
    const targetDirectory = join(projectDirectory, "target");
    await createJar(
      join(targetDirectory, "provider.jar"),
      "Manifest-Version: 1.0\r\n" +
        "Bundle-SymbolicName: example.provider\r\n" +
        "Export-Package: example.api;version=1.5.0\r\n\r\n",
    );
    await createJar(
      join(targetDirectory, "consumer.jar"),
      "Manifest-Version: 1.0\r\n" +
        "Bundle-SymbolicName: example.consumer\r\n" +
        'Import-Package: example.api;version="[1.0,2.0)",' +
        'example.missing;version="[1.0,2.0)"\r\n\r\n',
    );
    const debugMessages: string[] = [];

    const result = await diagnoseProject(
      projectDirectory,
      { verbose: true },
      { onDebug: (message) => debugMessages.push(message) },
    );

    expect(result.context.project.modules).toHaveLength(1);
    expect(result.context.bundles).toHaveLength(2);
    expect(result.context.warnings).toEqual([]);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "AD-OSGI-001",
      "AD-OSGI-003",
    ]);
    expect(debugMessages).toEqual(
      expect.arrayContaining([
        "Maven modules parsed: 1",
        "JARs discovered: 2",
        "Diagnostic rules completed: 2 findings",
      ]),
    );
    expect(
      debugMessages.some((message) => message.startsWith("Dependency graph:")),
    ).toBe(true);

    const repeatedResult = await diagnoseProject(projectDirectory, {
      verbose: true,
    });
    expect(renderJsonReport(repeatedResult)).toBe(renderJsonReport(result));
  });

  it("continues when one discovered JAR is corrupt", async () => {
    const projectDirectory = await createProjectDirectory();
    const targetDirectory = join(projectDirectory, "target");
    await writeFile(join(targetDirectory, "corrupt.jar"), "not a zip archive");
    await createJar(
      join(targetDirectory, "valid.jar"),
      "Manifest-Version: 1.0\nBundle-SymbolicName: valid.bundle\n\n",
    );

    const result = await diagnoseProject(projectDirectory);

    expect(result.context.bundles).toHaveLength(1);
    expect(result.context.warnings.map((warning) => warning.code)).toEqual([
      "JAR_READ_FAILED",
    ]);
  });

  it("reports a valid directory with no POMs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "aem-doctor-empty-test-"));
    temporaryDirectories.push(directory);

    const result = await diagnoseProject(directory);
    expect(result.context.project.modules).toEqual([]);
    expect(result.context.warnings[0]?.code).toBe("NO_MAVEN_MODULES_FOUND");
  });

  it("resolves project imports from a recursive runtime bundle inventory", async () => {
    const projectDirectory = await createProjectDirectory();
    const runtimeDirectory = await createRuntimeDirectory();
    await createJar(
      join(projectDirectory, "target", "consumer.jar"),
      "Manifest-Version: 1.0\r\n" +
        "Bundle-SymbolicName: project.consumer\r\n" +
        'Import-Package: runtime.api;version="[5.12,5.13)"\r\n\r\n',
    );
    await createJar(
      join(runtimeDirectory, "nested", "runtime-provider.jar"),
      "Manifest-Version: 1.0\r\n" +
        "Bundle-SymbolicName: runtime.provider\r\n" +
        'Import-Package: runtime.internal.missing;version="[1,2)"\r\n' +
        "Export-Package: runtime.api;version=5.12.3\r\n\r\n",
    );

    const withoutRuntime = await diagnoseProject(projectDirectory);
    expect(withoutRuntime.findings).toEqual([
      expect.objectContaining({
        ruleId: "AD-OSGI-001",
        packageName: "runtime.api",
      }),
    ]);

    const withRuntime = await diagnoseProject(projectDirectory, {
      runtimeBundlesPath: runtimeDirectory,
      verbose: true,
    });

    expect(withRuntime.context.runtimeInventory).toMatchObject({
      rootPath: runtimeDirectory,
      complete: true,
    });
    expect(withRuntime.context.runtimeInventory?.bundles).toHaveLength(1);
    expect(withRuntime.findings).toEqual([
      expect.objectContaining({
        ruleId: "AD-OSGI-003",
        packageName: "runtime.api",
        providerBundle: "runtime.provider",
        providerOrigin: "RUNTIME",
        resolution: "COMPATIBLE",
      }),
    ]);
    expect(
      withRuntime.findings.some(
        (finding) => finding.packageName === "runtime.internal.missing",
      ),
    ).toBe(false);
  });

  it("marks an unreadable requested runtime inventory as incomplete", async () => {
    const projectDirectory = await createProjectDirectory();
    const missingRuntimePath = join(projectDirectory, "missing-runtime");

    const result = await diagnoseProject(projectDirectory, {
      runtimeBundlesPath: missingRuntimePath,
    });

    expect(result.context.runtimeInventory).toMatchObject({
      rootPath: missingRuntimePath,
      complete: false,
      bundles: [],
    });
    expect(result.context.warnings[0]?.code).toBe("RUNTIME_PATH_INVALID");
  });
});

async function createProjectDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aem-doctor-project-test-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "target"));
  await writeFile(
    join(directory, "pom.xml"),
    "<project><groupId>com.example</groupId>" +
      "<artifactId>fixture</artifactId><version>1.0.0</version></project>",
  );
  return directory;
}

async function createRuntimeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aem-doctor-runtime-test-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "nested"));
  return directory;
}

async function createJar(jarPath: string, manifest: string): Promise<void> {
  const archive = new ZipFile();
  archive.addBuffer(Buffer.from(manifest), "META-INF/MANIFEST.MF");
  const output = createWriteStream(jarPath);
  archive.outputStream.pipe(output);
  archive.end();
  await finished(output);
}
