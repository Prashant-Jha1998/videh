import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { safeJsonParse } from "./safeJson";

/** Profile blob in AsyncStorage (session token stored separately when possible). */
export const USER_PROFILE_STORAGE_KEY = "videh_user";
const SESSION_TOKEN_SECURE_KEY = "videh_session_token";

async function readSecureSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(SESSION_TOKEN_SECURE_KEY);
  } catch {
    return null;
  }
}

async function writeSecureSessionToken(token: string): Promise<void> {
  if (Platform.OS === "web" || !token) return;
  try {
    await SecureStore.setItemAsync(SESSION_TOKEN_SECURE_KEY, token);
  } catch {
    /* Keep AsyncStorage fallback — never force logout */
  }
}

async function deleteSecureSessionToken(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(SESSION_TOKEN_SECURE_KEY);
  } catch {
    /* ignore */
  }
}

/** Load signed-in user; migrates legacy AsyncStorage token into SecureStore once. */
export async function loadStoredUser<T extends { sessionToken?: string }>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (!raw) return null;
  const profile = safeJsonParse<T | null>(raw, null);
  if (!profile) return null;

  let token = await readSecureSessionToken();
  if (!token && profile.sessionToken) {
    token = profile.sessionToken;
    await writeSecureSessionToken(token);
  }
  if (token) {
    profile.sessionToken = token;
  }
  return profile;
}

/** Persist profile + session without clearing existing login. */
export async function persistStoredUser<T extends { sessionToken?: string }>(profile: T): Promise<void> {
  const token = profile.sessionToken;
  if (token) {
    await writeSecureSessionToken(token);
  }
  await AsyncStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export async function clearStoredUser(): Promise<void> {
  await deleteSecureSessionToken();
  await AsyncStorage.removeItem(USER_PROFILE_STORAGE_KEY);
}

/** Session token for background tasks (push, sync) — same source as AppContext. */
export async function getStoredSessionToken(): Promise<string | null> {
  const secure = await readSecureSessionToken();
  if (secure) return secure;
  const raw = await AsyncStorage.getItem(USER_PROFILE_STORAGE_KEY);
  const profile = safeJsonParse<{ sessionToken?: string } | null>(raw, null);
  const legacy = profile?.sessionToken ?? null;
  if (legacy) {
    await writeSecureSessionToken(legacy);
  }
  return legacy;
}
