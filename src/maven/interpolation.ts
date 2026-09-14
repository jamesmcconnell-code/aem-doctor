const PROPERTY_PATTERN = /\$\{([^{}]+)\}/g;

/** Resolve Maven-style placeholders while preserving unknown or cyclic values. */
export function interpolateMavenValue(
  value: string,
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>> = {},
): string {
  return interpolate(value, properties, builtins, new Set());
}

export function resolveMavenProperties(
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const resolved: Record<string, string> = {};

  for (const [name, value] of Object.entries(properties)) {
    resolved[name] = interpolate(value, properties, builtins, new Set([name]));
  }

  return Object.freeze(resolved);
}

function interpolate(
  value: string,
  properties: Readonly<Record<string, string>>,
  builtins: Readonly<Record<string, string>>,
  resolving: Set<string>,
): string {
  return value.replace(PROPERTY_PATTERN, (placeholder: string, name: string) => {
    if (resolving.has(name)) {
      return placeholder;
    }

    const replacement = builtins[name] ?? properties[name];
    if (replacement === undefined) {
      return placeholder;
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(name);
    return interpolate(replacement, properties, builtins, nextResolving);
  });
}
