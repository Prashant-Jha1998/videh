import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, Modal,
  StyleSheet, Alert, ActivityIndicator, Switch, Platform
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useApp } from "@/context/AppContext";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type SosContact = {
  id: number;
  contact_name: string;
  contact_phone: string | null;
  linked_name: string | null;
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

  const load = useCallback(async () => {
    if (!user?.dbId) return;
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user.dbId}/contacts`);
      const d = await r.json();
      if (d.success) setContacts(d.contacts);
    } catch {}
    setLoading(false);
  }, [user?.dbId]);

  useEffect(() => { load(); }, [load]);

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
      Alert.alert("Naam chahiye", "Contact ka naam daalein.");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName: cName.trim(), contactPhone: cPhone.trim() || null }),
      });
      const d = await r.json();
      if (d.success) {
        setShowAdd(false);
        setCName(""); setCPhone("");
        load();
      } else Alert.alert("Error", d.message);
    } catch { Alert.alert("Error", "Network error"); }
    setSaving(false);
  };

  const removeContact = (id: number, name: string) => {
    Alert.alert("Remove?", `${name} ko SOS list se hatao?`, [
      { text: "Haan", style: "destructive", onPress: async () => {
        await fetch(`${BASE_URL}/api/sos/${user?.dbId}/contacts/${id}`, { method: "DELETE" });
        load();
      }},
      { text: "Nahi" },
    ]);
  };

  const startCountdown = () => {
    if (contacts.length === 0) {
      Alert.alert("SOS Contacts nahi hain", "Pehle emergency contacts add karo.");
      return;
    }
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
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
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
        Alert.alert("SOS Bhej diya! 🚨", `${d.sentTo} emergency contacts ko message aur notification gaya.`);
      } else {
        Alert.alert("Error", "SOS send nahi hua.");
      }
    } catch { Alert.alert("Error", "Network error"); }
    setTriggering(false);
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
          SOS trigger karne par app automatically apni live location sab emergency contacts ko bhejega aur unhe Videh notification milegi.
        </Text>
      </View>

      {/* Big SOS button */}
      <Pressable
        style={[styles.sosButton, (contacts.length === 0 || triggering) && { opacity: 0.5 }]}
        onPress={startCountdown}
        disabled={contacts.length === 0 || triggering}
      >
        {triggering ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <>
            <Ionicons name="warning" size={40} color="#fff" />
            <Text style={styles.sosBtnTxt}>SOS BHEJO</Text>
            <Text style={styles.sosBtnSub}>Hold to send emergency alert</Text>
          </>
        )}
      </Pressable>

      {/* Contacts section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Emergency Contacts ({contacts.length}/5)</Text>
          {contacts.length < 5 && (
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
            <Text style={styles.addFirstTxt}>Emergency contact add karo</Text>
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
                {c.linked_name && <Text style={styles.linkedBadge}>✓ Videh user</Text>}
              </View>
              <Pressable onPress={() => removeContact(c.id, c.contact_name)}>
                <Ionicons name="close-circle" size={22} color="#E74C3C" />
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Add contact modal */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowAdd(false)} />
        <View style={[styles.modal, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>Emergency Contact Add Karo</Text>

          <Text style={styles.label}>Naam *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Maa, Papa, Bhai..."
            placeholderTextColor="#666"
            value={cName}
            onChangeText={setCName}
          />

          <Text style={styles.label}>Phone number (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="+91XXXXXXXXXX"
            placeholderTextColor="#666"
            value={cPhone}
            onChangeText={setCPhone}
            keyboardType="phone-pad"
          />
          <Text style={styles.hint}>Agar yeh Videh use karta hai toh unhe seedha notification milegi.</Text>

          <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={addContact} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Add Karo</Text>}
          </Pressable>
        </View>
      </Modal>

      {/* SOS countdown modal */}
      <Modal visible={showSOS} animationType="fade" transparent>
        <View style={styles.countdownOverlay}>
          <View style={styles.countdownBox}>
            <Text style={styles.countdownTitle}>🚨 SOS Alert</Text>
            <Text style={styles.countdownNum}>{countdown}</Text>
            <Text style={styles.countdownSub}>seconds mein {contacts.length} contacts ko alert milega</Text>
            <Pressable style={styles.cancelBtn} onPress={cancelSOS}>
              <Text style={styles.cancelBtnTxt}>Cancel Karo</Text>
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modal: { backgroundColor: "#1F2C34", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, position: "absolute", bottom: 0, left: 0, right: 0 },
  modalTitle: { color: "#fff", fontSize: 18, fontWeight: "700", marginBottom: 12 },
  label: { color: "#8696A0", fontSize: 13, marginBottom: 4, marginTop: 12 },
  input: { backgroundColor: "#2A3942", color: "#E9EEF0", borderRadius: 10, padding: 12, fontSize: 15 },
  hint: { color: "#555E65", fontSize: 12, marginTop: 6 },
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
