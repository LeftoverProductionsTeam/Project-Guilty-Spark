/** JSON object field order carries no authored meaning. Array order still does.
 * Canonical comparison does not rewrite the document sent to native validators. */
export function semanticJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}
export const sameJson = (a: unknown, b: unknown) => semanticJson(a) === semanticJson(b);
