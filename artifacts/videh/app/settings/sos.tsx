import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Linking
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useApp } from "@/context/AppContext";
import { getApiUrl } from "@/lib/api";

const BASE_URL = getApiUrl();
const MAX_SOS_CONTACTS = 5;

type SosContact = {
  id: number;
  contact_name: string;
  contact_phone: string | null;
  linked_name: string | null;
  linked_phone?: string | null;
};

export default function SosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useApp();

  const [contacts, setContacts] = useState<SosContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isHoldingSOS, setIsHoldingSOS] = useState(false);
  const [isTrackingLiveLocation, setIsTrackingLiveLocation] = useState(false);
  const [verifiedContactIds, setVerifiedContactIds] = useState<number[]>([]);
  const retryQueueKey = `videh_sos_retry_queue_${user?.dbId ?? "anon"}`;
  const verifiedKey = `videh_sos_verified_${user?.dbId ?? "anon"}`;
  const liveTrackerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const normalizePhone = (raw: string): string => raw.replace(/[^\d+]/g, "").trim();
  const validatePhone = (raw: string): boolean => {
    if (!raw.trim()) return true;
    const normalized = normalizePhone(raw);
    return /^\+?[1-9]\d{9,14}$/.test(normalized);
  };

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user.dbId}/contacts`);
      const d = await r.json();
      if (d.success) setContacts(d.contacts);
    } catch {}
    setLoading(false);
  }, [user?.dbId]);

  const queueRetryPayload = useCallback(async (payload: { latitude?: number; longitude?: number; createdAt: number }) => {
    const existingRaw = await AsyncStorage.getItem(retryQueueKey);
    const existing = existingRaw ? JSON.parse(existingRaw) as any[] : [];
    const next = [...existing, payload].slice(-20);
    await AsyncStorage.setItem(retryQueueKey, JSON.stringify(next));
  }, [retryQueueKey]);

  const processRetryQueue = useCallback(async () => {
    if (!user?.dbId) return;
    const raw = await AsyncStorage.getItem(retryQueueKey);
    const queue = raw ? JSON.parse(raw) as Array<{ latitude?: number; longitude?: number; createdAt: number }> : [];
    if (!queue.length) return;
    const remaining: typeof queue = [];
    for (const item of queue) {
      try {
        const resp = await fetch(`${BASE_URL}/api/sos/${user.dbId}/trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: item.latitude, longitude: item.longitude }),
        });
        const data = await resp.json();
        if (!data.success) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    await AsyncStorage.setItem(retryQueueKey, JSON.stringify(remaining));
  }, [retryQueueKey, user?.dbId]);

  useEffect(() => {
    load();
    if (user?.dbId) {
      AsyncStorage.getItem(verifiedKey).then((raw) => {
        const parsed = raw ? JSON.parse(raw) as number[] : [];
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
    if (!validatePhone(cPhone)) {
      Alert.alert("Invalid phone", "Enter a valid phone number in international format.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName: cName.trim(), contactPhone: normalizePhone(cPhone) || null }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setCName(""); setCPhone("");
        load();
      } else Alert.alert("Error", d.message);
    } catch { Alert.alert("Error", "Network error. Please try again."); }
    setSaving(false);
  };

  const removeContact = (id: number, name: string) => {
    Alert.alert("Remove contact?", `Remove ${name} from SOS contacts?`, [
      { text: "Remove", style: "destructive", onPress: async () => {
        await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts/${id}`, { method: "DELETE" });
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

  const triggerSOS = async () => {
    setShowSOS(false);
    setTriggering(true);
    let latitude: number | undefined;
    let longitude: number | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        if (Platform.OS === "android") {
          await Location.enableNetworkProviderAsync();
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      } else {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown) {
          latitude = lastKnown.coords.latitude;
          longitude = lastKnown.coords.longitude;
        }
      }
    } catch {}

    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user?.dbId}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });
      const d = await r.json();
      if (d.success) {
        // Primary path: backend sends SOS + location to Videh-linked contacts automatically.
        const smsFallbackNumbers = Array.isArray(d.smsFallbackNumbers) ? d.smsFallbackNumbers as string[] : [];
        const locationPart = latitude && longitude ? ` https://maps.google.com/?q=${latitude},${longitude}` : "";
        const sosMessage = `SOS ALERT: I need immediate help.${locationPart}`;
        // Secondary path: only non-Videh numbers get manual platform options.
        openSosFallbackOptions(smsFallbackNumbers, sosMessage);
        startLiveLocationUpdates();
        Alert.alert(
          "SOS sent",
          smsFallbackNumbers.length > 0
            ? `Emergency alert sent on Videh. You can now send fallback text on other platforms for ${smsFallbackNumbers.length} non-Videh contact(s).`
            : `Emergency alert delivered to ${d.sentTo} Videh contact(s).`
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
        });
        sentCount++;
      } catch {}
    }, 30000);
  }, [user?.dbId]);

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
        headers: { "Content-Type": "application/json" },
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
    const whatsappTarget = numbers[0].replace(/[^\d]/g, "");
    const whatsappUrl = `whatsapp://send?phone=${whatsappTarget}&text=${encodeURIComponent(message)}`;
    Alert.alert("Send emergency text", "Choose a platform", [
      {
        text: "SMS",
        onPress: () => {
          Linking.openURL(smsUrl).catch(() => Alert.alert("Error", "Could not open SMS app."));
        },
      },
      {
        text: "WhatsApp",
        onPress: () => {
          Linking.openURL(whatsappUrl).catch(() => Alert.alert("WhatsApp not found", "Please use SMS option."));
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
        <Ionicons name="shield-checkmark" size={32} color="#00A884" />
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
            <Text style={styles.sosBtnSub}>Press and hold to trigger alert</Text>
          </>
        )}
      </Pressable>

      {/* Contacts section */}
      <View style={styles.section}>
        {isTrackingLiveLocation && (
          <View style={styles.trackingBanner}>
            <Ionicons name="navigate" size={16} color="#00A884" />
            <Text style={styles.trackingText}>Live location updates running (every 30s)</Text>
            <Pressable onPress={stopLiveLocationUpdates}>
              <Text style={styles.stopTrackingText}>Stop</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Emergency Contacts ({contacts.length}/{MAX_SOS_CONTACTS})</Text>
          {contacts.length < MAX_SOS_CONTACTS && (
            <Pressable onPress={() => setShowAdd(true)}>
              <Ionicons name="add-circle" size={26} color="#00A884" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#00A884" />
        ) : contacts.length === 0 ? (
          <Pressable style={styles.addFirstBtn} onPress={() => setShowAdd(true)}>
            <Ionicons name="person-add" size={20} color="#00A884" />
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
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
        >
          <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
          <View style={[styles.modal, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mom, Dad, Brother"
              placeholderTextColor="#8D9BA3"
              value={cName}
              onChangeText={setCName}
              returnKeyType="next"
            />

            <Text style={styles.label}>Phone number (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="+91XXXXXXXXXX"
              placeholderTextColor="#8D9BA3"
              value={cPhone}
              onChangeText={setCPhone}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
            <Text style={styles.hint}>If this person uses Videh, they will receive push alert instantly.</Text>

            <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={addContact} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Add Contact</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SOS countdown modal */}
      <Modal visible={showSOS} animationType="fade" transparent>
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownBox}>
            <Text style={styles.countdownTitle}>🚨 SOS Alert</Text>
            <Text style={styles.countdownNum}>{countdown}</Text>
            <Text style={styles.countdownSub}>Alert will be sent to {contacts.length} contacts in seconds</Text>
            <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111B21" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: "#1F2C34", paddingHorizontal: 12, paddingVertical: 14, gap: 12 },
  backBtn: { },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
  infoCard: { backgroundColor: "#1F2C34", margin: 16, borderRadius: 14, padding: 20, alignItems: "center", gap: 10 },
  infoTitle: { color: "#E9EEF0", fontSize: 16, fontWeight: "700", textAlign: "center" },
  infoText: { color: "#8696A0", fontSize: 14, textAlign: "center", lineHeight: 20 },
  sosButton: { backgroundColor: "#E74C3C", marginHorizontal: 32, borderRadius: 100, aspectRatio: 1, alignItems: "center", justifyContent: "center", gap: 6, maxHeight: 180, alignSelf: "center", width: 180 },
  sosBtnTxt: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  sosBtnSub: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  section: { margin: 16, marginTop: 24 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { color: "#E9EEF0", fontSize: 16, fontWeight: "700" },
  addFirstBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1F2C34", borderRadius: 12, padding: 16 },
  addFirstTxt: { color: "#00A884", fontSize: 15, fontWeight: "600" },
  contactRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#1F2C34", borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  contactAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#2A3942", alignItems: "center", justifyContent: "center" },
  contactAvatarTxt: { color: "#fff", fontSize: 18, fontWeight: "700" },
  contactName: { color: "#E9EEF0", fontSize: 15, fontWeight: "600" },
  contactPhone: { color: "#8696A0", fontSize: 13 },
  linkedBadge: { color: "#00A884", fontSize: 12, fontWeight: "600" },
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  verifiedBadge: { color: "#7FD0BE", fontSize: 11, fontWeight: "600" },
  verifyBtn: { backgroundColor: "#00A88422", borderWidth: 1, borderColor: "#00A884", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  verifyBtnTxt: { color: "#00A884", fontSize: 12, fontWeight: "700" },
  trackingBanner: { backgroundColor: "#1F2C34", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  trackingText: { color: "#C5D2D8", fontSize: 12, flex: 1, flexShrink: 1, paddingRight: 8 },
  stopTrackingText: { color: "#E74C3C", fontSize: 12, fontWeight: "700" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1F2C34", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, position: "absolute", bottom: 0, left: 0, right: 0 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: "#2A3942", color: "#FFFFFF", borderRadius: 10, padding: 12, fontSize: 16, borderWidth: 1, borderColor: "#3C4B54" },
  hint: { color: "#8FA3AD", fontSize: 12, marginTop: 6, lineHeight: 18 },
  saveBtn: { backgroundColor: "#00A884", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 20 },
  saveBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  countdownOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center" },
  countdownBox: { backgroundColor: "#1F2C34", borderRadius: 20, padding: 32, alignItems: "center", gap: 12, width: 280 },
  countdownTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  countdownNum: { color: "#E74C3C", fontSize: 80, fontWeight: "900" },
  countdownSub: { color: "#8696A0", fontSize: 14, textAlign: "center" },
  cancelBtn: { backgroundColor: "#2A3942", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 8 },
  cancelBtnTxt: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
