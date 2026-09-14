import { describe, expect, it } from "vitest";

import {
  OsgiHeaderParseError,
  parseOsgiHeader,
  splitOsgiHeader,
} from "../../src/osgi/index.js";

describe("OSGi header parser", () => {
  it("keeps quoted commas inside an attribute value", () => {
    const clauses = parseOsgiHeader(
      'com.example.foo;version="[1.0,2.0)",com.example.bar;uses:="a,b"',
    );

    expect(clauses).toHaveLength(2);
    expect(clauses[0]).toMatchObject({
      names: ["com.example.foo"],
      attributes: { version: "[1.0,2.0)" },
    });
    expect(clauses[1]).toMatchObject({
      names: ["com.example.bar"],
      directives: { uses: "a,b" },
    });
  });

  it("supports multiple package names sharing parameters", () => {
    const [clause] = parseOsgiHeader(
      'com.example.one;com.example.two;version="1.2.3"',
    );

    expect(clause?.names).toEqual(["com.example.one", "com.example.two"]);
    expect(clause?.attributes).toEqual({ version: "1.2.3" });
  });

  it("unescapes quoted attribute values", () => {
    const [clause] = parseOsgiHeader('com.example;note="say \\"hello\\""');
    expect(clause?.attributes.note).toBe('say "hello"');
  });

  it("can preserve raw top-level capability clauses", () => {
    expect(
      splitOsgiHeader(
        'osgi.service;objectClass:List<String>="a,b",osgi.ee;filter:="(x=y)"',
      ),
    ).toEqual([
      'osgi.service;objectClass:List<String>="a,b"',
      'osgi.ee;filter:="(x=y)"',
    ]);
  });

  it.each([
    'com.example;version="[1.0,2.0)',
    "com.example;;version=1",
    "com.example;version=1;another-name",
    "com.example,",
  ])("rejects malformed header %j", (header) => {
    expect(() => parseOsgiHeader(header)).toThrow(OsgiHeaderParseError);
  });
});
