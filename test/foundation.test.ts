import { describe, expect, it } from "vitest";

import {
  AEM_DOCTOR_VERSION,
  DIAGNOSTIC_CATEGORIES,
  DIAGNOSTIC_SEVERITIES,
} from "../src/index.js";
import { createProgram } from "../src/cli/create-program.js";

describe("project foundation", () => {
  it("exposes the expected product version", () => {
    expect(AEM_DOCTOR_VERSION).toBe("0.0.2");
  });

  it("defines the required diagnostic severities and future categories", () => {
    expect(DIAGNOSTIC_SEVERITIES).toEqual([
      "INFO",
      "WARNING",
      "ERROR",
      "CRITICAL",
    ]);
    expect(DIAGNOSTIC_CATEGORIES).toContain("OSGI");
    expect(DIAGNOSTIC_CATEGORIES).toContain("MIGRATION");
  });

  it("configures the CLI identity without running business logic", () => {
    const program = createProgram();

    expect(program.name()).toBe("aem-doctor");
    expect(program.version()).toBe("0.0.2");
  });
});
