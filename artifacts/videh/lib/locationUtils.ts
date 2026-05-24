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
  const result = await withTimeout(Location.requestForegroundPermissionsAsync(), 30_000);
  return result?.status === "granted";
}

export async function ensureLocationServicesEnabled(): Promise<boolean> {
  try {
    const has = await withTimeout(Location.hasServicesEnabledAsync(), 4000);
    if (has === true) return true;
    if (has === false && Platform.OS === "android") {
      await withTimeout(Location.enableNetworkProviderAsync(), 4000);
      const again = await withTimeout(Location.hasServicesEnabledAsync(), 3000);
      return again !== false;
    }
    return has !== false;
  } catch {
    return true;
  }
}

async function readLastKnown(maxAgeMs: number, timeoutMs = 3500): Promise<Location.LocationObject | null> {
  return withTimeout(Location.getLastKnownPositionAsync({ maxAge: maxAgeMs }), timeoutMs);
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

/** One-shot watch — helps when getCurrentPositionAsync never resolves on some Android builds. */
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
        distanceInterval: 1,
        timeInterval: 1000,
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
 * Videh-style: cached fix first (fast UI), then GPS / network, then stale cache.
 * Every native call is time-boxed so the screen cannot spin forever.
 */
export async function resolveDeviceLocation(opts?: {
  timeoutMs?: number;
  cachedMaxAgeMs?: number;
}): Promise<DeviceCoords | null> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const cachedMaxAgeMs = opts?.cachedMaxAgeMs ?? 10 * 60 * 1000;

  const recent = await readLastKnown(cachedMaxAgeMs);
  if (recent) return toCoords(recent, true);

  const lowAccuracy = Platform.OS === "android" ? Location.Accuracy.Low : Location.Accuracy.Balanced;

  const attempts = await Promise.all([
    readCurrentPosition(lowAccuracy, timeoutMs),
    watchOncePosition(timeoutMs),
  ]);
  for (const loc of attempts) {
    if (loc) return toCoords(loc, false);
  }

  const high = await readCurrentPosition(Location.Accuracy.Balanced, Math.min(timeoutMs, 8000));
  if (high) return toCoords(high, false);

  const stale = await readLastKnown(7 * 24 * 60 * 60 * 1000, 3500);
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
