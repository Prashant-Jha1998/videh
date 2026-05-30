/** Maps blob: URLs from web file pickers to real File objects for FormData upload. */
const registry = new Map<string, File>();

export function registerWebFile(file: File): string {
  const uri = URL.createObjectURL(file);
  registry.set(uri, file);
  return uri;
}

export function getWebFile(uri: string): File | undefined {
  return registry.get(uri);
}

export function revokeWebFile(uri: string): void {
  registry.delete(uri);
  if (uri.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(uri);
    } catch {
      /* ignore */
    }
  }
}
