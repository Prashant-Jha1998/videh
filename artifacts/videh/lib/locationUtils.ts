import * as Location from "expo-location";
import { Platform } from "react-native";

export type DeviceCoords = {
  latitude: number;
  longitude: number;
  fromCache: boolean;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function requestForegroundLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export async function ensureLocationServicesEnabled(): Promise<boolean> {
  try {
    let enabled = await Location.hasServicesEnabledAsync();
    if (!enabled && Platform.OS === "android") {
      await Location.enableNetworkProviderAsync().catch(() => {});
      enabled = await Location.hasServicesEnabledAsync();
    }
    return enabled;
  } catch {
    return true;
  }
}

/**
 * WhatsApp-style: prefer a recent cached fix for instant UI, then refine with GPS.
 */
export async function resolveDeviceLocation(opts?: {
  timeoutMs?: number;
  cachedMaxAgeMs?: number;
}): Promise<DeviceCoords | null> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const cachedMaxAgeMs = opts?.cachedMaxAgeMs ?? 10 * 60 * 1000;

  const recent = await Location.getLastKnownPositionAsync({ maxAge: cachedMaxAgeMs }).catch(() => null);
  if (recent) {
    return {
      latitude: recent.coords.latitude,
      longitude: recent.coords.longitude,
      fromCache: true,
    };
  }

  const current = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    }),
    timeoutMs,
  );
  if (current) {
    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
      fromCache: false,
    };
  }

  const stale = await Location.getLastKnownPositionAsync({ maxAge: 7 * 24 * 60 * 60 * 1000 }).catch(() => null);
  if (stale) {
    return {
      latitude: stale.coords.latitude,
      longitude: stale.coords.longitude,
      fromCache: true,
    };
  }

  return null;
}

export async function refineDeviceLocation(
  timeoutMs = 15_000,
): Promise<DeviceCoords | null> {
  const current = await withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: false,
    }),
    timeoutMs,
  );
  if (!current) return null;
  return {
    latitude: current.coords.latitude,
    longitude: current.coords.longitude,
    fromCache: false,
  };
}

export async function reverseGeocodeLabel(
  latitude: number,
  longitude: number,
): Promise<{ areaLabel: string; nearbyRows: { title: string; subtitle: string }[] }> {
  const geo = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(
    () => [] as Location.LocationGeocodedAddress[],
  );
  const g = geo[0];
  const areaLabel =
    [g?.name, g?.street, g?.district, g?.city].filter(Boolean).join(", ")
    || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  const rows: { title: string; subtitle: string }[] = [];
  if (g?.name && g.name !== areaLabel) {
    rows.push({ title: g.name, subtitle: [g.street, g.city].filter(Boolean).join(" · ") });
  }
  if (g?.street) {
    rows.push({ title: g.street, subtitle: [g.city, g.region].filter(Boolean).join(" · ") });
  }
  if (g?.city && !rows.some((r) => r.title === g.city)) {
    rows.push({ title: g.city ?? "Area", subtitle: g.region ?? "" });
  }
  if (g?.district && !rows.some((r) => r.title === g.district)) {
    rows.push({ title: g.district ?? "Nearby", subtitle: g.subregion ?? "" });
  }

  return { areaLabel, nearbyRows: rows.slice(0, 8) };
}
