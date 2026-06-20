import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

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

/** Open app settings when permission is blocked. */
export function openAppLocationSettings(): void {
  void Linking.openSettings().catch(() => {});
}

export async function requestForegroundLocationPermission(): Promise<boolean> {
  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.status === "granted") return true;
    if (existing.status === "denied" && !existing.canAskAgain) return false;

    const requested = await withTimeout(Location.requestForegroundPermissionsAsync(), 20_000);
    return requested?.status === "granted";
  } catch {
    return false;
  }
}

export async function ensureLocationServicesEnabled(): Promise<boolean> {
  try {
    const enabled = await withTimeout(Location.hasServicesEnabledAsync(), 4000);
    return enabled !== false;
  } catch {
    return true;
  }
}

async function readLastKnown(maxAgeMs: number): Promise<Location.LocationObject | null> {
  try {
    return await withTimeout(Location.getLastKnownPositionAsync({ maxAge: maxAgeMs }), 4000);
  } catch {
    return null;
  }
}

async function readCurrentPosition(
  accuracy: Location.Accuracy,
  timeoutMs: number,
): Promise<Location.LocationObject | null> {
  return withTimeout(
    Location.getCurrentPositionAsync({
      accuracy,
      mayShowUserSettingsDialog: Platform.OS === "android",
    }),
    timeoutMs,
  );
}

/** Fallback when getCurrentPositionAsync never resolves (some Android builds). */
async function watchOncePosition(timeoutMs: number): Promise<Location.LocationObject | null> {
  if (Platform.OS === "web") return null;

  return new Promise((resolve) => {
    let sub: Location.LocationSubscription | null = null;
    let settled = false;

    const finish = (value: Location.LocationObject | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sub) void sub.remove();
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), timeoutMs);

    void Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 0,
        timeInterval: 500,
      },
      (loc) => finish(loc),
    )
      .then((subscription) => {
        sub = subscription;
      })
      .catch(() => finish(null));
  });
}

function toCoords(loc: Location.LocationObject, fromCache: boolean): DeviceCoords {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    fromCache,
  };
}

/**
 * WhatsApp-style: recent cache first (instant map), then GPS, then stale cache.
 */
export async function resolveDeviceLocation(opts?: {
  timeoutMs?: number;
  cachedMaxAgeMs?: number;
}): Promise<DeviceCoords | null> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const cachedMaxAgeMs = opts?.cachedMaxAgeMs ?? 10 * 60 * 1000;

  const recent = await readLastKnown(cachedMaxAgeMs);
  if (recent) return toCoords(recent, true);

  const balanced = await readCurrentPosition(Location.Accuracy.Balanced, timeoutMs);
  if (balanced) return toCoords(balanced, false);

  const watched = await watchOncePosition(Math.min(timeoutMs, 10_000));
  if (watched) return toCoords(watched, false);

  const low = await readCurrentPosition(
    Platform.OS === "android" ? Location.Accuracy.Low : Location.Accuracy.Lowest,
    Math.min(timeoutMs, 8000),
  );
  if (low) return toCoords(low, false);

  const stale = await readLastKnown(7 * 24 * 60 * 60 * 1000);
  if (stale) return toCoords(stale, true);

  return null;
}

export async function refineDeviceLocation(timeoutMs = 12_000): Promise<DeviceCoords | null> {
  const current = await readCurrentPosition(Location.Accuracy.High, timeoutMs);
  if (current) return toCoords(current, false);

  const watched = await watchOncePosition(Math.min(timeoutMs, 8000));
  if (watched) return toCoords(watched, false);

  return null;
}

export async function reverseGeocodeLabel(
  latitude: number,
  longitude: number,
): Promise<{ areaLabel: string; nearbyRows: { title: string; subtitle: string }[] }> {
  const geo = await withTimeout(
    Location.reverseGeocodeAsync({ latitude, longitude }),
    8000,
  ).then((r) => r ?? []);

  const g = geo[0];
  const areaLabel =
    [g?.name, g?.street, g?.district, g?.city].filter(Boolean).join(", ")
    || "Near your location";

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
