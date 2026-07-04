import { Platform } from "react-native";

/**
 * Non-blocking device checks. Does NOT log users out (WhatsApp-style).
 * Extend with native root detection in a future build if needed.
 */
export type DeviceIntegrityResult = {
  platform: string;
  /** Informational only — never used to force logout. */
  elevatedRisk: boolean;
};

export async function evaluateDeviceIntegrity(): Promise<DeviceIntegrityResult> {
  return {
    platform: Platform.OS,
    elevatedRisk: false,
  };
}
