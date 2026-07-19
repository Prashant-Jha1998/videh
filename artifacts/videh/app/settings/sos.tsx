import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, Modal, FlatList,
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Linking
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Contacts from "expo-contacts";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";
import { DismissibleModal } from "@/components/DismissibleModal";
import { safeJsonParse } from "@/lib/safeJson";
import { normalizePhone } from "@/lib/videhContacts";

const BASE_URL = getApiUrl();
const MAX_SOS_CONTACTS = 5;

type SosContact = {
  id: number;
  contact_name: string;
  contact_phone: string | null;
  linked_name: string | null;
  linked_phone?: string | null;
};

type DevicePickRow = {
  id: string;
  name: string;
  phoneLocal: string;
  phoneE164: string;
};

/** Extract exactly 10 Indian mobile digits for SOS (+91XXXXXXXXXX). */
function toSosLocal10(raw: string): string | null {
  const normalized = normalizePhone(raw.trim());
  const digits = normalized.replace(/\D/g, "");
  let local = digits;
  if (digits.startsWith("91") && digits.length === 12) local = digits.slice(2);
  else if (digits.startsWith("0") && digits.length === 11) local = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(local)) return local;
  return null;
}

function toSosE164(local10: string): string {
  return `+91${local10}`;
}

export default function SosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [contacts, setContacts] = useState<SosContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [cName, setCName] = useState("");
  const [cPhoneLocal, setCPhoneLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<DevicePickRow[]>([]);
  const [deviceContactsLoading, setDeviceContactsLoading] = useState(false);
  const [deviceContactSearch, setDeviceContactSearch] = useState("");
  const [triggering, setTriggering] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isHoldingSOS, setIsHoldingSOS] = useState(false);
  const [isTrackingLiveLocation, setIsTrackingLiveLocation] = useState(false);
  const [verifiedContactIds, setVerifiedContactIds] = useState<number[]>([]);
  const retryQueueKey = `videh_sos_retry_queue_${user?.dbId ?? "anon"}`;
  const verifiedKey = `videh_sos_verified_${user?.dbId ?? "anon"}`;
  const liveTrackerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const authHeaders = useCallback(
    (withJson = false): Record<string, string> => ({
      ...(withJson ? { "Content-Type": "application/json" } : {}),
      ...(user?.sessionToken ? { Authorization: `Bearer ${user.sessionToken}` } : {}),
    }),
    [user?.sessionToken],
  );

  const normalizePhoneInput = (raw: string): string => raw.replace(/\D/g, "").slice(0, 10);
  const validatePhoneLocal = (local: string): boolean => /^[6-9]\d{9}$/.test(local);

  const applyPickedContact = (name: string, phoneRaw: string) => {
    const local = toSosLocal10(phoneRaw);
    if (!local) {
      Alert.alert(
        "Invalid number",
        "SOS contacts need an Indian mobile number: +91 followed by exactly 10 digits.",
      );
      return false;
    }
    setCName(name.trim() || local);
    setCPhoneLocal(local);
    return true;
  };

  const pickFromDeviceContacts = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Pick a contact from the mobile app.");
      return;
    }
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Allow Contacts access to pick an emergency contact.");
        return;
      }
      const picker = (Contacts as { presentContactPickerAsync?: () => Promise<Contacts.ExistingContact | null> })
        .presentContactPickerAsync;
      if (typeof picker === "function") {
        const picked = await picker();
        if (!picked) return;
        const phoneRaw = picked.phoneNumbers?.[0]?.number ?? "";
        const name = [picked.name, picked.firstName, picked.lastName].filter(Boolean).join(" ").trim()
          || picked.phoneNumbers?.[0]?.number
          || "Contact";
        applyPickedContact(name, phoneRaw);
        return;
      }
      setDeviceContactSearch("");
      setShowDevicePicker(true);
      setDeviceContactsLoading(true);
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
      });
      const rows: DevicePickRow[] = [];
      const seen = new Set<string>();
      for (const c of data) {
        if (!c.phoneNumbers?.length) continue;
        for (const pn of c.phoneNumbers) {
          const local = toSosLocal10(pn.number ?? "");
          if (!local || seen.has(local)) continue;
          seen.add(local);
          const name = (c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || local).trim();
          rows.push({
            id: `${c.id ?? local}-${local}`,
            name,
            phoneLocal: local,
            phoneE164: toSosE164(local),
          });
        }
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setDeviceContacts(rows);
    } catch {
      Alert.alert("Error", "Could not open contacts.");
    } finally {
      setDeviceContactsLoading(false);
    }
  };

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user.dbId}/contacts`, {
        headers: authHeaders(),
      });
      const d = await r.json();
      if (d.success) setContacts(d.contacts);
    } catch {}
    setLoading(false);
  }, [user?.dbId, authHeaders]);

  const queueRetryPayload = useCallback(async (payload: { latitude?: number; longitude?: number; createdAt: number }) => {
    const existingRaw = await AsyncStorage.getItem(retryQueueKey);
    const existing = safeJsonParse<any[]>(existingRaw, []);
    const next = [...existing, payload].slice(-20);
    await AsyncStorage.setItem(retryQueueKey, JSON.stringify(next));
  }, [retryQueueKey]);

  const processRetryQueue = useCallback(async () => {
    if (!user?.dbId) return;
    const raw = await AsyncStorage.getItem(retryQueueKey);
    const queue = safeJsonParse<Array<{ latitude?: number; longitude?: number; createdAt: number }>>(raw, []);
    if (!queue.length) return;
    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        const resp = await fetch(`${BASE_URL}/api/sos/${user.dbId}/trigger`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ latitude: item.latitude, longitude: item.longitude }),
        });
        const data = await resp.json();
        if (!data.success) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    await AsyncStorage.setItem(retryQueueKey, JSON.stringify(remaining));
  }, [retryQueueKey, user?.dbId, authHeaders]);

  useEffect(() => {
    load();
    if (user?.dbId) {
      AsyncStorage.getItem(verifiedKey).then((raw) => {
        const parsed = safeJsonParse<number[]>(raw, []);
        setVerifiedContactIds(parsed);
      }).catch(() => {});
      processRetryQueue();
    }
  }, [load, processRetryQueue, user?.dbId, verifiedKey]);

  useEffect(() => {
    const timer = setInterval(() => { void processRetryQueue(); }, 30000);
    return () => clearInterval(timer);
  }, [processRetryQueue]);

  // Countdown timer for SOS trigger
  useEffect(() => {
    if (countdown <= 0) return;
    if (countdown === 1) {
      triggerSOS();
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const addContact = async () => {
    if (!cName.trim()) {
      Alert.alert("Name required", "Please enter a contact name.");
      return;
    }
    if (contacts.length >= MAX_SOS_CONTACTS) {
      Alert.alert("Limit reached", `You can add up to ${MAX_SOS_CONTACTS} emergency contacts.`);
      return;
    }
    if (!validatePhoneLocal(cPhoneLocal)) {
      Alert.alert(
        "Invalid phone",
        "Enter exactly 10 digits after +91 (Indian mobile). Example: 9876543210",
      );
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          contactName: cName.trim(),
          contactPhone: toSosE164(cPhoneLocal),
        }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setCName("");
        setCPhoneLocal("");
        load();
        if (d.linked) {
          Alert.alert("Added", `${cName.trim()} is on Videh — they will get SOS and your location in chat.`);
        }
      } else Alert.alert("Error", d.message);
    } catch { Alert.alert("Error", "Network error. Please try again."); }
    setSaving(false);
  };

  const removeContact = (id: number, name: string) => {
    Alert.alert("Remove contact?", `Remove ${name} from SOS contacts?`, [
      { text: "Remove", style: "destructive", onPress: async () => {
        await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts/${id}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        load();
      }},
      { text: "Cancel" },
    ]);
  };

  const startCountdown = async () => {
    if (contacts.length === 0) {
      Alert.alert("No SOS contacts", "Add at least one emergency contact first.");
      return;
    }
    if (triggering) return;
    setIsHoldingSOS(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setIsHoldingSOS(false);
    // Hold-to-confirm
    if (triggering) return;
    setShowSOS(true);
    setCountdown(5);
  };

  const cancelSOS = () => {
    setCountdown(0);
    setShowSOS(false);
  };

  const resolveSosCoordinates = async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
        }
        return null;
      }
      if (Platform.OS === "android") {
        await Location.enableNetworkProviderAsync().catch(() => {});
      }
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      } catch {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const triggerSOS = async () => {
    setShowSOS(false);
    setTriggering(true);
    const coords = await resolveSosCoordinates();
    const latitude = coords?.latitude;
    const longitude = coords?.longitude;

    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user?.dbId}/trigger`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ latitude, longitude }),
      });
      const d = await r.json() as {
        success?: boolean;
        message?: string;
        sentTo?: number;
        smsFallbackNumbers?: string[];
        locationIncluded?: boolean;
      };
      if (d.success) {
        // Primary path: backend sends SOS text + location bubble to Videh-linked contacts.
        const smsFallbackNumbers = Array.isArray(d.smsFallbackNumbers) ? d.smsFallbackNumbers : [];
        const locationPart = latitude != null && longitude != null
          ? ` https://maps.google.com/?q=${latitude},${longitude}`
          : "";
        const sosMessage = `SOS ALERT: I need immediate help.${locationPart}`;
        // Secondary path: only non-Videh numbers get manual platform options.
        openSosFallbackOptions(smsFallbackNumbers, sosMessage);
        if (d.locationIncluded) {
          startLiveLocationUpdates();
        }
        const baseMsg = smsFallbackNumbers.length > 0
          ? `Emergency alert sent on Videh. You can now send fallback text on other platforms for ${smsFallbackNumbers.length} non-Videh contact(s).`
          : `Emergency alert delivered to ${d.sentTo ?? 0} Videh contact(s).`;
        Alert.alert(
          "SOS sent",
          d.locationIncluded
            ? `${baseMsg}\n\n📍 Live location was shared in chat.`
            : `${baseMsg}\n\n⚠️ Location could not be attached. Enable GPS and try again so contacts get your map pin.`,
        );
      } else {
        Alert.alert("Error", d.message ?? "Failed to send SOS alert.");
      }
    } catch {
      await queueRetryPayload({ latitude, longitude, createdAt: Date.now() });
      Alert.alert("Queued", "Network unavailable. SOS was queued and will retry automatically.");
    }
    setTriggering(false);
  };

  const startLiveLocationUpdates = useCallback(async () => {
    if (liveTrackerRef.current || !user?.dbId) return;
    setIsTrackingLiveLocation(true);
    let sentCount = 0;
    liveTrackerRef.current = setInterval(async () => {
      if (!user?.dbId) return;
      if (sentCount >= 10) {
        if (liveTrackerRef.current) clearInterval(liveTrackerRef.current);
        liveTrackerRef.current = null;
        setIsTrackingLiveLocation(false);
        return;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await fetch(`${BASE_URL}/api/sos/${user.dbId}/location-update`, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
        });
        sentCount++;
      } catch {}
    }, 30000);
  }, [user?.dbId, authHeaders]);

  const stopLiveLocationUpdates = () => {
    if (liveTrackerRef.current) clearInterval(liveTrackerRef.current);
    liveTrackerRef.current = null;
    setIsTrackingLiveLocation(false);
  };

  useEffect(() => () => stopLiveLocationUpdates(), []);

  const verifyTrustedContact = async (contact: SosContact) => {
    if (!user?.dbId) return;
    try {
      const resp = await fetch(`${BASE_URL}/api/sos/${user.dbId}/contacts/${contact.id}/verify`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await resp.json();
      if (!data.success) {
        Alert.alert("Verification failed", data.message ?? "Could not send verification request.");
        return;
      }
      const next = Array.from(new Set([...verifiedContactIds, contact.id]));
      setVerifiedContactIds(next);
      await AsyncStorage.setItem(verifiedKey, JSON.stringify(next));
      Alert.alert("Verification sent", `Trusted verification request sent to ${contact.contact_name}.`);
    } catch {
      Alert.alert("Verification failed", "Network error while sending verification request.");
    }
  };

  const openSosFallbackOptions = (numbers: string[], message: string) => {
    if (!numbers.length) return;
    const smsUrl = `sms:${numbers.join(",")}?body=${encodeURIComponent(message)}`;
    Alert.alert("Send emergency text", "Choose how to send", [
      {
        text: "SMS",
        onPress: () => {
          Linking.openURL(smsUrl).catch(() => Alert.alert("Error", "Could not open SMS app."));
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>🚨 SOS Safety</Text>
      </View>

      {/* Info card */}
      <View style={styles.infoCard}>
        <Ionicons name="shield-checkmark" size={32} color="#059669" />
        <Text style={styles.infoTitle}>Emergency Safety Feature</Text>
        <Text style={styles.infoText}>
          Press and hold SOS to send an emergency alert. Your latest location is shared with all emergency contacts.
        </Text>
      </View>

      {/* Big SOS button */}
      <Pressable
        style={[
          styles.sosButton,
          (contacts.length === 0 || triggering) && { opacity: 0.5 },
          isHoldingSOS && { transform: [{ scale: 0.96 }] },
        ]}
        onPressIn={startCountdown}
        onPressOut={() => setIsHoldingSOS(false)}
        disabled={contacts.length === 0 || triggering}
      >
        {triggering ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <Ionicons name="warning" size={40} color="#fff" />
            <Text style={styles.sosBtnTxt}>SEND SOS</Text>
            <Text style={styles.sosBtnSub} numberOfLines={2}>Press and hold to trigger alert</Text>
          </>
        )}
      </Pressable>

      {/* Contacts section */}
      <View style={styles.section}>
        {isTrackingLiveLocation && (
          <View style={styles.trackingBanner}>
            <Ionicons name="navigate" size={16} color="#059669" />
            <Text style={styles.trackingText}>Live location updates running (every 30s)</Text>
            <Pressable onPress={stopLiveLocationUpdates}>
              <Text style={styles.stopTrackingText}>Stop</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Emergency Contacts ({contacts.length}/{MAX_SOS_CONTACTS})</Text>
          {contacts.length < MAX_SOS_CONTACTS && (
            <Pressable onPress={() => { setCName(""); setCPhoneLocal(""); setShowAdd(true); }}>
              <Ionicons name="add-circle" size={26} color="#059669" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#059669" />
        ) : contacts.length === 0 ? (
          <Pressable style={styles.addFirstBtn} onPress={() => { setCName(""); setCPhoneLocal(""); setShowAdd(true); }}>
            <Ionicons name="person-add" size={20} color="#059669" />
            <Text style={styles.addFirstTxt}>Add emergency contact</Text>
          </Pressable>
        ) : (
          contacts.map((c) => (
            <View key={c.id} style={styles.contactRow}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarTxt}>{c.contact_name[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.contact_name}</Text>
                {c.contact_phone && <Text style={styles.contactPhone}>{c.contact_phone}</Text>}
                {c.linked_name && (
                  <View style={styles.inlineRow}>
                    <Text style={styles.linkedBadge}>✓ Videh user</Text>
                    {verifiedContactIds.includes(c.id) && <Text style={styles.verifiedBadge}>Trusted verified</Text>}
                  </View>
                )}
              </View>
              {c.linked_name && !verifiedContactIds.includes(c.id) && (
                <Pressable style={styles.verifyBtn} onPress={() => verifyTrustedContact(c)}>
                  <Text style={styles.verifyBtnTxt}>Verify</Text>
                </Pressable>
              )}
              <Pressable onPress={() => removeContact(c.id, c.contact_name)}>
                <Ionicons name="close-circle" size={22} color="#E74C3C" />
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Add contact modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1 }}>
          <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: "flex-end" }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            pointerEvents="box-none"
          >
          <View style={[styles.modal, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <Pressable style={styles.pickContactBtn} onPress={() => { void pickFromDeviceContacts(); }}>
              <Ionicons name="people-outline" size={20} color="#059669" />
              <Text style={styles.pickContactBtnTxt}>Pick from contacts</Text>
            </Pressable>
            <Text style={styles.orDivider}>or enter number manually</Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mom, Dad, Brother"
              placeholderTextColor="#8D9BA3"
              value={cName}
              onChangeText={setCName}
              returnKeyType="next"
            />

            <Text style={styles.label}>Phone number *</Text>
            <View style={styles.phoneRow}>
              <View style={styles.phonePrefix}>
                <Text style={styles.phonePrefixTxt}>+91</Text>
              </View>
              <TextInput
                style={[styles.input, styles.phoneInput]}
                placeholder="10-digit mobile"
                placeholderTextColor="#8D9BA3"
                value={cPhoneLocal}
                onChangeText={(t) => setCPhoneLocal(normalizePhoneInput(t))}
                keyboardType="number-pad"
                maxLength={10}
                returnKeyType="done"
              />
            </View>
            <Text style={styles.hint}>
              Exactly 10 digits after +91. If they use Videh, they get your SOS and live location in chat.
            </Text>

            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={addContact} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Add Contact</Text>}
            </Pressable>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Device contact picker (fallback when system picker unavailable) */}
      <Modal
        visible={showDevicePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDevicePicker(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={styles.overlay} onPress={() => setShowDevicePicker(false)} />
          <View style={[styles.pickerModal, { paddingBottom: insets.bottom + 12, paddingTop: insets.top + 8 }]}>
            <View style={styles.pickerHeader}>
              <Text style={styles.modalTitle}>Pick a contact</Text>
              <Pressable onPress={() => setShowDevicePicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { marginBottom: 10 }]}
              placeholder="Search name or number"
              placeholderTextColor="#8D9BA3"
              value={deviceContactSearch}
              onChangeText={setDeviceContactSearch}
            />
            {deviceContactsLoading ? (
              <ActivityIndicator color="#059669" style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={deviceContacts.filter((c) => {
                  const q = deviceContactSearch.trim().toLowerCase();
                  if (!q) return true;
                  return c.name.toLowerCase().includes(q) || c.phoneLocal.includes(q);
                })}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={[styles.hint, { textAlign: "center", marginTop: 24 }]}>
                    No Indian mobile numbers found in contacts.
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.deviceContactRow}
                    onPress={() => {
                      setCName(item.name);
                      setCPhoneLocal(item.phoneLocal);
                      setShowDevicePicker(false);
                    }}
                  >
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactAvatarTxt}>{item.name[0]?.toUpperCase() ?? "?"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactName}>{item.name}</Text>
                      <Text style={styles.contactPhone}>{item.phoneE164}</Text>
                    </View>
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* SOS countdown modal — back / tap scrim dismiss */}
      <DismissibleModal visible={showSOS} onClose={cancelSOS} animationType="fade" backdropOpacity={0.82}>
        <View style={styles.countdownCenter}>
          <View style={styles.countdownBox}>
            <Text style={styles.countdownTitle}>🚨 SOS Alert</Text>
            <Text style={styles.countdownNum}>{countdown}</Text>
            <Text style={styles.countdownSub}>Alert will be sent to {contacts.length} contacts in seconds</Text>
            <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </DismissibleModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#14131F" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E1D2E", paddingHorizontal: 12, paddingVertical: 14, gap: 12 },
  backBtn: { },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  infoCard: { backgroundColor: "#1E1D2E", margin: 16, borderRadius: 14, padding: 20, alignItems: "center", gap: 10 },
  infoTitle: { color: "#E9EEF0", fontSize: 16, fontWeight: "700", textAlign: "center" },
  infoText: { color: "#8696A0", fontSize: 14, textAlign: "center", lineHeight: 20 },
  sosButton: { backgroundColor: "#E74C3C", marginHorizontal: 32, borderRadius: 100, aspectRatio: 1, alignItems: "center", justifyContent: "center", gap: 5, maxHeight: 180, alignSelf: "center", width: 180, paddingHorizontal: 18 },
  sosBtnTxt: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  sosBtnSub: { color: "rgba(255,255,255,0.82)", fontSize: 10, lineHeight: 13, textAlign: "center", width: "100%", paddingHorizontal: 8 },
  section: { margin: 16, marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: "#E9EEF0", fontSize: 16, fontWeight: "700" },
  addFirstBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1E1D2E", borderRadius: 12, padding: 16 },
  addFirstTxt: { color: "#059669", fontSize: 15, fontWeight: "600" },
  contactRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1E1D2E", borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  contactAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#2A2838", alignItems: "center", justifyContent: "center" },
  contactAvatarTxt: { color: "#fff", fontSize: 18, fontWeight: "700" },
  contactName: { color: "#E9EEF0", fontSize: 15, fontWeight: "600" },
  contactPhone: { color: "#8696A0", fontSize: 13 },
  linkedBadge: { color: "#059669", fontSize: 12, fontWeight: "600" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  verifiedBadge: { color: "#7FD0BE", fontSize: 11, fontWeight: "600" },
  verifyBtn: { backgroundColor: "#05966922", borderWidth: 1, borderColor: "#059669", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  verifyBtnTxt: { color: "#059669", fontSize: 12, fontWeight: "700" },
  trackingBanner: { backgroundColor: "#1E1D2E", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  trackingText: { color: "#C5D2D8", fontSize: 12, flex: 1, flexShrink: 1, paddingRight: 8 },
  stopTrackingText: { color: "#E74C3C", fontSize: 12, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1E1D2E", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, position: "absolute", bottom: 0, left: 0, right: 0 },
  pickerModal: { flex: 1, backgroundColor: "#1E1D2E", marginTop: 48, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  pickContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#05966922",
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  pickContactBtnTxt: { color: "#059669", fontSize: 15, fontWeight: "700" },
  orDivider: { color: "#8FA3AD", fontSize: 12, textAlign: "center", marginBottom: 4 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: "#2A2838", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: "#3C4B54" },
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phonePrefix: {
    backgroundColor: "#2A2838",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3C4B54",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  phonePrefixTxt: { color: "#E9EEF0", fontSize: 16, fontWeight: "700" },
  phoneInput: { flex: 1 },
  deviceContactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2838",
  },
  hint: { color: "#8FA3AD", fontSize: 12, marginTop: 6, lineHeight: 18 },
  saveBtn: { backgroundColor: "#059669", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  countdownCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  countdownBox: { backgroundColor: "#1E1D2E", borderRadius: 20, padding: 32, alignItems: "center", gap: 12, width: 280 },
  countdownTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  countdownNum: { color: "#E74C3C", fontSize: 80, fontWeight: "900" },
  countdownSub: { color: "#8696A0", fontSize: 14, textAlign: "center" },
  cancelBtn: { backgroundColor: "#2A2838", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 8 },
  cancelBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
