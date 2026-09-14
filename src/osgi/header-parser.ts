export interface OsgiHeaderClause {
  readonly names: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly directives: Readonly<Record<string, string>>;
}

export class OsgiHeaderParseError extends Error {
  override readonly name = "OsgiHeaderParseError";

  constructor(
    readonly input: string,
    reason: string,
  ) {
    super(`Invalid OSGi header "${input}": ${reason}`);
  }
}

/** Parse the common OSGi clause syntax used by package and capability headers. */
export function parseOsgiHeader(input: string): readonly OsgiHeaderClause[] {
  const clauses = splitOsgiHeader(input).map((clause) => parseClause(clause, input));
  return Object.freeze(clauses);
}

/** Split top-level clauses while preserving their original parameters. */
export function splitOsgiHeader(input: string): readonly string[] {
  if (input.trim() === "") {
    return Object.freeze([]);
  }

  return Object.freeze(
    splitOutsideQuotes(input, ",", input).map((value) => {
      const clause = value.trim();
      if (clause === "") {
        throw new OsgiHeaderParseError(input, "empty clause");
      }
      return clause;
    }),
  );
}

function parseClause(clause: string, fullInput: string): OsgiHeaderClause {
  const segments = splitOutsideQuotes(clause, ";", fullInput).map((part) =>
    part.trim(),
  );
  const names: string[] = [];
  const attributes: Record<string, string> = {};
  const directives: Record<string, string> = {};
  let parametersStarted = false;

  for (const segment of segments) {
    if (segment === "") {
      throw new OsgiHeaderParseError(fullInput, "empty clause segment");
    }

    const parameter = parseParameter(segment, fullInput);
    if (parameter === undefined) {
      if (parametersStarted) {
        throw new OsgiHeaderParseError(
          fullInput,
          `name "${segment}" appears after a parameter`,
        );
      }
      names.push(segment);
      continue;
    }

    parametersStarted = true;
    const target = parameter.directive ? directives : attributes;
    if (Object.hasOwn(target, parameter.name)) {
      throw new OsgiHeaderParseError(
        fullInput,
        `duplicate parameter "${parameter.name}"`,
      );
    }
    target[parameter.name] = parameter.value;
  }

  if (names.length === 0) {
    throw new OsgiHeaderParseError(fullInput, "a clause requires a name");
  }

  return Object.freeze({
    names: Object.freeze(names),
    attributes: Object.freeze(attributes),
    directives: Object.freeze(directives),
  });
}

function parseParameter(
  segment: string,
  fullInput: string,
): { name: string; value: string; directive: boolean } | undefined {
  const directiveIndex = segment.indexOf(":=");
  const attributeIndex = segment.indexOf("=");
  const isDirective = directiveIndex >= 0;
  const separatorIndex = isDirective ? directiveIndex : attributeIndex;

  if (separatorIndex < 0) {
    return undefined;
  }

  const name = segment.slice(0, separatorIndex).trim();
  const valueStart = separatorIndex + (isDirective ? 2 : 1);
  const value = segment.slice(valueStart).trim();

  if (name === "") {
    throw new OsgiHeaderParseError(fullInput, "parameter name is empty");
  }

  return {
    name,
    value: unquote(value, fullInput),
    directive: isDirective,
  };
}

function unquote(value: string, fullInput: string): string {
  const beginsQuoted = value.startsWith('"');
  const endsQuoted = value.endsWith('"');

  if (!beginsQuoted && !endsQuoted) {
    if (value.includes('"')) {
      throw new OsgiHeaderParseError(fullInput, "unexpected quote in value");
    }
    return value;
  }

  if (!beginsQuoted || !endsQuoted || value.length < 2) {
    throw new OsgiHeaderParseError(fullInput, "unterminated quoted value");
  }

  const inner = value.slice(1, -1);
  let result = "";
  let escaped = false;

  for (const character of inner) {
    if (escaped) {
      result += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else {
      result += character;
    }
  }

  if (escaped) {
    throw new OsgiHeaderParseError(fullInput, "quoted value ends with an escape");
  }

  return result;
}

function splitOutsideQuotes(
  input: string,
  delimiter: string,
  fullInput: string,
): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;

  for (const character of input) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (character === '"') {
      current += character;
      quoted = !quoted;
      continue;
    }

    if (character === delimiter && !quoted) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  if (quoted || escaped) {
    throw new OsgiHeaderParseError(fullInput, "unterminated quoted value");
  }

  parts.push(current);
  return parts;
}
