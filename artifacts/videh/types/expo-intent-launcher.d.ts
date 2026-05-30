declare module "expo-intent-launcher" {
  export function startActivityAsync(action: string, params: Record<string, unknown>): Promise<void>;
}
