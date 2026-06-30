/** Expo Router may pass dynamic params as string | string[]. */
export function normalizeRouteParam(value: string | string[] | undefined | null): string | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}
