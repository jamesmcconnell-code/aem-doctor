import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverRuntimeJars } from "../../src/scanner/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("runtime bundle discovery", () => {
  it("recursively finds primary JARs in deterministic order", async () => {
    const directory = await createTemporaryDirectory();
    await mkdir(join(directory, "nested", "bundles"), { recursive: true });
    await mkdir(join(directory, "node_modules", "ignored"), { recursive: true });
    await Promise.all([
      writeFile(join(directory, "z-runtime.jar"), "fixture"),
      writeFile(join(directory, "nested", "bundles", "a-runtime.jar"), "fixture"),
      writeFile(join(directory, "runtime-sources.jar"), "fixture"),
      writeFile(join(directory, "original-runtime.jar"), "fixture"),
      writeFile(
        join(directory, "node_modules", "ignored", "ignored.jar"),
        "fixture",
      ),
    ]);

    const result = await discoverRuntimeJars(directory);

    expect(result.jarPaths).toEqual([
      join(directory, "nested", "bundles", "a-runtime.jar"),
      join(directory, "z-runtime.jar"),
    ]);
    expect(result.complete).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("reports an invalid runtime path without throwing", async () => {
    const directory = await createTemporaryDirectory();
    const result = await discoverRuntimeJars(join(directory, "missing"));

    expect(result.jarPaths).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.warnings[0]?.code).toBe("RUNTIME_PATH_INVALID");
  });

  it("rejects a file where a runtime directory is required", async () => {
    const directory = await createTemporaryDirectory();
    const filePath = join(directory, "bundle.jar");
    await writeFile(filePath, "fixture");

    const result = await discoverRuntimeJars(filePath);
    expect(result.complete).toBe(false);
    expect(result.warnings[0]?.code).toBe("RUNTIME_PATH_NOT_DIRECTORY");
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "aem-doctor-runtime-test-"));
  temporaryDirectories.push(directory);
  return directory;
}
