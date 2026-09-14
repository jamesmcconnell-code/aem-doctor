import { describe, expect, it } from "vitest";

import { PomParseError, parsePomXml } from "../../src/maven/index.js";

describe("Maven POM parsing", () => {
  it("parses core Maven metadata without coercing version strings", () => {
    const pom = parsePomXml(
      "/project/pom.xml",
      "/project",
      `
        <project>
          <groupId>com.example</groupId>
          <artifactId>sample</artifactId>
          <version>01.02.003</version>
          <properties><release>5.12.3</release></properties>
          <modules><module>core</module><module>ui.apps</module></modules>
          <dependencies>
            <dependency>
              <groupId>com.example</groupId>
              <artifactId>api</artifactId>
              <version>\${release}</version>
              <optional>false</optional>
            </dependency>
          </dependencies>
        </project>
      `,
    );

    expect(pom).toMatchObject({
      groupId: "com.example",
      artifactId: "sample",
      version: "01.02.003",
      declaredModulePaths: ["core", "ui.apps"],
      properties: { release: "5.12.3" },
    });
    expect(pom.dependencies[0]).toMatchObject({
      artifactId: "api",
      version: "${release}",
      optional: "false",
    });
  });

  it("preserves an explicitly empty parent relativePath", () => {
    const pom = parsePomXml(
      "child/pom.xml",
      "child",
      `<project>
        <parent>
          <groupId>com.external</groupId>
          <artifactId>parent</artifactId>
          <version>1.0.0</version>
          <relativePath/>
        </parent>
        <artifactId>child</artifactId>
      </project>`,
    );

    expect(pom.parent?.relativePath).toBeNull();
  });

  it.each([
    "<project><version>1.0</version></project>",
    "<project><artifactId>broken</artifactId>",
    '<!DOCTYPE project [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><project><artifactId>&xxe;</artifactId></project>',
  ])("rejects malformed or unsafe POM input", (xml) => {
    expect(() => parsePomXml("broken/pom.xml", "broken", xml)).toThrow(
      PomParseError,
    );
  });
});
