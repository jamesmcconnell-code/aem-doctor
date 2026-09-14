import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  ManifestParseError,
  parseBundleManifest,
  parseManifestHeaders,
} from "../../src/osgi/index.js";

const fixturePath = new URL("../fixtures/manifests/aem-bundle.MF", import.meta.url);

describe("manifest parsing", () => {
  it("unfolds continuation lines and ignores named sections", async () => {
    const headers = parseManifestHeaders(await readFile(fixturePath));

    expect(headers["Import-Package"]).toContain(
      'com.example.bar;version="[5.12,5.13)"',
    );
    expect(headers["Export-Package"]).toContain('uses:="com.a,com.b"');
    expect(headers["Ignored-Header"]).toBeUndefined();
  });

  it("extracts bundle and package metadata", async () => {
    const manifest = parseBundleManifest(
      "/project/core/target/core.jar",
      await readFile(fixturePath),
    );

    expect(manifest.symbolicName).toBe("com.example.consumer");
    expect(manifest.bundleVersion).toMatchObject({
      major: 1,
      minor: 2,
      micro: 3,
      qualifier: "release_1",
    });
    expect(manifest.importedPackages.map((entry) => entry.packageName)).toEqual([
      "com.example.foo",
      "com.example.bar",
      "com.example.shared",
      "com.example.shared.api",
    ]);
    expect(manifest.importedPackages[1]?.versionRange?.raw).toBe("[5.12,5.13)");
    expect(manifest.importedPackages[1]?.directives.resolution).toBe("optional");
    expect(manifest.exportedPackages[0]).toMatchObject({
      packageName: "com.example.exported",
      version: { major: 5, minor: 12, micro: 3 },
      directives: { uses: "com.a,com.b" },
    });
    expect(manifest.requireCapability).toEqual([
      'osgi.ee;filter:="(&(osgi.ee=JavaSE)(version>=17))"',
    ]);
    expect(manifest.provideCapability).toEqual([
      'osgi.service;objectClass:List<String>="com.example.A,com.example.B"',
    ]);
  });

  it("treats manifest header names case-insensitively", () => {
    const manifest = parseBundleManifest(
      "case.jar",
      "manifest-version: 1.0\r\nbundle-symbolicname: example.case\r\n\r\n",
    );

    expect(manifest.symbolicName).toBe("example.case");
  });

  it("recognizes typed package version attributes", () => {
    const manifest = parseBundleManifest(
      "typed-version.jar",
      "Manifest-Version: 1.0\n" +
        "Export-Package: example.typed;version:Version=5.12.3\n\n",
    );

    expect(manifest.exportedPackages[0]?.version).toMatchObject({
      major: 5,
      minor: 12,
      micro: 3,
    });
  });

  it.each([
    " continuation-without-header\n",
    "Malformed header\n",
    "Manifest-Version: 1.0\nmanifest-version: 1.0\n",
  ])("rejects malformed manifest content", (content) => {
    expect(() => parseManifestHeaders(content)).toThrow(ManifestParseError);
  });

  it("wraps malformed OSGi metadata with its JAR source", () => {
    expect(() =>
      parseBundleManifest(
        "broken.jar",
        'Manifest-Version: 1.0\nImport-Package: example;version="[1,2"\n',
      ),
    ).toThrowError(/broken\.jar/);
  });
});
