import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildDependencyGraph } from "../../src/graph/index.js";
import { parseBundleManifest } from "../../src/osgi/index.js";

describe("package dependency graph", () => {
  it("indexes consumers and providers in both directions", async () => {
    const provider = await loadBundle("provider.MF");
    const consumer = await loadBundle("compatible-consumer.MF");
    const graph = buildDependencyGraph([consumer, provider]);
    const packageNode = graph.packages.get("com.example.compatible");

    expect(graph.bundles.size).toBe(2);
    expect(packageNode?.consumers).toHaveLength(1);
    expect(packageNode?.providers).toHaveLength(1);
    expect(
      graph.bundles.get(packageNode!.consumers[0]!.bundleId)?.manifest
        .symbolicName,
    ).toBe("com.example.compatible-consumer");
    expect(
      graph.bundles.get(packageNode!.providers[0]!.bundleId)?.manifest
        .symbolicName,
    ).toBe("com.example.provider");
  });

  it("supports multiple providers for one package", async () => {
    const provider = await loadBundle("provider.MF");
    const alternate = parseBundleManifest(
      "/bundles/alternate-provider.jar",
      "Manifest-Version: 1.0\n" +
        "Bundle-SymbolicName: alternate.provider\n" +
        "Export-Package: com.example.compatible;version=6.0.0\n\n",
    );
    const graph = buildDependencyGraph([alternate, provider]);

    expect(graph.packages.get("com.example.compatible")?.providers).toHaveLength(
      2,
    );
  });

  it("uses artifact paths as collision-safe bundle identities", () => {
    const first = parseBundleManifest(
      "/one/shared.jar",
      "Bundle-SymbolicName: shared.name\nExport-Package: one.api\n\n",
    );
    const second = parseBundleManifest(
      "/two/shared.jar",
      "Bundle-SymbolicName: shared.name\nExport-Package: two.api\n\n",
    );

    expect(buildDependencyGraph([second, first]).bundles.size).toBe(2);
  });

  it("records whether a bundle came from the project or runtime inventory", () => {
    const projectBundle = parseBundleManifest(
      "/project/consumer.jar",
      "Bundle-SymbolicName: project.consumer\nImport-Package: runtime.api\n\n",
    );
    const runtimeBundle = parseBundleManifest(
      "/runtime/provider.jar",
      "Bundle-SymbolicName: runtime.provider\nExport-Package: runtime.api\n\n",
    );
    const graph = buildDependencyGraph([projectBundle], [runtimeBundle]);

    expect(graph.bundles.get(projectBundle.jarPath)?.origin).toBe("PROJECT");
    expect(graph.bundles.get(runtimeBundle.jarPath)?.origin).toBe("RUNTIME");
  });
});

async function loadBundle(name: string) {
  const fixture = new URL(`../fixtures/bundles/${name}`, import.meta.url);
  return parseBundleManifest(`/bundles/${name}.jar`, await readFile(fixture));
}
