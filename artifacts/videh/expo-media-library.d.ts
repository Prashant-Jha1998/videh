/** Minimal typings until `expo-media-library` is installed in node_modules. */
declare module "expo-media-library" {
  export type PermissionStatus = "granted" | "denied" | "undetermined";
  export function requestPermissionsAsync(): Promise<{ status: PermissionStatus }>;
  export function saveToLibraryAsync(localUri: string): Promise<void>;
}
