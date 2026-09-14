export class OsgiVersionParseError extends Error {
  override readonly name = "OsgiVersionParseError";

  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`Invalid OSGi version "${input}": ${reason}`);
  }
}

export class OsgiVersionRangeParseError extends Error {
  override readonly name = "OsgiVersionRangeParseError";

  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`Invalid OSGi version range "${input}": ${reason}`);
  }
}
